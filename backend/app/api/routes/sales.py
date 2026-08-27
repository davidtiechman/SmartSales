from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException

from backend.app.core.auth import get_current_user, require_admin, require_agent_access
from backend.app.core.settings import (
    PRODUCT_PRICES_TABLE,
    SALE_DATE_FIELD,
    SALES_SEARCH_MAX_DATE,
    SALES_SEARCH_MIN_DATE,
    SALES_TABLE,
)
from backend.app.core.timing import timed_action
from backend.app.db.supabase import get_supabase, get_supabase_admin
from backend.app.schemas.prices import ProductPriceUpdateIn
from backend.app.schemas.sales import SaleIn
from backend.app.services.dataframes import df_to_records
from backend.app.services.catalog_cache import get_products_with_variants_from_cache, refresh_cache
from backend.app.services.sales import (
    add_sale_edit_status,
    create_sale_with_transaction,
    delete_sale_with_transaction,
    update_sale_with_transaction,
)
from backend.app.services.tables import get_table_records

router = APIRouter(tags=["sales"])
ISRAEL_TIMEZONE = ZoneInfo("Asia/Jerusalem")


def price_row_israel_date(row: dict, field: str = "valid_from") -> Optional[date]:
    value = row.get(field)
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        normalized = str(value).strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return date.fromisoformat(normalized[:10])
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(ISRAEL_TIMEZONE).date()


@router.get("/products")
def products(current_user: dict = Depends(get_current_user)):
    try:
        with timed_action("sale products catalog load"):
            return {"items": get_products_with_variants_from_cache()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def parse_configured_date(value: str, variable_name: str) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise RuntimeError(f"{variable_name} must use YYYY-MM-DD format") from exc


def get_search_bounds():
    minimum = parse_configured_date(SALES_SEARCH_MIN_DATE, "SALES_SEARCH_MIN_DATE")
    maximum = parse_configured_date(SALES_SEARCH_MAX_DATE, "SALES_SEARCH_MAX_DATE")
    if minimum and maximum and minimum > maximum:
        raise RuntimeError("SALES_SEARCH_MIN_DATE cannot be after SALES_SEARCH_MAX_DATE")
    return minimum, maximum


def validate_requested_dates(date_from: Optional[date], date_to: Optional[date], minimum, maximum):
    if date_from and date_to and date_from > date_to:
        raise ValueError("תאריך ההתחלה חייב להיות לפני תאריך הסיום")
    if minimum and date_from and date_from < minimum:
        raise ValueError(f"לא ניתן לחפש לפני {minimum.isoformat()}")
    if minimum and date_to and date_to < minimum:
        raise ValueError(f"לא ניתן לחפש לפני {minimum.isoformat()}")
    if maximum and date_from and date_from > maximum:
        raise ValueError(f"לא ניתן לחפש אחרי {maximum.isoformat()}")
    if maximum and date_to and date_to > maximum:
        raise ValueError(f"לא ניתן לחפש אחרי {maximum.isoformat()}")


def apply_date_range(query, date_from: Optional[date], date_to: Optional[date], minimum, maximum):
    effective_from = date_from or minimum
    effective_to = date_to or maximum
    if effective_from:
        query = query.gte(SALE_DATE_FIELD, effective_from.isoformat())
    if effective_to:
        query = query.lt(SALE_DATE_FIELD, (effective_to + timedelta(days=1)).isoformat())
    return query


@router.get("/sales")
def list_sales(
    agent: str,
    category: Optional[str] = None,
    product_name: Optional[str] = None,
    payment_method: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: dict = Depends(get_current_user),
):
    try:
        require_agent_access(agent, current_user)
        with timed_action("sales search filters build"):
            minimum, maximum = get_search_bounds()
            validate_requested_dates(date_from, date_to, minimum, maximum)
            query = get_supabase().table(SALES_TABLE).select("*").eq("agent", agent)
            if category:
                query = query.eq("category", category)
            if product_name:
                query = query.eq("product_name", product_name)
            if payment_method:
                query = query.eq("payment_method", payment_method)
            query = apply_date_range(query, date_from, date_to, minimum, maximum)
        with timed_action("sales search execute"):
            response = query.order(SALE_DATE_FIELD, desc=True).execute()
        if getattr(response, "error", None):
            raise RuntimeError(response.error.message)
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"items": add_sale_edit_status(response.data or [])}


@router.get("/admin/sales")
def list_admin_sales(
    agent: Optional[str] = None,
    category: Optional[str] = None,
    product_name: Optional[str] = None,
    payment_method: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: dict = Depends(require_admin),
):
    try:
        with timed_action("admin sales search filters build"):
            minimum, maximum = get_search_bounds()
            validate_requested_dates(date_from, date_to, minimum, maximum)
            query = get_supabase().table(SALES_TABLE).select("*")
            if agent:
                query = query.eq("agent", agent)
            if category:
                query = query.eq("category", category)
            if product_name:
                query = query.eq("product_name", product_name)
            if payment_method:
                query = query.eq("payment_method", payment_method)
            query = apply_date_range(query, date_from, date_to, minimum, maximum)
        with timed_action("admin sales search execute"):
            response = query.order(SALE_DATE_FIELD, desc=True).execute()
        if getattr(response, "error", None):
            raise RuntimeError(response.error.message)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"items": add_sale_edit_status(response.data or [])}


@router.get("/sales/filter-options")
def sales_filter_options(agent: str, current_user: dict = Depends(get_current_user)):
    try:
        require_agent_access(agent, current_user)
        with timed_action("sales filter-options load"):
            minimum, maximum = get_search_bounds()
            query = (
                get_supabase()
                .table(SALES_TABLE)
                .select(f"category, product_name, payment_method, {SALE_DATE_FIELD}")
                .eq("agent", agent)
            )
            response = apply_date_range(query, None, None, minimum, maximum).execute()
        if getattr(response, "error", None):
            raise RuntimeError(response.error.message)
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    rows = response.data or []
    categories = sorted({row.get("category") for row in rows if row.get("category")})
    products = sorted(
        {
            (row.get("category") or "", row.get("product_name"))
            for row in rows
            if row.get("product_name")
        }
    )
    payment_methods = sorted(
        {row.get("payment_method") for row in rows if row.get("payment_method")}
    )
    available_dates = sorted(
        {
            str(row.get(SALE_DATE_FIELD))[:10]
            for row in rows
            if row.get(SALE_DATE_FIELD)
        }
    )
    return {
        "categories": categories,
        "products": [
            {"category": category, "product_name": product_name}
            for category, product_name in products
        ],
        "payment_methods": payment_methods,
        "date_limits": {
            "min": minimum.isoformat() if minimum else (available_dates[0] if available_dates else ""),
            "max": maximum.isoformat() if maximum else (available_dates[-1] if available_dates else ""),
        },
    }


@router.post("/sales")
def create_sale(payload: SaleIn, current_user: dict = Depends(get_current_user)):
    try:
        require_agent_access(payload.agent, current_user)
        with timed_action("sale create"):
            return create_sale_with_transaction(payload, user_id=current_user.get("user_id"))
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("/sales/{sale_id}")
def update_sale(sale_id: int, payload: SaleIn, current_user: dict = Depends(get_current_user)):
    try:
        with timed_action("sale update"):
            return update_sale_with_transaction(sale_id, payload, current_user)
    except HTTPException:
        raise
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/sales/{sale_id}")
def delete_sale(sale_id: int, current_user: dict = Depends(get_current_user)):
    try:
        with timed_action("sale delete"):
            return delete_sale_with_transaction(sale_id, current_user)
    except HTTPException:
        raise
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/prices")
def product_prices(
    category: Optional[str] = None,
    product_name: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    try:
        df = get_table_records(PRODUCT_PRICES_TABLE)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if category and "category" in df.columns:
        df = df[df["category"] == category]
    if product_name and "product_name" in df.columns:
        df = df[df["product_name"] == product_name]
    return {"items": df_to_records(df)}


@router.get("/prices/current")
def current_product_prices(current_user: dict = Depends(get_current_user)):
    try:
        now = datetime.now(timezone.utc).isoformat()
        response = (
            get_supabase_admin()
            .table(PRODUCT_PRICES_TABLE)
            .select("*")
            .lte("valid_from", now)
            .or_(f"valid_to.is.null,valid_to.gt.{now}")
            .order("category")
            .order("product_name")
            .order("size_tier")
            .execute()
        )
        if getattr(response, "error", None):
            raise RuntimeError(response.error.message)
        latest_by_product_tier = {}
        for row in response.data or []:
            key = (row.get("category"), row.get("product_name"), row.get("size_tier"))
            previous = latest_by_product_tier.get(key)
            if previous is None or str(row.get("valid_from") or "") > str(previous.get("valid_from") or ""):
                latest_by_product_tier[key] = row
        items = sorted(
            latest_by_product_tier.values(),
            key=lambda row: (
                str(row.get("category") or ""),
                str(row.get("product_name") or ""),
                str(row.get("size_tier") or ""),
            ),
        )
        return {"items": items}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("/admin/prices/current")
def update_current_product_price(
    payload: ProductPriceUpdateIn,
    current_user: dict = Depends(require_admin),
):
    try:
        effective_from = datetime.combine(
            payload.effective_from,
            time.min,
            tzinfo=ISRAEL_TIMEZONE,
        ).astimezone(timezone.utc).isoformat()
        supabase = get_supabase_admin()
        prices_response = (
            supabase.table(PRODUCT_PRICES_TABLE)
            .select("*")
            .eq("category", payload.category)
            .eq("product_name", payload.product_name)
            .eq("size_tier", payload.size_tier)
            .order("valid_from")
            .execute()
        )
        if getattr(prices_response, "error", None):
            raise RuntimeError(prices_response.error.message)
        rows = prices_response.data or []
        if not rows:
            raise LookupError("לא נמצאה היסטוריית מחיר למוצר ולקבוצת המידות שנבחרו")

        same_date_row = next(
            (
                row for row in rows
                if price_row_israel_date(row) == payload.effective_from
            ),
            None,
        )
        if same_date_row:
            update_response = (
                supabase.table(PRODUCT_PRICES_TABLE)
                .update({
                    "client_price": payload.client_price,
                    "owner_price": payload.owner_price,
                })
                .eq("category", payload.category)
                .eq("product_name", payload.product_name)
                .eq("size_tier", payload.size_tier)
                .eq("valid_from", same_date_row["valid_from"])
                .execute()
            )
            if getattr(update_response, "error", None):
                raise RuntimeError(update_response.error.message)
            refresh_cache()
            return {"status": "scheduled", "effective_from": payload.effective_from.isoformat()}

        previous_rows = [
            row for row in rows
            if price_row_israel_date(row) and price_row_israel_date(row) < payload.effective_from
        ]
        previous_row = previous_rows[-1] if previous_rows else None
        if not previous_row:
            raise ValueError("תאריך התחולה חייב להיות אחרי תחילת המחיר הקיים")

        next_row = next(
            (
                row for row in rows
                if price_row_israel_date(row) and price_row_israel_date(row) > payload.effective_from
            ),
            None,
        )
        insert_response = (
            supabase.table(PRODUCT_PRICES_TABLE)
            .insert({
                "category": payload.category,
                "product_name": payload.product_name,
                "size_tier": payload.size_tier,
                "client_price": payload.client_price,
                "owner_price": payload.owner_price,
                "valid_from": effective_from,
                "valid_to": next_row.get("valid_from") if next_row else None,
            })
            .execute()
        )
        if getattr(insert_response, "error", None):
            raise RuntimeError(insert_response.error.message)

        close_response = (
            supabase.table(PRODUCT_PRICES_TABLE)
            .update({"valid_to": effective_from})
            .eq("category", payload.category)
            .eq("product_name", payload.product_name)
            .eq("size_tier", payload.size_tier)
            .eq("valid_from", previous_row["valid_from"])
            .execute()
        )
        if getattr(close_response, "error", None):
            raise RuntimeError(close_response.error.message)
        refresh_cache()
        return {"status": "scheduled", "effective_from": payload.effective_from.isoformat()}
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
