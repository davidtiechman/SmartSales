from backend.app.core.settings import (
    AGENTS_TRANSACTIONS_TABLE,
    ENABLE_ACCOUNT_RECONCILE,
    PRODUCT_PRICES_TABLE,
    SALES_TABLE,
)
from backend.app.core.timing import timed_action
from backend.app.db.supabase import get_supabase
from backend.app.schemas.account import ReconcileAccountRequest, RefreshAccountRequest
from backend.app.services.accounting import summarize_agent_balance
from backend.app.services.agents import resolve_active_agent
from backend.app.services.pricing import get_prices
from backend.app.services.sales import build_transaction_from_sale_row, get_account_summary
from backend.app.services.tables import get_table_records


def refresh_account(payload: RefreshAccountRequest):
    supabase = get_supabase()
    with timed_action("account refresh sales load"):
        sales_res = (
            supabase.table(SALES_TABLE)
            .select("*")
            .eq("agent", payload.agent_name)
            .execute()
        )
    if getattr(sales_res, "error", None):
        raise RuntimeError(sales_res.error.message)

    with timed_action("account refresh old sale-transactions delete"):
        delete_res = (
            supabase.table(AGENTS_TRANSACTIONS_TABLE)
            .delete()
            .eq("agent_name", payload.agent_name)
            .eq("source_type", "sale")
            .execute()
        )
    if getattr(delete_res, "error", None):
        raise RuntimeError(delete_res.error.message)

    transactions_to_insert = []
    build_errors = []
    with timed_action("account refresh transactions build"):
        for sale_row in sales_res.data or []:
            try:
                transactions_to_insert.append(build_transaction_from_sale_row(sale_row))
            except Exception as exc:
                build_errors.append({"sale_id": sale_row.get("id"), "error": str(exc)})

    if transactions_to_insert:
        with timed_action("account refresh transactions insert"):
            insert_res = supabase.table(AGENTS_TRANSACTIONS_TABLE).insert(transactions_to_insert).execute()
        if getattr(insert_res, "error", None):
            raise RuntimeError(insert_res.error.message)

    with timed_action("account refresh summary calculate"):
        summary = get_account_summary(payload.agent_name)
    return {
        "status": "refreshed",
        "agent_name": payload.agent_name,
        "sales_count": len(sales_res.data or []),
        "rebuilt_transactions_count": len(transactions_to_insert),
        "build_errors": build_errors,
        "balance": summary["balance"],
        "totals": summary["totals"],
        "errors": summary["errors"],
    }


def reconcile_account(payload: ReconcileAccountRequest):
    if ENABLE_ACCOUNT_RECONCILE not in {"1", "true", "yes", "on"}:
        return refresh_account(RefreshAccountRequest(agent_name=payload.agent_name))

    with timed_action("account reconcile source tables load"):
        sales_df = get_table_records(SALES_TABLE)
        prices_df = get_prices(PRODUCT_PRICES_TABLE)
        transactions_df = get_table_records(AGENTS_TRANSACTIONS_TABLE)
    with timed_action("account reconcile balance calculate"):
        summary = summarize_agent_balance(
            sales_df,
            prices_df,
            transactions_df,
            agent_name=payload.agent_name,
            include_sales_base=False,
        )
    balance_before = float(summary["balance"])
    if abs(balance_before) < 0.005:
        return {
            "status": "noop",
            "balance_before": balance_before,
            "balance_after": balance_before,
            "created_transaction": None,
        }

    amount = round(abs(balance_before), 2)
    transaction_type = "credit" if balance_before < 0 else "debit"
    direction = "debt" if balance_before < 0 else "credit"
    transaction_payload = {
        "agent_name": payload.agent_name,
        "transaction_type": transaction_type,
        "amount": amount,
        "description": payload.description or f"Auto reconcile {direction}",
        "source_type": "reconcile",
        "source_id": None,
        "sale_id": None,
        "created_by": "system",
        "note": "Auto reconcile action",
    }

    with timed_action("account reconcile transaction insert"):
        insert_res = get_supabase().table(AGENTS_TRANSACTIONS_TABLE).insert(transaction_payload).execute()
    if getattr(insert_res, "error", None):
        raise RuntimeError(insert_res.error.message)

    with timed_action("account reconcile updated balance calculate"):
        updated_summary = summarize_agent_balance(
            sales_df,
            prices_df,
            get_table_records(AGENTS_TRANSACTIONS_TABLE),
            agent_name=payload.agent_name,
            include_sales_base=False,
        )

    return {
        "status": "reconciled",
        "balance_before": balance_before,
        "balance_after": float(updated_summary["balance"]),
        "created_transaction": transaction_payload,
        "totals": updated_summary["totals"],
        "errors": updated_summary["errors"],
    }


def record_admin_account_transaction(payload, current_user: dict):
    resolve_active_agent(payload.agent_name)
    amount = round(float(payload.amount), 2)
    default_description = (
        "Admin credit adjustment"
        if payload.transaction_type == "credit"
        else "Admin debit adjustment"
    )
    transaction_payload = {
        "agent_name": payload.agent_name,
        "transaction_type": payload.transaction_type,
        "amount": amount,
        "description": payload.description or default_description,
        "source_type": "admin_adjustment",
        "source_id": None,
        "sale_id": None,
        "created_by": current_user.get("sub") or "admin",
        "note": payload.note,
    }

    with timed_action("admin account transaction insert"):
        insert_res = get_supabase().table(AGENTS_TRANSACTIONS_TABLE).insert(transaction_payload).execute()
    if getattr(insert_res, "error", None):
        raise RuntimeError(insert_res.error.message)

    summary = get_account_summary(payload.agent_name)
    return {
        "status": "created",
        "transaction": (insert_res.data or [transaction_payload])[0],
        "balance": summary["balance"],
        "totals": summary["totals"],
        "transaction_totals": summary.get("transaction_totals", {}),
        "errors": summary["errors"],
    }
