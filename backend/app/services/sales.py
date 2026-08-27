from datetime import datetime, timedelta, timezone
from typing import Optional

import pandas as pd

from backend.app.core.settings import (
    AGENT_ACTIVE_FIELD,
    AGENTS_TRANSACTIONS_TABLE,
    ADMIN_USERNAME,
    CASH_PAYMENT_METHODS,
    DIRECT_PAYMENT_METHODS,
    PRODUCT_PRICES_TABLE,
    SALE_EDIT_WINDOW_MINUTES,
    SALE_DATE_FIELD,
    SALES_TABLE,
    USERNAME_FIELD,
    USERS_TABLE,
)
from backend.app.core.timing import timed_action
from backend.app.db.supabase import get_supabase, get_supabase_admin
from backend.app.schemas.sales import SaleIn
from backend.app.services.accounting import summarize_agent_balance
from backend.app.services.catalog_cache import get_catalog_item
from backend.app.services.pricing import find_price_for_sale, get_prices, prepare_prices_df
from backend.app.services.tables import get_table_records


def calculate_sale_components_raw(
    category: str,
    product_name: str,
    size: str,
    quantity: int,
    sale_dt: pd.Timestamp,
):
    with timed_action("sale amount calculation"):
        prices_df = prepare_prices_df(get_prices(PRODUCT_PRICES_TABLE))
        client_price, owner_price = find_price_for_sale(
            prices_df,
            category,
            product_name,
            size,
            sale_dt,
        )
        qty = int(quantity)
        client_total = round(float(client_price) * qty, 2)
        owner_total = round(float(owner_price) * qty, 2)
        return {
            "client_total": client_total,
            "owner_total": owner_total,
            "profit": round(client_total - owner_total, 2),
        }


def calculate_sale_components(payload: SaleIn):
    return calculate_sale_components_raw(
        category=payload.category,
        product_name=payload.product_name,
        size=payload.size,
        quantity=payload.quantity,
        sale_dt=pd.Timestamp.now(tz="UTC"),
    )


def build_sale_transaction_payload(
    *,
    agent_name: str,
    product_name: str,
    quantity: int,
    payment_method: str,
    sale_amounts: dict,
    sale_id: Optional[int],
):
    payment_method = (payment_method or "").strip()
    if payment_method in CASH_PAYMENT_METHODS:
        tx_type = "debit"
        amount = sale_amounts["owner_total"]
    elif payment_method in DIRECT_PAYMENT_METHODS:
        tx_type = "credit"
        amount = sale_amounts["profit"]
    else:
        raise RuntimeError(f"Unsupported payment method: {payment_method}")

    return {
        "agent_name": agent_name,
        "transaction_type": tx_type,
        "amount": amount,
        "description": f"Auto from sale: {product_name} x{quantity} ({payment_method})",
        "source_type": "sale",
        "source_id": sale_id,
        "sale_id": sale_id,
        "created_by": "system",
        "note": "Auto transaction from sale creation",
    }


def insert_sale_transaction(payload: SaleIn, sale_id: Optional[int] = None):
    tx_payload = build_sale_transaction_payload(
        agent_name=payload.agent,
        product_name=payload.product_name,
        quantity=payload.quantity,
        payment_method=payload.payment_method,
        sale_amounts=calculate_sale_components(payload),
        sale_id=sale_id,
    )
    with timed_action("sale transaction insert"):
        response = get_supabase().table(AGENTS_TRANSACTIONS_TABLE).insert(tx_payload).execute()
    if getattr(response, "error", None):
        raise RuntimeError(response.error.message)
    return tx_payload


def resolve_sale_product_variant(payload: SaleIn):
    return get_catalog_item(payload.product_id, payload.variant_id)


def calculate_sale_components_from_catalog(catalog_item: dict, quantity: int):
    with timed_action("sale amount calculation from cache"):
        qty = int(quantity)
        client_total = round(float(catalog_item["client_price"]) * qty, 2)
        owner_total = round(float(catalog_item["owner_price"]) * qty, 2)
        return {
            "client_total": client_total,
            "owner_total": owner_total,
            "profit": round(client_total - owner_total, 2),
        }


def resolve_sale_user_id(agent_name: str):
    with timed_action("sale agent user-id lookup"):
        response = (
            get_supabase()
            .table(USERS_TABLE)
            .select("id")
            .eq("agent_name", agent_name)
            .eq(AGENT_ACTIVE_FIELD, True)
            .limit(1)
            .execute()
        )
    if getattr(response, "error", None):
        raise RuntimeError(response.error.message)
    user = (response.data or [None])[0]
    if not user:
        raise RuntimeError("Agent not found")
    return user["id"]


def build_transaction_from_sale_row(sale_row: dict):
    sale_dt = pd.to_datetime(
        sale_row.get(SALE_DATE_FIELD) or sale_row.get("sale_date"),
        errors="coerce",
        utc=True,
    )
    if pd.isna(sale_dt):
        sale_dt = pd.Timestamp.now(tz="UTC")

    return build_sale_transaction_payload(
        agent_name=sale_row.get("agent"),
        product_name=sale_row.get("product_name"),
        quantity=int(sale_row.get("quantity") or 0),
        payment_method=sale_row.get("payment_method"),
        sale_amounts=calculate_sale_components_raw(
            category=sale_row.get("category"),
            product_name=sale_row.get("product_name"),
            size=sale_row.get("size"),
            quantity=int(sale_row.get("quantity") or 0),
            sale_dt=sale_dt,
        ),
        sale_id=sale_row.get("id"),
    )


def get_table_records_for_field(table_name: str, field_name: str, value: str):
    response = (
        get_supabase()
        .table(table_name)
        .select("*")
        .eq(field_name, value)
        .execute()
    )
    if response.data is None:
        raise RuntimeError(f"No data found from {table_name}")
    return pd.DataFrame(response.data)


def get_account_summary(agent_name: str):
    with timed_action("agent owner account summary calculation"):
        return summarize_agent_balance(
            get_table_records_for_field(SALES_TABLE, "agent", agent_name),
            get_prices(PRODUCT_PRICES_TABLE),
            get_table_records_for_field(AGENTS_TRANSACTIONS_TABLE, "agent_name", agent_name),
            include_sales_base=False,
        )


def get_active_agent_names():
    response = (
        get_supabase()
        .table(USERS_TABLE)
        .select(USERNAME_FIELD)
        .eq(AGENT_ACTIVE_FIELD, True)
        .neq(USERNAME_FIELD, ADMIN_USERNAME)
        .order(USERNAME_FIELD)
        .execute()
    )
    if getattr(response, "error", None):
        raise RuntimeError(response.error.message)
    return [row.get(USERNAME_FIELD) for row in response.data or [] if row.get(USERNAME_FIELD)]


def get_admin_account_summaries():
    with timed_action("admin account summaries calculate"):
        agent_names = get_active_agent_names()
        transactions_df = get_table_records(AGENTS_TRANSACTIONS_TABLE)
        items = []
        for agent_name in agent_names:
            agent_transactions = transactions_df
            if "agent_name" in agent_transactions.columns:
                agent_transactions = agent_transactions[agent_transactions["agent_name"] == agent_name]
            credit = (
                agent_transactions[agent_transactions["transaction_type"] == "credit"]["amount"].sum()
                if "transaction_type" in agent_transactions.columns
                else 0
            )
            debit = (
                agent_transactions[agent_transactions["transaction_type"] == "debit"]["amount"].sum()
                if "transaction_type" in agent_transactions.columns
                else 0
            )
            items.append(
                {
                    "agent_name": agent_name,
                    "balance": float(credit - debit),
                    "credit": float(credit),
                    "debit": float(debit),
                }
            )
        return items


def parse_sale_datetime(value):
    if not value:
        return None
    text = str(value).strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def sale_edit_deadline(sale_row):
    sale_dt = parse_sale_datetime(sale_row.get(SALE_DATE_FIELD) or sale_row.get("sale_date"))
    if sale_dt is None or SALE_EDIT_WINDOW_MINUTES <= 0:
        return None
    return sale_dt + timedelta(minutes=SALE_EDIT_WINDOW_MINUTES)


def can_agent_edit_sale(sale_row):
    deadline = sale_edit_deadline(sale_row)
    return bool(deadline and datetime.now(timezone.utc) <= deadline)


def sale_edit_status_payload(sale_row):
    deadline = sale_edit_deadline(sale_row)
    return {
        "can_edit": bool(deadline and datetime.now(timezone.utc) <= deadline),
        "edit_deadline": deadline.isoformat() if deadline else None,
    }


def add_sale_edit_status(rows):
    return [{**row, **sale_edit_status_payload(row)} for row in rows]


def create_sale_with_transaction(payload: SaleIn, user_id=None):
    with timed_action("sale create total"):
        product = resolve_sale_product_variant(payload)
        if user_id is None:
            user_id = resolve_sale_user_id(payload.agent)

        sale_amounts = calculate_sale_components_from_catalog(product, payload.quantity)
        tx_payload = build_sale_transaction_payload(
            agent_name=payload.agent,
            product_name=product["product_name"],
            quantity=payload.quantity,
            payment_method=payload.payment_method,
            sale_amounts=sale_amounts,
            sale_id=None,
        )

        rpc_payload = {
            "p_sales_table": SALES_TABLE,
            "p_transactions_table": AGENTS_TRANSACTIONS_TABLE,
            "p_agent_name": payload.agent,
            "p_user_id": user_id,
            "p_product_id": product["product_id"],
            "p_variant_id": product["variant_id"],
            "p_category": product["category"],
            "p_product_name": product["product_name"],
            "p_size": product["size"],
            "p_quantity": int(payload.quantity),
            "p_client_name": payload.client_name,
            "p_client_phone": payload.client_phone,
            "p_payment_method": payload.payment_method,
            "p_payment_source": payload.payment_source or "manual",
            "p_transaction_type": tx_payload["transaction_type"],
            "p_transaction_amount": tx_payload["amount"],
        }

        with timed_action("sale database transaction"):
            response = get_supabase_admin().rpc("create_sale_and_transaction", rpc_payload).execute()

        if getattr(response, "error", None):
            raise RuntimeError(
                "Sale database transaction failed: "
                f"{response.error.message}. "
                f"product_id={product['product_id']}, variant_id={product['variant_id']}, "
                f"agent={payload.agent}, payment_method={payload.payment_method}"
            )

        result = response.data
        if isinstance(result, list):
            result = (result or [None])[0]
        if not result:
            raise RuntimeError("Sale transaction did not return a result")

        timings = result.get("timings") or {}
        if "sale_insert_ms" in timings:
            print(f"[timing] sale insert database took {float(timings['sale_insert_ms']):.2f} ms")
        if "transaction_insert_ms" in timings:
            print(
                "[timing] sale transaction insert took "
                f"{float(timings['transaction_insert_ms']):.2f} ms"
            )
        if "total_transaction_ms" in timings:
            print(
                "[timing] sale database transaction internal total took "
                f"{float(timings['total_transaction_ms']):.2f} ms"
            )

        return {
            "status": "created",
            "sale": result.get("sale"),
            "transaction": result.get("transaction"),
        }


def update_sale_with_transaction(sale_id: int, payload: SaleIn, current_user: dict):
    supabase = get_supabase_admin()
    with timed_action("sale update lookup"):
        sale_response = (
            supabase.table(SALES_TABLE)
            .select("*")
            .eq("id", sale_id)
            .limit(1)
            .execute()
        )
    if getattr(sale_response, "error", None):
        raise RuntimeError(sale_response.error.message)

    sale = (sale_response.data or [None])[0]
    if not sale:
        raise LookupError("Sale not found")

    is_admin = current_user.get("role") == "admin"
    if not is_admin:
        current_agent = current_user.get("sub")
        if sale.get("agent") != current_agent:
            raise PermissionError("Agent access denied")
        if not can_agent_edit_sale(sale):
            raise RuntimeError("חלון העריכה של המכירה הסתיים")

    product = resolve_sale_product_variant(payload)
    sale_amounts = calculate_sale_components_from_catalog(product, payload.quantity)
    tx_payload = build_sale_transaction_payload(
        agent_name=sale.get("agent"),
        product_name=product["product_name"],
        quantity=payload.quantity,
        payment_method=payload.payment_method,
        sale_amounts=sale_amounts,
        sale_id=sale_id,
    )

    sale_update = {
        "product_id": product["product_id"],
        "variant_id": product["variant_id"],
        "category": product["category"],
        "product_name": product["product_name"],
        "size": product["size"],
        "quantity": int(payload.quantity),
        "client_name": payload.client_name,
        "client_phone": payload.client_phone,
        "payment_method": payload.payment_method,
    }

    with timed_action("sale update row"):
        update_response = (
            supabase.table(SALES_TABLE)
            .update(sale_update)
            .eq("id", sale_id)
            .execute()
        )
    if getattr(update_response, "error", None):
        raise RuntimeError(update_response.error.message)

    transaction_update = {
        "agent_name": sale.get("agent"),
        "transaction_type": tx_payload["transaction_type"],
        "amount": tx_payload["amount"],
        "description": tx_payload["description"],
        "source_type": "sale",
        "source_id": sale_id,
        "sale_id": sale_id,
        "created_by": "system",
        "note": "Auto transaction from sale update",
    }
    with timed_action("sale transaction update"):
        tx_response = (
            supabase.table(AGENTS_TRANSACTIONS_TABLE)
            .update(transaction_update)
            .eq("sale_id", sale_id)
            .execute()
        )
    if getattr(tx_response, "error", None):
        raise RuntimeError(tx_response.error.message)

    updated_sale = (update_response.data or [{**sale, **sale_update}])[0]
    return {
        "status": "updated",
        "sale": {**updated_sale, **sale_edit_status_payload(updated_sale)},
        "transaction": (tx_response.data or [transaction_update])[0],
    }


def delete_sale_with_transaction(sale_id: int, current_user: dict):
    supabase = get_supabase_admin()
    with timed_action("sale delete lookup"):
        sale_response = (
            supabase.table(SALES_TABLE)
            .select("*")
            .eq("id", sale_id)
            .limit(1)
            .execute()
        )
    if getattr(sale_response, "error", None):
        raise RuntimeError(sale_response.error.message)

    sale = (sale_response.data or [None])[0]
    if not sale:
        raise LookupError("Sale not found")

    is_admin = current_user.get("role") == "admin"
    if not is_admin:
        current_agent = current_user.get("sub")
        if sale.get("agent") != current_agent:
            raise PermissionError("Agent access denied")
        if not can_agent_edit_sale(sale):
            raise RuntimeError("חלון העריכה של המכירה הסתיים")

    with timed_action("sale transaction delete"):
        tx_response = (
            supabase.table(AGENTS_TRANSACTIONS_TABLE)
            .delete()
            .eq("sale_id", sale_id)
            .execute()
        )
    if getattr(tx_response, "error", None):
        raise RuntimeError(tx_response.error.message)

    with timed_action("sale delete row"):
        delete_response = (
            supabase.table(SALES_TABLE)
            .delete()
            .eq("id", sale_id)
            .execute()
        )
    if getattr(delete_response, "error", None):
        raise RuntimeError(delete_response.error.message)

    return {
        "status": "deleted",
        "sale": sale,
        "transactions": tx_response.data or [],
    }
