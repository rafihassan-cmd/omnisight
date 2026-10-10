from __future__ import annotations

import pandas as pd

from .errors import CleaningError


def require_columns(df: pd.DataFrame, columns) -> None:
    if not isinstance(columns, list) or any(not isinstance(c, str) for c in columns):
        raise CleaningError("Column IDs must be strings in a list.")
    unknown = [c for c in columns if c not in df.columns]
    if unknown:
        raise CleaningError(f"Unknown column(s): {unknown}")
