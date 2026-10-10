from __future__ import annotations

import pandas as pd

from .conversion import numeric_series
from .errors import CleaningError
from .profiling import column_names, duplicate_groups
from .serialization import frame_to_records
from .validation import require_columns


def rename_column(df: pd.DataFrame, column_id: str, new_name: str) -> pd.DataFrame:
    require_columns(df, [column_id])
    if not isinstance(new_name, str) or not new_name.strip():
        raise CleaningError("Column names cannot be empty.")
    names = column_names(df)
    if new_name == names[column_id]:
        raise CleaningError("Enter a different name.")
    if any(name == new_name for cid, name in names.items() if cid != column_id):
        raise CleaningError("That column name is already in use. Choose a unique name.")
    out = df.copy(deep=False)
    out.attrs["column_names"] = {**names, column_id: new_name}
    return out


def discard_column(df: pd.DataFrame, column_id: str) -> pd.DataFrame:
    require_columns(df, [column_id])
    duplicate_ids = {cid for group in duplicate_groups(df) for cid in group["column_ids"]}
    if column_id not in duplicate_ids:
        raise CleaningError("Discard is only available for a duplicate column name.")
    out = df.drop(columns=[column_id])
    out.attrs["column_names"] = {cid: name for cid, name in column_names(df).items()
                                if cid != column_id}
    return out


def remove_affix(df: pd.DataFrame, column_id: str, mode: str, text: str,
                 convert_to_numeric: bool = False) -> pd.DataFrame:
    require_columns(df, [column_id])
    if not isinstance(mode, str) or mode not in ("prefix", "suffix"):
        raise CleaningError("Mode must be prefix or suffix.")
    if not isinstance(text, str) or not text:
        raise CleaningError("Provide nonempty text to remove.")
    if not isinstance(convert_to_numeric, bool):
        raise CleaningError("convert_to_numeric must be true or false.")
    strip = str.removeprefix if mode == "prefix" else str.removesuffix
    original = df[column_id]
    cleaned = original.map(lambda value: strip(value, text) if isinstance(value, str) else value)
    if convert_to_numeric:
        cleaned = numeric_series(cleaned)
    out = df.copy(deep=False)
    out[column_id] = cleaned
    return out


def preview_affix(df: pd.DataFrame, column_id: str, mode: str, text: str,
                  convert_to_numeric: bool = False) -> dict:
    out = remove_affix(df, column_id, mode, text, convert_to_numeric)
    before, after = df[column_id], out[column_id]
    changed = ~(before.eq(after).fillna(False) | (before.isna() & after.isna()))
    sample = pd.DataFrame({"row": range(1, len(df) + 1), "before": before.to_numpy(),
                           "after": after.to_numpy()}).head(20)
    return {"valid": True, "changed_cells": int(changed.sum()),
            "dtype_after": str(after.dtype), "sample": frame_to_records(sample)}
