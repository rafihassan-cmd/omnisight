from __future__ import annotations

from decimal import Decimal, InvalidOperation
import math

import numpy as np
import pandas as pd
from pandas.api import types as pdt

from .errors import CleaningError
from .serialization import frame_to_records, json_scalar
from .validation import require_columns

STRATEGIES = ("mean", "median", "mode", "fill", "drop")
_NUMERIC_ONLY = {"mean", "median"}


def _prepare(df, columns, empty_strings, whitespace, tokens, match_case):
    require_columns(df, columns)

    if len(columns) != 1:
        raise CleaningError(
            "Select exactly one column for missing-value management."
        )

    if any(
        not isinstance(flag, bool)
        for flag in (empty_strings, whitespace, match_case)
    ):
        raise CleaningError("Missing-value options must be true or false.")

    tokens = [] if tokens is None else tokens

    if not isinstance(tokens, list) or any(
        not isinstance(token, str) or not token for token in tokens
    ):
        raise CleaningError(
            "Placeholders must be a list of nonempty strings. "
            "Use the empty-string option for blanks."
        )

    lookup = set(
        tokens if match_case else [token.casefold() for token in tokens]
    )

    def extra_missing(value):
        if not isinstance(value, str):
            return False

        if empty_strings and value == "":
            return True

        if whitespace and value != "" and not value.strip():
            return True

        candidate = value if match_case else value.casefold()
        return candidate in lookup

    column = columns[0]
    original = df[column]

    existing = original.isna()
    additional = (
        original.map(extra_missing).fillna(False).astype(bool) & ~existing
    )

    mask = existing | additional
    prepared = original.mask(mask, pd.NA)

    return (
        column,
        original,
        prepared,
        mask,
        int(existing.sum()),
        int(additional.sum()),
    )


def _is_numeric(series):
    return (
        pdt.is_numeric_dtype(series.dtype)
        and not pdt.is_bool_dtype(series.dtype)
    )


def _safe_value(value):
    value = json_scalar(value)

    if isinstance(value, float) and not math.isfinite(value):
        raise CleaningError("The replacement must be a finite number.")

    return value


def _coerce_literal(series, value):
    if value is None or (
        isinstance(value, str) and not value.strip()
    ):
        raise CleaningError("Provide a nonempty fill value.")

    dtype = series.dtype

    try:
        if pdt.is_bool_dtype(dtype):
            text = str(value).strip().casefold()

            if text not in {"true", "false"}:
                raise ValueError("expected true or false")

            return text == "true"

        if pdt.is_integer_dtype(dtype):
            number = Decimal(str(value).strip())

            if (
                not number.is_finite()
                or number != number.to_integral_value()
            ):
                raise ValueError("expected a finite whole number")

            limits = np.iinfo(getattr(dtype, "numpy_dtype", dtype))

            if not limits.min <= number <= limits.max:
                raise ValueError(
                    "number is outside the column's integer range"
                )

            return int(number)

        if pdt.is_float_dtype(dtype):
            number = float(value)
            limits = np.finfo(getattr(dtype, "numpy_dtype", dtype))

            if not math.isfinite(number) or abs(number) > limits.max:
                raise ValueError(
                    "expected a finite number within the column's range"
                )

            return number

        if pdt.is_datetime64_any_dtype(dtype):
            timestamp = pd.Timestamp(value)

            if pd.isna(timestamp):
                raise ValueError("expected a valid date")

            return timestamp

        if not isinstance(value, str):
            raise ValueError("expected text")

        return value

    except (
        InvalidOperation,
        TypeError,
        ValueError,
        OverflowError,
    ) as exc:
        raise CleaningError(
            f"Cannot use {value!r} to fill a column of type {dtype}: {exc}"
        ) from exc


def resolve_fill_value(series: pd.Series, strategy: str, value=None):
    if strategy == "fill":
        return _coerce_literal(series, value)

    if strategy not in {"mean", "median", "mode"}:
        raise CleaningError(
            "Choose mean, median, mode, custom fill or row removal."
        )

    if not series.notna().any():
        raise CleaningError(
            "This column has no observed values. "
            "Use custom fill or row removal."
        )

    if strategy in _NUMERIC_ONLY:
        if not _is_numeric(series):
            raise CleaningError(
                f"'{strategy}' needs a numeric column. "
                "Convert the column in Part 1 first."
            )

        if not np.isfinite(
            series.dropna().astype("float64")
        ).all():
            raise CleaningError(
                "Mean and median require finite observed values."
            )

        return _safe_value(getattr(series, strategy)())

    return _safe_value(series.mode(dropna=True).iloc[0])


def _fill_series(series: pd.Series, fill) -> pd.Series:
    if (
        pdt.is_integer_dtype(series.dtype)
        and isinstance(fill, float)
        and not fill.is_integer()
    ):
        series = series.astype("Float64")

    if (
        isinstance(series.dtype, pd.CategoricalDtype)
        and fill not in series.cat.categories
    ):
        series = series.cat.add_categories([fill])

    try:
        return series.fillna(fill)

    except (TypeError, ValueError, OverflowError) as exc:
        raise CleaningError(
            f"The replacement cannot be stored in this column: {exc}"
        ) from exc


def _available(series, affected):
    if not affected:
        return []

    allowed = {"fill", "drop"}

    if series.notna().any():
        allowed.add("mode")

        if _is_numeric(series) and np.isfinite(
            series.dropna().astype("float64")
        ).all():
            allowed.update(_NUMERIC_ONLY)

    return [
        strategy
        for strategy in STRATEGIES
        if strategy in allowed
    ]


def _replacement(
    series,
    strategy,
    value,
    columns,
    empty_strings,
    whitespace,
    tokens,
    match_case,
):
    if strategy not in STRATEGIES:
        raise CleaningError(
            f"Unknown strategy {strategy!r}. "
            f"Choose from {list(STRATEGIES)}."
        )

    if strategy == "drop":
        return None

    fill = resolve_fill_value(series, strategy, value)

    # Reject replacements that would themselves count as missing.
    probe = pd.DataFrame({columns[0]: [fill]})

    _, _, _, missing, _, _ = _prepare(
        probe,
        columns,
        empty_strings,
        whitespace,
        tokens,
        match_case,
    )

    if bool(missing.iloc[0]):
        raise CleaningError(
            "The fill value also matches your missing-value rules. "
            "Choose another value."
        )

    return fill


def apply_missing(
    df: pd.DataFrame,
    columns: list[str],
    strategy: str,
    value=None,
    empty_strings: bool = False,
    whitespace: bool = False,
    tokens: list[str] | None = None,
    match_case: bool = True,
) -> pd.DataFrame:
    column, _, prepared, mask, _, _ = _prepare(
        df,
        columns,
        empty_strings,
        whitespace,
        tokens,
        match_case,
    )

    if not mask.any():
        raise CleaningError(
            "No missing values match these rules in the selected column."
        )

    fill = _replacement(
        prepared,
        strategy,
        value,
        columns,
        empty_strings,
        whitespace,
        tokens,
        match_case,
    )

    if strategy == "drop":
        return df.loc[~mask].copy()

    out = df.copy(deep=False)
    out[column] = _fill_series(prepared, fill)

    return out


def preview_missing(
    df: pd.DataFrame,
    columns: list[str],
    strategy: str | None = None,
    value=None,
    empty_strings: bool = False,
    whitespace: bool = False,
    tokens: list[str] | None = None,
    match_case: bool = True,
    limit: int = 20,
) -> dict:
    """Without a strategy, inspect matches and compatible strategies."""

    if (
        not isinstance(limit, int)
        or isinstance(limit, bool)
        or not 1 <= limit <= 500
    ):
        raise CleaningError("Preview limit must be between 1 and 500.")

    column, original, prepared, mask, existing, additional = _prepare(
        df,
        columns,
        empty_strings,
        whitespace,
        tokens,
        match_case,
    )

    affected = int(mask.sum())
    positions = np.flatnonzero(mask.to_numpy(dtype=bool))[:limit]

    sample = pd.DataFrame(
        {
            "row": positions + 1,
            column: original.iloc[positions].to_numpy(),
        }
    )

    result = {
        "strategy": strategy,
        "column_id": column,
        "dtype": str(original.dtype),
        "existing_missing": existing,
        "additional_missing": additional,
        "affected_rows": affected,
        "missing_pct": (
            round(100 * affected / len(df), 2) if len(df) else 0.0
        ),
        "observed_values": len(df) - affected,
        "rows_before": len(df),
        "rows_after": len(df),
        "supported_strategies": _available(prepared, affected),
        "fill_values": {},
        "warnings": [],
    }

    if strategy is not None:
        if not affected:
            raise CleaningError(
                "No missing values match these rules "
                "in the selected column."
            )

        fill = _replacement(
            prepared,
            strategy,
            value,
            columns,
            empty_strings,
            whitespace,
            tokens,
            match_case,
        )

        if strategy == "drop":
            result["rows_after"] = len(df) - affected
            result["warnings"].append(
                "Entire rows will be removed, including their "
                "values in other columns."
            )

        else:
            filled = _fill_series(prepared, fill)

            sample[f"{column}__new"] = (
                filled.iloc[positions].to_numpy()
            )

            result["fill_values"] = {column: _safe_value(fill)}
            result["dtype_after"] = str(filled.dtype)

            if (
                strategy == "mode"
                and len(prepared.mode(dropna=True)) > 1
            ):
                result["warnings"].append(
                    "Several values are tied for most frequent. "
                    "This preview uses the first mode; use custom "
                    "fill if you prefer another value."
                )

    result["sample"] = frame_to_records(sample)

    return result