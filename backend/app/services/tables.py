import pandas as pd

from backend.app.db.supabase import get_supabase


def get_table_records(table_name):
    response = get_supabase().table(table_name).select("*").execute()
    if response.data is None:
        raise RuntimeError(f"No data found from {table_name}")
    return pd.DataFrame(response.data)

