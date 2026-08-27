from threading import RLock

import pandas as pd

from backend.app.core.settings import (
    PRODUCT_NAMES_TABLE,
    PRODUCT_PRICES_TABLE,
    PRODUCT_VARIANTS_TABLE,
)
from backend.app.core.timing import timed_action
from backend.app.db.supabase import (
    get_current_supabase_year,
    get_supabase_admin,
    reset_current_supabase_year,
    set_current_supabase_year,
)
from backend.app.services.pricing import find_price_for_sale, prepare_prices_df

_cache_lock = RLock()
_catalog_cache_by_year = {}


def _empty_cache():
    return {
        "products_by_id": {},
        "variants_by_id": {},
        "catalog_by_variant_id": {},
        "products": [],
        "loaded_at": None,
    }


def _check_response(response, label):
    if getattr(response, "error", None):
        raise RuntimeError(f"{label}: {response.error.message}")
    return response.data or []


def _current_prices_for_variant(prices_df, product, variant, sale_dt):
    try:
        client_price, owner_price = find_price_for_sale(
            prices_df,
            product["category"],
            product["product_name"],
            variant["size"],
            sale_dt,
        )
        return {
            "client_price": client_price,
            "owner_price": owner_price,
            "agent_profit": round(client_price - owner_price, 2),
            "price_error": None,
        }
    except Exception as exc:
        return {
            "client_price": None,
            "owner_price": None,
            "agent_profit": None,
            "price_error": str(exc),
        }


def refresh_cache(year: str | None = None):
    selected_year = str(year or get_current_supabase_year())
    token = set_current_supabase_year(selected_year)
    try:
        return _refresh_cache_for_current_year(selected_year)
    finally:
        reset_current_supabase_year(token)


def _refresh_cache_for_current_year(year: str):
    with timed_action("catalog cache refresh"):
        supabase = get_supabase_admin()
        products = _check_response(
            supabase.table(PRODUCT_NAMES_TABLE)
            .select("product_id, category, product_name")
            .order("category")
            .order("product_name")
            .execute(),
            "products query failed",
        )
        variants = _check_response(
            supabase.table(PRODUCT_VARIANTS_TABLE)
            .select("variant_id, product_id, size")
            .execute(),
            "variants query failed",
        )
        price_rows = _check_response(
            supabase.table(PRODUCT_PRICES_TABLE).select("*").execute(),
            "prices query failed",
        )

        products_by_id = {int(product["product_id"]): dict(product) for product in products}
        variants_by_id = {int(variant["variant_id"]): dict(variant) for variant in variants}

        prices_df = prepare_prices_df(pd.DataFrame(price_rows)) if price_rows else pd.DataFrame()
        sale_dt = pd.Timestamp.now(tz="UTC")
        catalog_by_variant_id = {}

        for variant in variants_by_id.values():
            product = products_by_id.get(int(variant["product_id"]))
            if not product:
                continue
            price_data = (
                _current_prices_for_variant(prices_df, product, variant, sale_dt)
                if not prices_df.empty
                else {
                    "client_price": None,
                    "owner_price": None,
                    "agent_profit": None,
                    "price_error": "No prices loaded",
                }
            )
            catalog_by_variant_id[int(variant["variant_id"])] = {
                "product_id": int(product["product_id"]),
                "variant_id": int(variant["variant_id"]),
                "category": product["category"],
                "product_name": product["product_name"],
                "size": variant["size"],
                **price_data,
            }

        products_with_variants = {}
        for product_id, product in products_by_id.items():
            products_with_variants[product_id] = {**product, "variants": []}
        for item in catalog_by_variant_id.values():
            products_with_variants[item["product_id"]]["variants"].append(
                {
                    "variant_id": item["variant_id"],
                    "product_id": item["product_id"],
                    "size": item["size"],
                    "client_price": item["client_price"],
                    "owner_price": item["owner_price"],
                    "agent_profit": item["agent_profit"],
                    "price_error": item["price_error"],
                }
            )

        new_cache = {
            "products_by_id": products_by_id,
            "variants_by_id": variants_by_id,
            "catalog_by_variant_id": catalog_by_variant_id,
            "products": list(products_with_variants.values()),
            "loaded_at": pd.Timestamp.now(tz="UTC").isoformat(),
            "price_date": pd.Timestamp.now(tz="Asia/Jerusalem").date().isoformat(),
        }
        with _cache_lock:
            _catalog_cache_by_year[year] = new_cache

        return get_cache_status(year)


def get_cache_status(year: str | None = None):
    selected_year = str(year or get_current_supabase_year())
    with _cache_lock:
        cache = _catalog_cache_by_year.get(selected_year, _empty_cache())
        return {
            "year": selected_year,
            "loaded_at": cache.get("loaded_at"),
            "products_count": len(cache.get("products_by_id", {})),
            "variants_count": len(cache.get("variants_by_id", {})),
            "catalog_items_count": len(cache.get("catalog_by_variant_id", {})),
        }


def _get_or_refresh_cache():
    selected_year = get_current_supabase_year()
    with _cache_lock:
        cache = _catalog_cache_by_year.get(selected_year)
    current_price_date = pd.Timestamp.now(tz="Asia/Jerusalem").date().isoformat()
    if cache is None or cache.get("price_date") != current_price_date:
        refresh_cache(selected_year)
        with _cache_lock:
            cache = _catalog_cache_by_year.get(selected_year)
    return cache or _empty_cache()


def get_products_with_variants_from_cache():
    cache = _get_or_refresh_cache()
    with _cache_lock:
        return [
            {
                **product,
                "variants": [dict(variant) for variant in product.get("variants", [])],
            }
            for product in cache.get("products", [])
        ]


def get_catalog_item(product_id, variant_id):
    if product_id is None or variant_id is None:
        raise RuntimeError("Sale product identifiers are missing: send product_id and variant_id.")

    product_id = int(product_id)
    variant_id = int(variant_id)
    cache = _get_or_refresh_cache()
    with timed_action("sale product and variant cache check"):
        with _cache_lock:
            item = cache.get("catalog_by_variant_id", {}).get(variant_id)

    if not item:
        raise RuntimeError(f"Product size not found in cache: variant_id={variant_id}")
    if int(item["product_id"]) != product_id:
        raise RuntimeError(
            "Product size mismatch in cache: "
            f"product_id={product_id}, variant_id={variant_id}, "
            f"actual_product_id={item['product_id']}."
        )
    if item.get("client_price") is None or item.get("owner_price") is None:
        raise RuntimeError(
            "Product price not found in cache: "
            f"product_id={product_id}, variant_id={variant_id}, "
            f"error={item.get('price_error')}"
        )
    return dict(item)
