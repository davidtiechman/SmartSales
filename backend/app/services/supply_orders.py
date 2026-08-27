from datetime import datetime, timezone
from email.message import EmailMessage
from html import escape
import smtplib

import resend

from backend.app.core.settings import (
    OWNER_EMAIL,
    PRODUCT_NAMES_TABLE,
    PRODUCT_VARIANTS_TABLE,
    RESEND_API_KEY,
    SMTP_FROM_EMAIL,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USERNAME,
    STOCK_TRANSFERS_TABLE,
    SUPPLY_ORDER_ITEMS_TABLE,
    SUPPLY_ORDERS_TABLE,
)
from backend.app.core.timing import timed_action
from backend.app.db.supabase import get_supabase_admin
from backend.app.schemas.supply_orders import SupplyOrderApprove, SupplyOrderCreate, SupplyOrderUpdate
from backend.app.services.agents import resolve_active_agent


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


class SupplyOrderValidationError(ValueError):
    pass


def format_supply_order_item(item):
    return f"{item.category} / {item.product_name} / מידה {item.size}"


def resolve_variant(item):
    supabase = get_supabase_admin()
    with timed_action("supply-order product lookup"):
        product_response = (
            supabase
            .table(PRODUCT_NAMES_TABLE)
            .select("product_id, category, product_name")
            .eq("category", item.category)
            .eq("product_name", item.product_name)
            .limit(1)
            .execute()
        )
    if getattr(product_response, "error", None):
        raise RuntimeError(product_response.error.message)

    product = (product_response.data or [None])[0]
    if not product:
        raise SupplyOrderValidationError(f"מוצר לא קיים בקטלוג: {format_supply_order_item(item)}")

    with timed_action("supply-order variant lookup"):
        variant_response = (
            supabase
            .table(PRODUCT_VARIANTS_TABLE)
            .select("variant_id, product_id, size")
            .eq("product_id", product["product_id"])
            .eq("size", item.size)
            .limit(1)
            .execute()
        )
    if getattr(variant_response, "error", None):
        raise RuntimeError(variant_response.error.message)

    variant = (variant_response.data or [None])[0]
    if not variant:
        raise SupplyOrderValidationError(f"מידה לא קיימת בקטלוג: {format_supply_order_item(item)}")

    return product, variant


def create_supply_order(payload: SupplyOrderCreate, agent_user_id=None, send_email=True):
    supabase = get_supabase_admin()
    if agent_user_id is None:
        with timed_action("supply-order active-agent check"):
            agent_user_id = resolve_active_agent(payload.agent_name)["id"]

    with timed_action("supply-order items resolve"):
        item_rows = build_supply_order_item_rows(payload.items)

    order_payload = {
        "user_id": agent_user_id,
        "agent_name": payload.agent_name,
        "status": "submitted",
        "notes": payload.notes,
    }
    with timed_action("supply-order insert"):
        order_response = supabase.table(SUPPLY_ORDERS_TABLE).insert(order_payload).execute()
    if getattr(order_response, "error", None):
        raise RuntimeError(order_response.error.message)

    order = (order_response.data or [None])[0]
    if not order:
        raise RuntimeError("Supply order was not returned from database")

    item_rows = [{**item, "order_id": order["order_id"]} for item in item_rows]

    with timed_action("supply-order items insert"):
        items_response = supabase.table(SUPPLY_ORDER_ITEMS_TABLE).insert(item_rows).execute()
    if getattr(items_response, "error", None):
        raise RuntimeError(items_response.error.message)

    items = items_response.data or item_rows
    if not send_email:
        return {"order": order, "items": items, "email": {"pending": True}}

    email_result = process_supply_order_owner_email(order, items)
    updated_order = {**order, **email_status_payload(email_result)}
    return {"order": updated_order, "items": items, "email": email_result}


def build_supply_order_item_rows(items):
    item_rows = []
    missing_items = []
    for item in items:
        try:
            product, variant = resolve_variant(item)
        except SupplyOrderValidationError as exc:
            missing_items.append(str(exc))
            continue
        item_rows.append(
            {
                "product_id": product["product_id"],
                "variant_id": variant["variant_id"],
                "category": item.category,
                "product_name": item.product_name,
                "size": item.size,
                "quantity": item.quantity,
                "notes": item.notes,
            }
        )
    if missing_items:
        raise SupplyOrderValidationError("לא ניתן לשמור את ההזמנה. צריך למחוק מההזמנה: " + "; ".join(missing_items))
    return item_rows


def update_supply_order(order_id: int, payload: SupplyOrderUpdate, allowed_agent_name: str | None = None):
    supabase = get_supabase_admin()
    with timed_action("supply-order update order lookup"):
        order_response = (
            supabase.table(SUPPLY_ORDERS_TABLE)
            .select("*")
            .eq("order_id", order_id)
            .limit(1)
            .execute()
        )
    if getattr(order_response, "error", None):
        raise RuntimeError(order_response.error.message)

    order = (order_response.data or [None])[0]
    if not order:
        raise LookupError("Supply order not found")
    if allowed_agent_name and order.get("agent_name") != allowed_agent_name:
        raise PermissionError("Agent access denied")
    if order.get("status") != "submitted":
        raise RuntimeError("Only pending supply orders can be edited")

    with timed_action("supply-order update items resolve"):
        item_rows = build_supply_order_item_rows(payload.items)
        item_rows = [{**item, "order_id": order_id} for item in item_rows]

    with timed_action("supply-order update old items delete"):
        delete_response = (
            supabase.table(SUPPLY_ORDER_ITEMS_TABLE)
            .delete()
            .eq("order_id", order_id)
            .execute()
        )
    if getattr(delete_response, "error", None):
        raise RuntimeError(delete_response.error.message)

    with timed_action("supply-order update new items insert"):
        items_response = supabase.table(SUPPLY_ORDER_ITEMS_TABLE).insert(item_rows).execute()
    if getattr(items_response, "error", None):
        raise RuntimeError(items_response.error.message)

    with timed_action("supply-order update timestamp"):
        update_response = (
            supabase.table(SUPPLY_ORDERS_TABLE)
            .update({"notes": payload.notes, "updated_at": utc_now_iso()})
            .eq("order_id", order_id)
            .execute()
        )
    if getattr(update_response, "error", None):
        raise RuntimeError(update_response.error.message)

    return {
        "order": (update_response.data or [order])[0],
        "items": items_response.data or item_rows,
    }


def process_supply_order_owner_email(order, items):
    with timed_action("supply-order owner email send"):
        email_result = send_owner_order_email(order, items)

    with timed_action("supply-order email status update"):
        update_supply_order_email_status(order["order_id"], email_result)

    return email_result


def email_status_payload(email_result):
    return {
        "email_sent_at": utc_now_iso() if email_result["sent"] else None,
        "email_error": None if email_result["sent"] else email_result["error"],
        "updated_at": utc_now_iso(),
    }


def update_supply_order_email_status(order_id, email_result):
    update_response = (
        get_supabase_admin()
        .table(SUPPLY_ORDERS_TABLE)
        .update(email_status_payload(email_result))
        .eq("order_id", order_id)
        .execute()
    )
    if getattr(update_response, "error", None):
        raise RuntimeError(update_response.error.message)
    return update_response.data


def send_owner_order_email(order, items):
    if RESEND_API_KEY:
        return send_owner_order_email_resend(order, items)
    return send_owner_order_email_smtp(order, items)


def compare_size(value):
    text = str(value or "")
    try:
        return (0, float(text))
    except ValueError:
        return (1, text)


def build_order_matrix(items):
    categories = {}
    for item in items:
        category = item.get("category") or ""
        product_name = item.get("product_name") or ""
        size = item.get("size") or ""
        category_group = categories.setdefault(category, {"sizes": set(), "rows": {}})
        category_group["sizes"].add(size)
        row = category_group["rows"].setdefault(
            product_name,
            {"quantities": {}, "notes": ""},
        )
        row["quantities"][size] = int(row["quantities"].get(size) or 0) + int(item.get("quantity") or 0)
        if not row["notes"] and item.get("notes"):
            row["notes"] = item.get("notes")
    return categories


def build_order_email_content(order, items):
    total_quantity = sum(int(item.get("quantity") or 0) for item in items)
    subject = f"Supply order #{order['order_id']} from {order.get('agent_name')}"
    missing = [
        name for name, value in {"OWNER_EMAIL": OWNER_EMAIL, "SMTP_FROM_EMAIL": SMTP_FROM_EMAIL}.items() if not value
    ]

    lines = [
        f"New supply order #{order['order_id']}",
        f"Agent: {order.get('agent_name')}",
        f"Total quantity: {total_quantity}",
        "",
        "Items:",
    ]
    for item in items:
        note = f" | {item.get('notes')}" if item.get("notes") else ""
        lines.append(
            f"- {item.get('category')} / {item.get('product_name')} / "
            f"{item.get('size')} x {item.get('quantity')}{note}"
        )
    if order.get("notes"):
        lines.extend(["", f"Order note: {order.get('notes')}"])

    matrix_sections = []
    for category, group in build_order_matrix(items).items():
        sizes = sorted(group["sizes"], key=compare_size)
        header_cells = "".join(f"<th>{escape(str(size))}</th>" for size in sizes)
        rows = []
        for product_name, row in group["rows"].items():
            quantity_cells = "".join(
                f"<td>{escape(str(row['quantities'].get(size) or ''))}</td>"
                for size in sizes
            )
            rows.append(
                "<tr>"
                f"<td>{escape(str(product_name))}</td>"
                f"{quantity_cells}"
                f"<td>{escape(str(row.get('notes') or ''))}</td>"
                "</tr>"
            )
        matrix_sections.append(
            f"""
            <h2 style="margin: 24px 0 8px;">{escape(str(category))}</h2>
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; direction: rtl;">
              <thead>
                <tr>
                  <th>מוצר</th>
                  {header_cells}
                  <th>הערות</th>
                </tr>
              </thead>
              <tbody>
                {''.join(rows)}
              </tbody>
            </table>
            """
        )

    order_note_html = (
        f"""
        <div style="margin: 16px 0; padding: 12px; background: #fff8d8; border: 1px solid #eadb8f;">
          <strong>הערה להזמנה:</strong><br />
          {escape(str(order.get("notes") or ""))}
        </div>
        """
        if order.get("notes")
        else ""
    )
    html = f"""
    <div dir="rtl" style="font-family: Arial, sans-serif; color: #35201f;">
      <h1>התקבלה הזמנת סחורה חדשה</h1>
      <p><strong>מספר הזמנה:</strong> {escape(str(order["order_id"]))}</p>
      <p><strong>סוכן:</strong> {escape(str(order.get("agent_name") or ""))}</p>
      <p><strong>סה"כ פריטים:</strong> {total_quantity}</p>
      {order_note_html}
      {''.join(matrix_sections)}
    </div>
    """
    return subject, "\n".join(lines), html, missing


def send_owner_order_email_resend(order, items):
    subject, text, html, missing = build_order_email_content(order, items)
    missing = [*missing, *(["RESEND_API_KEY"] if not RESEND_API_KEY else [])]
    if missing:
        return {"sent": False, "error": f"Missing email settings: {', '.join(missing)}"}

    resend.api_key = RESEND_API_KEY
    try:
        email = resend.Emails.send(
            {
                "from": SMTP_FROM_EMAIL,
                "to": [OWNER_EMAIL],
                "subject": subject,
                "html": html,
                "text": text,
            }
        )
    except Exception as exc:
        return {"sent": False, "error": str(exc)}

    return {"sent": True, "error": None, "provider": "resend", "provider_response": email}


def send_owner_order_email_smtp(order, items):
    subject, text, _html, missing = build_order_email_content(order, items)
    missing = [*missing, *(["SMTP_HOST"] if not SMTP_HOST else [])]
    if missing:
        return {"sent": False, "error": f"Missing email settings: {', '.join(missing)}"}

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = OWNER_EMAIL
    message.set_content(text)

    try:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
            if SMTP_USERNAME and SMTP_PASSWORD:
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
            smtp.send_message(message)
    except Exception as exc:
        return {"sent": False, "error": str(exc)}

    return {"sent": True, "error": None, "provider": "smtp"}


def list_supply_orders(agent_name=None, status=None):
    query = get_supabase_admin().table(SUPPLY_ORDERS_TABLE).select("*")
    if agent_name:
        query = query.eq("agent_name", agent_name)
    if status:
        query = query.eq("status", status)
    with timed_action("supply-orders list query"):
        response = query.order("created_at", desc=True).execute()
    if getattr(response, "error", None):
        raise RuntimeError(response.error.message)
    orders = response.data or []
    order_ids = [order["order_id"] for order in orders]
    if not order_ids:
        return []

    with timed_action("supply-orders items query"):
        items_response = (
            get_supabase_admin()
            .table(SUPPLY_ORDER_ITEMS_TABLE)
            .select("*")
            .in_("order_id", order_ids)
            .execute()
        )
    if getattr(items_response, "error", None):
        raise RuntimeError(items_response.error.message)

    items_by_order = {}
    for item in items_response.data or []:
        items_by_order.setdefault(item["order_id"], []).append(item)

    enriched_orders = []
    for order in orders:
        items = items_by_order.get(order["order_id"], [])
        enriched_orders.append(
            {
                **order,
                "items": items,
                "total_quantity": sum(item.get("quantity") or 0 for item in items),
            }
        )
    return enriched_orders


def mark_supply_order_received(order_id, agent_name):
    with timed_action("supply-order received update"):
        response = (
            get_supabase_admin()
            .table(SUPPLY_ORDERS_TABLE)
            .update(
                {
                    "agent_received_at": utc_now_iso(),
                    "status": "received",
                    "updated_at": utc_now_iso(),
                }
            )
            .eq("order_id", order_id)
            .eq("agent_name", agent_name)
            .execute()
        )
    if getattr(response, "error", None):
        raise RuntimeError(response.error.message)
    order = (response.data or [None])[0]
    if not order:
        raise LookupError("Supply order not found")
    return order


def approve_supply_order(order_id, payload: SupplyOrderApprove):
    supabase = get_supabase_admin()
    with timed_action("supply-order approve order lookup"):
        order_response = (
            supabase.table(SUPPLY_ORDERS_TABLE)
            .select("*")
            .eq("order_id", order_id)
            .limit(1)
            .execute()
        )
    if getattr(order_response, "error", None):
        raise RuntimeError(order_response.error.message)
    order = (order_response.data or [None])[0]
    if not order:
        raise LookupError("Supply order not found")
    if order.get("status") != "submitted":
        raise RuntimeError("Supply order is not pending approval")

    with timed_action("supply-order approve items lookup"):
        items_response = (
            supabase.table(SUPPLY_ORDER_ITEMS_TABLE)
            .select("*")
            .eq("order_id", order_id)
            .execute()
        )
    if getattr(items_response, "error", None):
        raise RuntimeError(items_response.error.message)

    invalid_items = [
        item
        for item in items_response.data or []
        if int(item.get("quantity") or 0) <= 0
    ]
    if invalid_items:
        raise RuntimeError("Supply order contains items with non-positive quantity")

    transfer_rows = [
        {
            "user_id": order["user_id"],
            "product_id": item["product_id"],
            "variant_id": item["variant_id"],
            "quantity": item["quantity"],
            "notes": payload.notes or f"Approved from supply order #{order_id}",
        }
        for item in items_response.data or []
    ]
    if not transfer_rows:
        raise LookupError("Supply order has no items")

    with timed_action("supply-order approve stock-transfers insert"):
        transfer_response = supabase.table(STOCK_TRANSFERS_TABLE).insert(transfer_rows).execute()
    if getattr(transfer_response, "error", None):
        raise RuntimeError(transfer_response.error.message)

    with timed_action("supply-order approve status update"):
        update_response = (
            supabase.table(SUPPLY_ORDERS_TABLE)
            .update(
                {
                    "status": "approved",
                    "approved_at": utc_now_iso(),
                    "approved_by": payload.approved_by,
                    "updated_at": utc_now_iso(),
                }
            )
            .eq("order_id", order_id)
            .execute()
        )
    if getattr(update_response, "error", None):
        raise RuntimeError(update_response.error.message)

    return {
        "order": (update_response.data or [order])[0],
        "transfers": transfer_response.data or transfer_rows,
    }


def cancel_supply_order(order_id, payload=None):
    with timed_action("supply-order cancel lookup"):
        order_response = (
            get_supabase_admin()
            .table(SUPPLY_ORDERS_TABLE)
            .select("*")
            .eq("order_id", order_id)
            .limit(1)
            .execute()
        )
    if getattr(order_response, "error", None):
        raise RuntimeError(order_response.error.message)
    order = (order_response.data or [None])[0]
    if not order:
        raise LookupError("Supply order not found")
    if order.get("status") == "received":
        raise RuntimeError("Received supply orders cannot be cancelled")

    notes = getattr(payload, "notes", None) if payload else None
    cancelled_by = getattr(payload, "cancelled_by", None) if payload else None
    existing_notes = order.get("notes") or ""
    cancel_note_parts = [part for part in [f"Cancelled by {cancelled_by}" if cancelled_by else "", notes] if part]
    update_payload = {
        "status": "cancelled",
        "updated_at": utc_now_iso(),
    }
    if cancel_note_parts:
        update_payload["notes"] = "\n".join([part for part in [existing_notes, *cancel_note_parts] if part])

    with timed_action("supply-order cancel update"):
        update_response = (
            get_supabase_admin()
            .table(SUPPLY_ORDERS_TABLE)
            .update(update_payload)
            .eq("order_id", order_id)
            .execute()
        )
    if getattr(update_response, "error", None):
        raise RuntimeError(update_response.error.message)
    return (update_response.data or [order])[0]
