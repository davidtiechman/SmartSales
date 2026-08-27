from datetime import datetime

import pandas as pd


def df_to_records(df: pd.DataFrame):
    if df.empty:
        return []

    def normalize(value):
        if value is None:
            return None
        try:
            if pd.isna(value):
                return None
        except (TypeError, ValueError):
            pass
        if isinstance(value, (pd.Timestamp, datetime)):
            return value.isoformat()
        if hasattr(value, "item"):
            return value.item()
        return value

    return [
        {key: normalize(value) for key, value in row.items()}
        for row in df.to_dict(orient="records")
    ]

