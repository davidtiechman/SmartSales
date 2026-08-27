import re

import pandas as pd

from backend.app.core.settings import PRODUCT_PRICES_TABLE
from backend.app.services.tables import get_table_records


def get_prices(table_name=PRODUCT_PRICES_TABLE):
    return get_table_records(table_name)


def parse_size(size_value):
    if size_value is None:
        return None

    value = str(size_value).strip().upper()
    if not value:
        return None

    match = re.search(r"\d+", value)
    if match:
        return int(match.group())
    return None


def get_size_tier(category: str, size_value) -> str:
    category = (category or "").strip()
    size_num = parse_size(size_value)

    if category == "חולצת תלבושת" and size_num is not None:
        if size_num >= 50:
            return "extra large"
        if size_num >= 18:
            return "large"
    return "base"


def find_price_for_sale(prices_df, category, product_name, size_value, sale_date):
    tier = get_size_tier(category, size_value)
    rows = prices_df[
        (prices_df["category"] == category)
        & (prices_df["product_name"] == product_name)
        & (prices_df["size_tier"] == tier)
        & (prices_df["valid_from"] <= sale_date)
        & (prices_df["valid_to"].isna() | (sale_date < prices_df["valid_to"]))
    ]

    if rows.empty:
        raise ValueError(f"No price: {category} | {product_name} | {tier} | {sale_date}")

    row = rows.sort_values("valid_from", ascending=False).iloc[0]
    return float(row["client_price"]), float(row["owner_price"])


def prepare_prices_df(prices_df):
    prepared = prices_df.copy()
    prepared["valid_from"] = pd.to_datetime(prepared["valid_from"], errors="coerce", utc=True)
    if "valid_to" in prepared.columns:
        prepared["valid_to"] = pd.to_datetime(prepared["valid_to"], errors="coerce", utc=True)
    else:
        prepared["valid_to"] = pd.NaT
    return prepared

