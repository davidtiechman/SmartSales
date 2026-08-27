from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from backend.app.core.auth import get_current_user, require_admin, require_agent_access
from backend.app.core.settings import AGENT_ACTIVE_FIELD, ADMIN_USERNAME, USERNAME_FIELD, USERS_TABLE
from backend.app.core.timing import timed_action
from backend.app.db.supabase import get_supabase
from backend.app.schemas.inventory import StockTransferIn
from backend.app.services.catalog_cache import refresh_cache
from backend.app.services.inventory import (
    create_stock_transfer,
    get_inventory_items,
    get_products_with_variants,
)
from backend.app.services.agents import resolve_active_agent

router = APIRouter(tags=["inventory"])


@router.post("/admin/refresh-cache")
def admin_refresh_cache(current_user: dict = Depends(require_admin)):
    try:
        return {"status": "refreshed", "cache": refresh_cache()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/inventory")
def agent_inventory(agent: str, current_user: dict = Depends(get_current_user)):
    try:
        require_agent_access(agent, current_user)
        with timed_action("inventory load"):
            return {"items": get_inventory_items(agent=agent)}
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/admin/agents")
def admin_agents(
    include_admin: bool = False,
    current_user: dict = Depends(require_admin),
):
    try:
        with timed_action("admin active-agents load"):
            query = (
                get_supabase()
                .table(USERS_TABLE)
                .select("id, agent_name")
                .eq(AGENT_ACTIVE_FIELD, True)
            )
            if not include_admin:
                query = query.neq(USERNAME_FIELD, ADMIN_USERNAME)
            response = query.order(USERNAME_FIELD).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if getattr(response, "error", None):
        raise HTTPException(status_code=500, detail=response.error.message)
    return {"items": response.data or []}


@router.get("/admin/products")
def admin_products(current_user: dict = Depends(require_admin)):
    try:
        with timed_action("admin products load"):
            return {"items": get_products_with_variants()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/admin/stock-transfers")
def admin_create_stock_transfer(
    payload: StockTransferIn,
    current_user: dict = Depends(require_admin),
):
    try:
        with timed_action("admin stock-transfer create"):
            return create_stock_transfer(payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/admin/inventory")
def admin_inventory(
    agent: Optional[str] = None,
    current_user: dict = Depends(require_admin),
):
    try:
        if agent:
            with timed_action("admin inventory active-agent check"):
                resolve_active_agent(agent)
        with timed_action("admin inventory load"):
            return {"items": get_inventory_items(agent=agent)}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

