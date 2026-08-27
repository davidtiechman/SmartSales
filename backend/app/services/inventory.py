from backend.app.core.settings import (
    AGENT_ACTIVE_FIELD,
    AGENT_INVENTORY_VIEW,
    PRODUCT_NAMES_TABLE,
    PRODUCT_VARIANTS_TABLE,
    SALES_TABLE,
    STOCK_TRANSFERS_TABLE,
    USERS_TABLE,
)
from backend.app.core.timing import timed_action
from backend.app.db.supabase import get_supabase, get_supabase_admin
from backend.app.schemas.inventory import StockTransferIn


def get_inventory_items(agent=None):
    inventory_query = get_supabase().table(AGENT_INVENTORY_VIEW).select("*")
    if agent:
        inventory_query = inventory_query.eq("agent_name", agent)
    with timed_action("inventory view query"):
        inventory_res = inventory_query.order("agent_name").order("category").order("product_name").execute()

    sales_query = get_supabase_admin().table(SALES_TABLE).select("user_id, variant_id, quantity")
    if agent:
        sales_query = sales_query.eq("agent", agent)
    with timed_action("inventory sales quantity query"):
        sales_res = sales_query.execute()

    if getattr(inventory_res, "error", None):
        raise RuntimeError(inventory_res.error.message)
    if getattr(sales_res, "error", None):
        raise RuntimeError(sales_res.error.message)

    with timed_action("inventory stock calculation"):
        sold_by_user_variant = {}
        for sale in sales_res.data or []:
            user_id = sale.get("user_id")
            variant_id = sale.get("variant_id")
            if user_id is None or variant_id is None:
                continue
            key = (int(user_id), int(variant_id))
            sold_by_user_variant[key] = sold_by_user_variant.get(key, 0) + int(sale.get("quantity") or 0)

        items = []
        for item in inventory_res.data or []:
            updated = dict(item)
            user_id = updated.get("user_id")
            variant_id = updated.get("variant_id")
            total_sold = 0
            if user_id is not None and variant_id is not None:
                total_sold = sold_by_user_variant.get((int(user_id), int(variant_id)), 0)

            total_transferred = int(updated.get("total_transferred") or 0)
            updated["total_sold"] = total_sold
            updated["current_stock"] = total_transferred - total_sold
            items.append(updated)

    return items


def get_products_with_variants():
    supabase = get_supabase_admin()
    with timed_action("products query"):
        products_res = (
            supabase.table(PRODUCT_NAMES_TABLE)
            .select("product_id, category, product_name")
            .order("category")
            .order("product_name")
            .execute()
        )
    with timed_action("product variants query"):
        variants_res = (
            supabase.table(PRODUCT_VARIANTS_TABLE)
            .select("variant_id, product_id, size")
            .execute()
        )

    if getattr(products_res, "error", None):
        raise RuntimeError(products_res.error.message)
    if getattr(variants_res, "error", None):
        raise RuntimeError(variants_res.error.message)

    variants_by_product = {}
    for variant in variants_res.data or []:
        variants_by_product.setdefault(variant.get("product_id"), []).append(variant)

    items = []
    for product in products_res.data or []:
        product = dict(product)
        product["variants"] = variants_by_product.get(product.get("product_id"), [])
        items.append(product)
    return items


def create_stock_transfer(payload: StockTransferIn):
    supabase = get_supabase()
    with timed_action("stock-transfer active-agent lookup"):
        user_res = (
            supabase.table(USERS_TABLE)
            .select("id, agent_name")
            .eq("id", payload.user_id)
            .eq(AGENT_ACTIVE_FIELD, True)
            .limit(1)
            .execute()
        )
    with timed_action("stock-transfer inventory item lookup"):
        inventory_res = (
            supabase.table(AGENT_INVENTORY_VIEW)
            .select("user_id, agent_name, variant_id, product_id, category, product_name, size")
            .eq("user_id", payload.user_id)
            .eq("variant_id", payload.variant_id)
            .limit(1)
            .execute()
        )

    if getattr(user_res, "error", None):
        raise RuntimeError(user_res.error.message)
    if getattr(inventory_res, "error", None):
        raise RuntimeError(inventory_res.error.message)

    user = (user_res.data or [None])[0]
    inventory_item = (inventory_res.data or [None])[0]
    if not user:
        raise LookupError("Agent not found")
    if not inventory_item:
        raise LookupError("Product size not found")

    transfer_payload = {
        "user_id": payload.user_id,
        "product_id": inventory_item["product_id"],
        "variant_id": payload.variant_id,
        "quantity": payload.quantity,
        "notes": payload.notes,
    }
    with timed_action("stock-transfer insert"):
        insert_res = (
            get_supabase_admin()
            .table(STOCK_TRANSFERS_TABLE)
            .insert(transfer_payload)
            .execute()
        )
    if getattr(insert_res, "error", None):
        raise RuntimeError(insert_res.error.message)

    return {
        "status": "created",
        "transfer": (insert_res.data or [transfer_payload])[0],
        "agent": user,
        "variant": inventory_item,
    }

