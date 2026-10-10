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
    return [{"id": cid, "name": names[cid], "position": i, "dtype": str(df[cid].dtype),
             "unique": int(df[cid].nunique()), "missing": int(df[cid].isna().sum()),
             "missing_pct": round(100 * int(df[cid].isna().sum()) / n, 2) if n else 0.0}
            for i, cid in enumerate(df.columns)]


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
