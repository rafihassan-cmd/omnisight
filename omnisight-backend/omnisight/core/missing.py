from __future__ import annotations

import pandas as pd
from pandas.api import types as pdt

from .errors import CleaningError
from .serialization import frame_to_records, json_scalar
from .validation import require_columns

STRATEGIES = ("drop", "fill", "mean", "median", "mode", "max", "min")
_NUMERIC_ONLY = {"mean", "median", "max", "min"}


def _validate(df, columns, strategy):
    if not columns:
        raise CleaningError("Select at least one column.")
    if strategy not in STRATEGIES:
        raise CleaningError(f"Unknown strategy {strategy!r}. Choose from {list(STRATEGIES)}.")
    require_columns(df, columns)


def _coerce_literal(series: pd.Series, value):
    """Cast a user-typed fill value to the column's dtype (or refuse)."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        raise CleaningError("Provide a fill value.")
    dtype = series.dtype
    try:
        if pdt.is_bool_dtype(dtype):
            text = str(value).strip().lower()
            if text not in {"true", "false"}:
                raise ValueError("expected true or false")
            return text == "true"
        if pdt.is_integer_dtype(dtype):
            number = float(value)
            if number != int(number):
                raise ValueError("expected a whole number")
            return int(number)
        if pdt.is_float_dtype(dtype):
            return float(value)
        if pdt.is_datetime64_any_dtype(dtype):
            return pd.Timestamp(value)
        return str(value)
    except (TypeError, ValueError) as exc:
        raise CleaningError(
            f"Cannot use {value!r} to fill {series.name!r} (type {dtype}): {exc}"
        ) from exc


def resolve_fill_value(series: pd.Series, strategy: str, value=None):
    if strategy == "fill":
        return _coerce_literal(series, value)
    if not series.notna().any():
        raise CleaningError(f"Column {series.name!r} has no values to compute '{strategy}' from.")
    if strategy in _NUMERIC_ONLY:
        if not pdt.is_numeric_dtype(series) or pdt.is_bool_dtype(series):
            raise CleaningError(
                f"'{strategy}' needs a numeric column, but {series.name!r} is {series.dtype}. "
                "Convert it to numeric first."
            )
        return getattr(series, strategy)()
    return series.mode(dropna=True).iloc[0]  # strategy == "mode"


def _fill_series(series: pd.Series, fill) -> pd.Series:
    if pdt.is_integer_dtype(series.dtype) and isinstance(fill, float) and fill != int(fill):
        series = series.astype("Float64")
    if isinstance(series.dtype, pd.CategoricalDtype) and fill not in series.cat.categories:
        series = series.cat.add_categories([fill])
    return series.fillna(fill)


def apply_missing(
    df: pd.DataFrame, columns: list[str], strategy: str, value=None
) -> pd.DataFrame:
    _validate(df, columns, strategy)
    if strategy == "drop":
        return df.dropna(subset=list(columns))
    out = df.copy(deep=False)
    for col in columns:
        s = df[col]
        if s.isna().any():
            out[col] = _fill_series(s, resolve_fill_value(s, strategy, value))
    return out


def preview_missing(
    df: pd.DataFrame, columns: list[str], strategy: str, value=None, limit: int = 50
) -> dict:
    """What apply_missing WOULD do. Never copies or modifies the full frame."""
    _validate(df, columns, strategy)
    mask = df[list(columns)].isna().any(axis=1)
    affected = int(mask.sum())
    sample = df[mask].head(limit).copy()
    result = {"strategy": strategy, "affected_rows": affected}

    if strategy == "drop":
        result["rows_after"] = int(len(df) - affected)
        result["fill_values"] = {}
    else:
        fills = {c: resolve_fill_value(df[c], strategy, value) for c in columns}
        for col, fill in fills.items():
            sample[f"{col}__new"] = _fill_series(sample[col], fill)
        result["rows_after"] = int(len(df))
        result["fill_values"] = {c: json_scalar(v) for c, v in fills.items()}

    result["sample"] = frame_to_records(sample)
    return result
