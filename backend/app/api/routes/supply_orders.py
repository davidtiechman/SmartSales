from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from backend.app.core.auth import get_current_user, require_admin, require_agent_access
from backend.app.core.timing import timed_action
from backend.app.schemas.supply_orders import (
    SupplyOrderApprove,
    SupplyOrderCancel,
    SupplyOrderCreate,
    SupplyOrderReceivedUpdate,
    SupplyOrderUpdate,
)
from backend.app.services.supply_orders import (
    SupplyOrderValidationError,
    approve_supply_order,
    cancel_supply_order,
    create_supply_order,
    list_supply_orders,
    mark_supply_order_received,
    process_supply_order_owner_email,
    update_supply_order,
)

router = APIRouter(tags=["supply-orders"])


@router.post("/supply-orders")
def submit_supply_order(
    payload: SupplyOrderCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    try:
        require_agent_access(payload.agent_name, current_user)
        with timed_action("supply-order create"):
            result = create_supply_order(payload, agent_user_id=current_user.get("user_id"), send_email=False)
        background_tasks.add_task(process_supply_order_owner_email, result["order"], result["items"])
        return result
    except HTTPException:
        raise
    except SupplyOrderValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/supply-orders")
def get_supply_orders(
    agent: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    try:
        if current_user.get("role") != "admin":
            agent = current_user.get("sub")
        elif agent:
            require_agent_access(agent, current_user)
        with timed_action("supply-orders list"):
            return {"items": list_supply_orders(agent_name=agent, status=status)}
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("/supply-orders/{order_id}")
def update_existing_supply_order(
    order_id: int,
    payload: SupplyOrderUpdate,
    current_user: dict = Depends(get_current_user),
):
    try:
        allowed_agent_name = None
        if current_user.get("role") != "admin":
            allowed_agent_name = current_user.get("sub")
        with timed_action("supply-order update"):
            return update_supply_order(order_id, payload, allowed_agent_name=allowed_agent_name)
    except HTTPException:
        raise
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except SupplyOrderValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/supply-orders/{order_id}/received")
def mark_received(
    order_id: int,
    payload: SupplyOrderReceivedUpdate,
    current_user: dict = Depends(get_current_user),
):
    try:
        require_agent_access(payload.agent_name, current_user)
        with timed_action("supply-order mark received"):
            return {"order": mark_supply_order_received(order_id, payload.agent_name)}
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/admin/supply-orders/{order_id}/approve")
def admin_approve_supply_order(
    order_id: int,
    payload: SupplyOrderApprove,
    current_user: dict = Depends(require_admin),
):
    try:
        with timed_action("supply-order approve"):
            return approve_supply_order(order_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/admin/supply-orders/{order_id}/cancel")
def admin_cancel_supply_order(
    order_id: int,
    payload: SupplyOrderCancel,
    current_user: dict = Depends(require_admin),
):
    try:
        if not payload.cancelled_by:
            payload.cancelled_by = current_user.get("sub")
        with timed_action("supply-order cancel"):
            return {"order": cancel_supply_order(order_id, payload)}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
