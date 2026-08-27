import pandas as pd

from backend.app.core.settings import DIRECT_PAYMENT_METHODS
from backend.app.services.pricing import find_price_for_sale


def empty_sale_totals():
    totals = {
        "sales_count": 0,
        "items_count": 0,
        "client_revenue": 0.0,
        "owner_due": 0.0,
        "agent_profit": 0.0,
        "cash_collected": 0.0,
        "direct_to_owner": 0.0,
        "to_transfer_from_cash": 0.0,
        "credit_from_direct": 0.0,
        "debt_from_direct": 0.0,
    }
    totals["net_transfer_to_owner"] = 0.0
    totals["net_agent_balance"] = 0.0
    totals["net_transfer_to_owner_after_credit"] = 0.0
    return totals


def compute_sale_amounts(sale_row, prices_df):
    client_p, owner_p = find_price_for_sale(
        prices_df,
        sale_row["category"],
        sale_row["product_name"],
        sale_row["size"],
        sale_row["sale_date"],
    )

    qty = int(sale_row["quantity"])
    return {
        "client_total": client_p * qty,
        "owner_total": owner_p * qty,
        "profit": (client_p - owner_p) * qty,
        "payment_method": sale_row["payment_method"],
    }


def calculate_totals(sales_df, prices_df):
    if "sale_date" in sales_df.columns:
        sales_df = sales_df.copy()
        sales_df["sale_date"] = pd.to_datetime(sales_df["sale_date"], errors="coerce", utc=True)
    if "valid_from" in prices_df.columns:
        prices_df = prices_df.copy()
        prices_df["valid_from"] = pd.to_datetime(prices_df["valid_from"], errors="coerce", utc=True)
        if "valid_to" in prices_df.columns:
            prices_df["valid_to"] = pd.to_datetime(prices_df["valid_to"], errors="coerce", utc=True)

    totals = empty_sale_totals()
    errors = []

    for _, sale in sales_df.iterrows():
        try:
            amounts = compute_sale_amounts(sale, prices_df)
        except Exception as exc:
            errors.append({"id": sale.get("id"), "error": str(exc)})
            continue

        totals["sales_count"] += 1
        totals["items_count"] += int(sale["quantity"])
        totals["client_revenue"] += amounts["client_total"]
        totals["owner_due"] += amounts["owner_total"]
        totals["agent_profit"] += amounts["profit"]

        if amounts["payment_method"] in DIRECT_PAYMENT_METHODS:
            totals["direct_to_owner"] += amounts["client_total"]
            diff = amounts["client_total"] - amounts["owner_total"]
            if diff >= 0:
                totals["credit_from_direct"] += diff
            else:
                totals["debt_from_direct"] += -diff
        else:
            totals["cash_collected"] += amounts["client_total"]
            totals["to_transfer_from_cash"] += amounts["owner_total"]

    totals["net_transfer_to_owner"] = (
        totals["to_transfer_from_cash"] + totals["debt_from_direct"]
    )
    totals["net_agent_balance"] = totals["credit_from_direct"] - totals["debt_from_direct"]
    totals["net_transfer_to_owner_after_credit"] = (
        totals["to_transfer_from_cash"] - totals["credit_from_direct"]
    )

    return totals, errors


def summarize_agent_balance(
    sales_df,
    prices_df,
    transactions_df,
    agent_name=None,
    include_sales_base=True,
):
    if agent_name and "agent" in sales_df.columns:
        sales_df = sales_df[sales_df["agent"] == agent_name]
    if agent_name and "agent_name" in transactions_df.columns:
        transactions_df = transactions_df[transactions_df["agent_name"] == agent_name]

    totals, errors = calculate_totals(sales_df, prices_df)
    if include_sales_base:
        base_balance = (
            totals.get("credit_from_direct", 0.0)
            - totals.get("debt_from_direct", 0.0)
            - totals.get("to_transfer_from_cash", 0.0)
        )
    else:
        base_balance = 0.0

    if "amount" in transactions_df.columns:
        transactions_df = transactions_df.copy()
        transactions_df["amount"] = pd.to_numeric(transactions_df["amount"], errors="coerce").fillna(0)

    credit_rows = (
        transactions_df[transactions_df["transaction_type"] == "credit"]
        if "transaction_type" in transactions_df.columns
        else pd.DataFrame()
    )
    debit_rows = (
        transactions_df[transactions_df["transaction_type"] == "debit"]
        if "transaction_type" in transactions_df.columns
        else pd.DataFrame()
    )
    credit = credit_rows["amount"].sum() if "amount" in credit_rows.columns else 0
    debit = debit_rows["amount"].sum() if "amount" in debit_rows.columns else 0
    if "source_type" in transactions_df.columns and "amount" in transactions_df.columns:
        admin_rows = transactions_df[
            transactions_df["source_type"].isin(["admin_adjustment", "admin_cash_received"])
        ]
        admin_credit = (
            admin_rows[admin_rows["transaction_type"] == "credit"]["amount"].sum()
            if "transaction_type" in admin_rows.columns
            else 0
        )
        admin_debit = (
            admin_rows[admin_rows["transaction_type"] == "debit"]["amount"].sum()
            if "transaction_type" in admin_rows.columns
            else 0
        )
    else:
        admin_credit = 0
        admin_debit = 0
    balance = float(base_balance + credit - debit)

    return {
        "totals": totals,
        "errors": errors,
        "transactions": transactions_df,
        "transaction_totals": {
            "credit": float(credit),
            "debit": float(debit),
            "admin_credit": float(admin_credit),
            "admin_debit": float(admin_debit),
            "cash_received_from_agent": float(admin_credit),
            "remaining_to_owner": max(-balance, 0.0),
            "owner_credit_to_agent": max(balance, 0.0),
        },
        "balance": balance,
    }
