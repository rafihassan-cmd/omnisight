from __future__ import annotations

import pandas as pd

from .errors import CleaningError
from .serialization import frame_to_records


def column_names(df: pd.DataFrame) -> dict[str, str]:
    names = df.attrs.get("column_names", {})
    return {cid: names.get(cid, str(cid)) for cid in df.columns}


def duplicate_groups(df: pd.DataFrame) -> list[dict]:
    groups = {}
    for cid, name in column_names(df).items():
        groups.setdefault(name, []).append(cid)
    return [{"name": name, "column_ids": ids} for name, ids in groups.items() if len(ids) > 1]


def column_profile(df: pd.DataFrame) -> list[dict]:
    n = len(df)
    names = column_names(df)
    profiles = []

    for position, cid in enumerate(df.columns):
        series = df[cid]
        missing = int(series.isna().sum())

        is_numeric = (
            pd.api.types.is_numeric_dtype(series.dtype)
            and not pd.api.types.is_bool_dtype(series.dtype)
        )

        profiles.append(
            {
                "id": cid,
                "name": names[cid],
                "position": position,
                "dtype": str(series.dtype),
                "is_numeric": is_numeric,
                "unique": int(series.nunique()),
                "missing": missing,
                "missing_pct": (
                    round(100 * missing / n, 2) if n else 0.0
                ),
            }
        )

    return profiles

def shape_stats(df: pd.DataFrame) -> dict:
    return {"rows": len(df), "columns": df.shape[1], "missing_cells": int(df.isna().sum().sum())}


def preview(df: pd.DataFrame, offset: int = 0, limit: int = 20,
            column_ids: list[str] | None = None) -> dict:
    ids = list(df.columns) if column_ids is None else column_ids
    if len(set(ids)) != len(ids) or any(cid not in df.columns for cid in ids):
        raise CleaningError("Preview contains unknown or repeated column IDs.")
    names = column_names(df)
    head = df.iloc[offset:offset + limit][ids]
    return {"total_rows": len(df), "offset": offset, "limit": limit,
            "columns": [{"id": cid, "name": names[cid]} for cid in ids],
            "rows": frame_to_records(head) if ids else [{} for _ in range(len(head))]}
