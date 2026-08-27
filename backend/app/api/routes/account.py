from fastapi import APIRouter, Depends, HTTPException

from backend.app.core.auth import get_current_user, require_admin, require_agent_access
from backend.app.core.settings import ACCOUNT_ORDER_FIELD, AGENTS_TRANSACTIONS_TABLE
from backend.app.core.timing import timed_action
from backend.app.db.supabase import get_supabase
from backend.app.schemas.account import (
    AdminAccountTransactionRequest,
    CashReceiptRequest,
    ReconcileAccountRequest,
    RefreshAccountRequest,
)
from backend.app.services.accounts import reconcile_account as reconcile_account_service
from backend.app.services.accounts import record_admin_account_transaction as record_admin_account_transaction_service
from backend.app.services.accounts import refresh_account as refresh_account_service
from backend.app.services.sales import get_account_summary, get_admin_account_summaries

router = APIRouter(prefix="/account", tags=["account"])


@router.get("")
def account_status(
    agent: str,
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
):
    try:
        require_agent_access(agent, current_user)
        with timed_action("account status load"):
            base_query = (
                get_supabase()
                .table(AGENTS_TRANSACTIONS_TABLE)
                .select("*")
                .eq("agent_name", agent)
            )
            query = base_query.limit(limit) if limit and limit > 0 else base_query
            if ACCOUNT_ORDER_FIELD:
                try:
                    response = query.order(ACCOUNT_ORDER_FIELD, desc=True).execute()
                except Exception:
                    response = query.execute()
            else:
                response = query.execute()
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if getattr(response, "error", None):
        raise HTTPException(status_code=500, detail=response.error.message)
    return {"items": response.data or []}


@router.get("/summary")
def account_summary(agent: str, current_user: dict = Depends(get_current_user)):
    try:
        require_agent_access(agent, current_user)
        with timed_action("account summary calculate"):
            summary = get_account_summary(agent)
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "balance": summary["balance"],
        "totals": summary["totals"],
        "transaction_totals": summary.get("transaction_totals", {}),
        "errors": summary["errors"],
    }


@router.get("/admin/summaries")
def admin_account_summaries(current_user: dict = Depends(require_admin)):
    try:
        with timed_action("admin account summaries load"):
            return {"items": get_admin_account_summaries()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/refresh")
def refresh_account(
    payload: RefreshAccountRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        require_agent_access(payload.agent_name, current_user)
        with timed_action("account refresh"):
            return refresh_account_service(payload)
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/reconcile")
def reconcile_account(
    payload: ReconcileAccountRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        require_agent_access(payload.agent_name, current_user)
        with timed_action("account reconcile"):
            return reconcile_account_service(payload)
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/admin/transactions")
def record_admin_account_transaction(
    payload: AdminAccountTransactionRequest,
    current_user: dict = Depends(require_admin),
):
    try:
        with timed_action("admin account transaction"):
            return record_admin_account_transaction_service(payload, current_user)
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/admin/cash-receipts")
def record_cash_received(
    payload: CashReceiptRequest,
    current_user: dict = Depends(require_admin),
):
    transaction_payload = AdminAccountTransactionRequest(
        agent_name=payload.agent_name,
        transaction_type="credit",
        amount=payload.amount,
        description=payload.description,
        note=payload.note,
    )
    try:
        with timed_action("admin cash receipt"):
            return record_admin_account_transaction_service(transaction_payload, current_user)
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
