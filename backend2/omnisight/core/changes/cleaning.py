"""Pure, deterministic dataset cleaning operations."""

from __future__ import annotations

import math
from typing import Any, Callable

import numpy as np
import pandas as pd

from pandas.api.types import (
    is_bool_dtype,
    is_datetime64_any_dtype,
    is_numeric_dtype,
)


class CleaningValidationError(ValueError):
    """Invalid operation parameters or incompatible data."""


class ConversionRejected(CleaningValidationError):
    """A conversion would invalidate existing values."""


def validate_keys(
    params: dict[str, Any],
    required: set[str],
    optional: set[str] | None = None,
) -> None:
    """Reject missing and unexpected parameters."""

    if not isinstance(params, dict):
        raise CleaningValidationError(
            "Operation parameters must be an object."
        )

    allowed = required | (optional or set())

    missing = required - params.keys()
    unknown = params.keys() - allowed

    if missing:
        raise CleaningValidationError(
            f"Missing parameters: {sorted(missing)}"
        )

    if unknown:
        raise CleaningValidationError(
            f"Unknown parameters: {sorted(unknown)}"
        )


def choice(
    params: dict,
    key: str,
    allowed: tuple[str, ...],
    default: str,
) -> str:
    value = params.get(key, default)

    if value not in allowed:
        raise CleaningValidationError(
            f"{key} must be one of: {', '.join(allowed)}"
        )

    return value


def boolean(
    params: dict,
    key: str,
    default: bool = False,
) -> bool:
    value = params.get(key, default)

    if not isinstance(value, bool):
        raise CleaningValidationError(
            f"{key} must be a boolean."
        )

    return value


def column_position(
    df: pd.DataFrame,
    column_ids: list[str],
    column_id: str,
) -> int:
    if len(column_ids) != len(df.columns):
        raise CleaningValidationError(
            "Dataset column metadata is inconsistent."
        )

    if not isinstance(column_id, str):
        raise CleaningValidationError(
            "A valid column_id is required."
        )

    try:
        return column_ids.index(column_id)
    except ValueError as exc:
        raise CleaningValidationError(
            "Column identifier not found."
        ) from exc


def selected_positions(
    df: pd.DataFrame,
    column_ids: list[str],
    selected: Any,
) -> list[int]:
    """Return selected positions; [] selects every column."""

    if selected is None:
        selected = []

    if not isinstance(selected, list):
        raise CleaningValidationError(
            "column_ids must be an array."
        )

    if len(selected) != len(set(
        str(item) for item in selected
    )):
        raise CleaningValidationError(
            "Duplicate column identifiers are not allowed."
        )

    if not selected:
        return list(range(len(df.columns)))

    return [
        column_position(df, column_ids, item)
        for item in selected
    ]


def replace_column(
    df: pd.DataFrame,
    position: int,
    values: pd.Series,
) -> pd.DataFrame:
    """
    Return a new DataFrame with one replaced column.

    isetitem replaces the selected column rather than
    modifying a shared input column in place.
    """

    result = df.copy(deep=False)
    result.isetitem(position, values)

    return result


def details(
    df: pd.DataFrame,
    result: pd.DataFrame,
    affected_rows: int,
    column_ids: list[str],
    **extra: Any,
) -> dict[str, Any]:
    return {
        "changed": affected_rows > 0,
        "rows_before": int(len(df)),
        "rows_after": int(len(result)),
        "affected_rows": int(affected_rows),
        "column_ids": column_ids,
        **extra,
    }


def text_column(
    series: pd.Series,
) -> None:
    """Prevent implicit conversion or loss of non-text data."""

    if (
        is_bool_dtype(series.dtype)
        or is_numeric_dtype(series.dtype)
        or is_datetime64_any_dtype(series.dtype)
    ):
        raise CleaningValidationError(
            "This operation requires a text column."
        )

    non_null = series.dropna()

    if not non_null.map(
        lambda value: isinstance(value, str)
    ).all():
        raise CleaningValidationError(
            "Column contains non-text values."
        )


def transform_text(
    df: pd.DataFrame,
    column_ids: list[str],
    params: dict,
    transform: Callable[[str], str],
) -> tuple[pd.DataFrame, dict]:
    """Common executor for text transformations."""

    idx = column_position(
        df, column_ids, params["column_id"]
    )

    series = df.iloc[:, idx]

    text_column(series)

    converted = series.map(
        lambda value: (
            transform(value)
            if isinstance(value, str)
            else value
        )
    )

    valid = series.notna()

    changed_count = int(
        (
            series.loc[valid].astype(str)
            != converted.loc[valid].astype(str)
        ).sum()
    )

    if changed_count == 0:
        return df, details(
            df, df, 0, [column_ids[idx]]
        )

    result = replace_column(df, idx, converted)

    return result, details(
        df, result, changed_count, [column_ids[idx]]
    )


# -------------------------------------------------
# Row operations
# -------------------------------------------------

def drop_duplicates(
    df: pd.DataFrame,
    ids: list[str],
    params: dict,
) -> tuple[pd.DataFrame, dict]:
    validate_keys(
        params,
        required=set(),
        optional={"column_ids", "keep"},
    )

    positions = selected_positions(
        df, ids, params.get("column_ids", [])
    )

    keep = choice(
        params,
        "keep",
        ("first", "last", "none"),
        "first",
    )

    pandas_keep = False if keep == "none" else keep

    result = df.drop_duplicates(
        subset=[df.columns[i] for i in positions],
        keep=pandas_keep,
        ignore_index=True,
    )

    removed = len(df) - len(result)

    if removed == 0:
        return df, details(
            df, df, 0, [ids[i] for i in positions],
            removed_rows=0,
        )

    return result, details(
        df, result, removed,
        [ids[i] for i in positions],
        removed_rows=int(removed),
    )


def drop_missing_rows(
    df: pd.DataFrame,
    ids: list[str],
    params: dict,
) -> tuple[pd.DataFrame, dict]:
    validate_keys(
        params,
        required=set(),
        optional={"column_ids", "how"},
    )

    positions = selected_positions(
        df, ids, params.get("column_ids", [])
    )

    how = choice(
        params, "how", ("any", "all"), "any"
    )

    result = df.dropna(
        axis=0,
        how=how,
        subset=[df.columns[i] for i in positions],
    ).reset_index(drop=True)

    removed = len(df) - len(result)

    if removed == 0:
        return df, details(
            df, df, 0, [ids[i] for i in positions],
            removed_rows=0,
        )

    return result, details(
        df, result, removed,
        [ids[i] for i in positions],
        removed_rows=int(removed),
    )


# -------------------------------------------------
# Missing value operations
# -------------------------------------------------

def fill_mean(
    df: pd.DataFrame,
    ids: list[str],
    params: dict,
) -> tuple[pd.DataFrame, dict]:
    validate_keys(params, {"column_id"})

    idx = column_position(df, ids, params["column_id"])
    series = df.iloc[:, idx]

    if (
        is_bool_dtype(series.dtype)
        or not is_numeric_dtype(series.dtype)
    ):
        raise CleaningValidationError(
            "Mean imputation requires a numeric column."
        )

    missing_count = int(series.isna().sum())

    if missing_count == 0:
        return df, details(
            df, df, 0, [ids[idx]]
        )

    observed = series.dropna().to_numpy(
        dtype="float64"
    )

    if (
        len(observed) == 0
        or not np.isfinite(observed).all()
    ):
        raise CleaningValidationError(
            "Cannot calculate a mean from this column. "
            "At least one finite value is required, "
            "and non-finite values must be resolved."
        )

    mean = float(np.mean(observed))

    if not math.isfinite(mean):
        raise CleaningValidationError(
            "Calculated mean is not finite."
        )

    # Float64 accommodates fractional means in
    # originally integer-valued nullable columns.
    values = series.astype("float64").fillna(mean)

    result = replace_column(df, idx, values)

    return result, details(
        df, result, missing_count, [ids[idx]],
        fill_value=mean,
    )


def fill_constant(
    df: pd.DataFrame,
    ids: list[str],
    params: dict,
) -> tuple[pd.DataFrame, dict]:
    validate_keys(
        params,
        {"column_id", "value"},
    )

    idx = column_position(df, ids, params["column_id"])
    series = df.iloc[:, idx]
    value = params["value"]

    if (
        value is None
        or type(value) not in (str, int, float, bool)
    ):
        raise CleaningValidationError(
            "Fill value must be a non-null JSON scalar."
        )

    if type(value) is float and not math.isfinite(value):
        raise CleaningValidationError(
            "Fill value must be finite."
        )

    if is_bool_dtype(series.dtype):
        valid = type(value) is bool
    elif is_numeric_dtype(series.dtype):
        valid = (
            type(value) in (int, float)
            and not (
                isinstance(value, float)
                and not math.isfinite(value)
            )
        )
    elif is_datetime64_any_dtype(series.dtype):
        raise CleaningValidationError(
            "Datetime constant imputation is not "
            "supported in this operation yet."
        )
    else:
        text_column(series)
        valid = isinstance(value, str)

    if not valid:
        raise CleaningValidationError(
            "Fill value does not match the column type."
        )

    missing_count = int(series.isna().sum())

    if missing_count == 0:
        return df, details(
            df, df, 0, [ids[idx]]
        )

    try:
        values = series.fillna(value)
    except (TypeError, ValueError) as exc:
        raise CleaningValidationError(
            f"Cannot fill this column: {exc}"
        ) from exc

    result = replace_column(df, idx, values)

    return result, details(
        df, result, missing_count, [ids[idx]],
        fill_value=value,
    )


# -------------------------------------------------
# Text operations
# -------------------------------------------------

def trim_text(
    df: pd.DataFrame,
    ids: list[str],
    params: dict,
) -> tuple[pd.DataFrame, dict]:
    validate_keys(
        params,
        {"column_id"},
        {"mode"},
    )

    mode = choice(
        params,
        "mode",
        ("both", "left", "right"),
        "both",
    )

    transformers = {
        "both": str.strip,
        "left": str.lstrip,
        "right": str.rstrip,
    }

    return transform_text(
        df, ids, params, transformers[mode]
    )


def strip_affixes(
    df: pd.DataFrame,
    ids: list[str],
    params: dict,
) -> tuple[pd.DataFrame, dict]:
    validate_keys(
        params,
        {"column_id"},
        {"prefix", "suffix"},
    )

    prefix = params.get("prefix", "")
    suffix = params.get("suffix", "")

    if not isinstance(prefix, str) or not isinstance(
        suffix, str
    ):
        raise CleaningValidationError(
            "Prefix and suffix must be strings."
        )

    if not prefix and not suffix:
        raise CleaningValidationError(
            "Provide a prefix or suffix to remove."
        )

    def transform(value: str) -> str:
        if prefix:
            value = value.removeprefix(prefix)

        if suffix:
            value = value.removesuffix(suffix)

        return value

    return transform_text(
        df, ids, params, transform
    )


def remove_separators(
    df: pd.DataFrame,
    ids: list[str],
    params: dict,
) -> tuple[pd.DataFrame, dict]:
    validate_keys(
        params,
        {"column_id", "characters"},
    )

    characters = params["characters"]

    if (
        not isinstance(characters, str)
        or not characters
        or len(characters) > 16
    ):
        raise CleaningValidationError(
            "Provide 1–16 separator characters."
        )

    translation = str.maketrans(
        "", "", characters
    )

    return transform_text(
        df,
        ids,
        params,
        lambda value: value.translate(translation),
    )

# -------------------------------------------------
# Type conversion operations
# -------------------------------------------------

def convert_to_numeric(
    df: pd.DataFrame,
    ids: list[str],
    params: dict,
) -> tuple[pd.DataFrame, dict]:
    validate_keys(
        params,
        {"column_id"},
        {"invalid"},
    )

    idx = column_position(df, ids, params["column_id"])
    series = df.iloc[:, idx]

    invalid_policy = choice(
        params,
        "invalid",
        ("reject", "null"),
        "reject",
    )

    if is_bool_dtype(series.dtype):
        raise CleaningValidationError(
            "Boolean columns cannot be implicitly "
            "converted to numeric values."
        )

    if is_datetime64_any_dtype(series.dtype):
        raise CleaningValidationError(
            "Datetime columns require an explicit "
            "numeric interpretation."
        )

    if is_numeric_dtype(series.dtype):
        return df, details(
            df, df, 0, [ids[idx]],
            old_dtype=str(series.dtype),
            new_dtype=str(series.dtype),
            introduced_nulls=0,
        )

    text_column(series)

    try:
        converted = pd.to_numeric(
            series,
            errors="coerce",
        )

        # Treat infinite converted values as invalid
        # rather than returning non-finite statistics.
        converted = converted.replace(
            [np.inf, -np.inf],
            np.nan,
        )

    except (TypeError, ValueError, OverflowError) as exc:
        raise CleaningValidationError(
            f"Numeric conversion failed: {exc}"
        ) from exc

    invalid_mask = (
        series.notna() & converted.isna()
    )

    invalid_count = int(invalid_mask.sum())

    if invalid_count and invalid_policy == "reject":
        raise ConversionRejected(
            f"{invalid_count} non-null values cannot "
            "be converted to numeric values. "
            "Resolve them first or explicitly "
            "choose the null conversion policy."
        )

    result = replace_column(df, idx, converted)

    return result, details(
        df,
        result,
        affected_rows=int(series.notna().sum()),
        column_ids=[ids[idx]],
        changed=True,
        old_dtype=str(series.dtype),
        new_dtype=str(converted.dtype),
        introduced_nulls=invalid_count,
    )


def convert_to_datetime(
    df: pd.DataFrame,
    ids: list[str],
    params: dict,
) -> tuple[pd.DataFrame, dict]:
    validate_keys(
        params,
        {"column_id"},
        {"format", "dayfirst", "utc", "invalid"},
    )

    idx = column_position(df, ids, params["column_id"])
    series = df.iloc[:, idx]

    invalid_policy = choice(
        params,
        "invalid",
        ("reject", "null"),
        "reject",
    )

    date_format = params.get("format", "mixed")

    if (
        not isinstance(date_format, str)
        or not date_format
        or len(date_format) > 100
    ):
        raise CleaningValidationError(
            "Datetime format must be a non-empty string."
        )

    dayfirst = boolean(params, "dayfirst", False)
    utc = boolean(params, "utc", False)

    if is_datetime64_any_dtype(series.dtype):
        return df, details(
            df, df, 0, [ids[idx]],
            old_dtype=str(series.dtype),
            new_dtype=str(series.dtype),
            introduced_nulls=0,
        )

    text_column(series)

    try:
        converted = pd.to_datetime(
            series,
            format=date_format,
            dayfirst=dayfirst,
            utc=utc,
            errors="coerce",
        )

    except (TypeError, ValueError, OverflowError) as exc:
        raise CleaningValidationError(
            f"Datetime conversion failed: {exc}"
        ) from exc

    # Reject object results caused by incompatible
    # timezone representations.
    if not (
        is_datetime64_any_dtype(converted.dtype)
        or isinstance(
            converted.dtype,
            pd.DatetimeTZDtype,
        )
    ):
        raise CleaningValidationError(
            "Datetime conversion produced an "
            "unsupported dtype. Try utc=true."
        )

    invalid_mask = (
        series.notna() & converted.isna()
    )

    invalid_count = int(invalid_mask.sum())

    if invalid_count and invalid_policy == "reject":
        raise ConversionRejected(
            f"{invalid_count} non-null values cannot "
            "be converted to datetime values. "
            "Specify a format or explicitly "
            "choose the null conversion policy."
        )

    result = replace_column(df, idx, converted)

    return result, details(
        df,
        result,
        affected_rows=int(series.notna().sum()),
        column_ids=[ids[idx]],
        changed=True,
        old_dtype=str(series.dtype),
        new_dtype=str(converted.dtype),
        introduced_nulls=invalid_count,
    )