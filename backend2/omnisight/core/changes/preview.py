"""Read-only cleaning preview and impact analysis."""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd

from omnisight.core.changes.engine import apply_change
from omnisight.core.changes.cleaning import ConversionRejected


CONVERSION_KINDS = {
    "column.to_numeric",
    "column.to_datetime",
}


def safe_value(value: Any, max_length: int = 160) -> Any:
    """Serialize an individual CSV-derived value safely."""

    if value is None:
        return None

    try:
        missing = pd.isna(value)
        if isinstance(missing, (bool, np.bool_)) and missing:
            return None
    except (TypeError, ValueError):
        pass

    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()

    if isinstance(value, np.datetime64):
        return pd.Timestamp(value).isoformat()

    if isinstance(value, (bool, np.bool_)):
        return bool(value)

    if isinstance(value, (int, np.integer)):
        return int(value)

    if isinstance(value, (float, np.floating)):
        number = float(value)
        return number if math.isfinite(number) else str(number)

    text = str(value)

    if len(text) > max_length:
        return text[:max_length] + "..."

    return text


def make_snapshot(
    df: pd.DataFrame,
    column_ids: list[str],
    max_rows: int,
    max_columns: int,
    target_column_id: str | None = None,
) -> dict[str, Any]:
    """Return a bounded, positional dataset sample."""

    positions = list(
        range(min(len(df.columns), max_columns))
    )

    # Include the selected column even if it is beyond
    # the first 20 columns.
    if (
        target_column_id in column_ids
        and positions
    ):
        target_index = column_ids.index(target_column_id)

        if target_index not in positions:
            positions[-1] = target_index

    selected = df.iloc[:max_rows, positions]

    rows = [
        [safe_value(value) for value in row]
        for row in selected.itertuples(
            index=False,
            name=None,
        )
    ]

    return {
        "column_ids": [column_ids[i] for i in positions],
        "columns": [
            str(df.columns[i]) for i in positions
        ],
        "rows": rows,
        "truncated_columns": (
            len(df.columns) - len(positions)
        ),
    }


def count_missing(df: pd.DataFrame) -> int:
    """Count null cells without creating one giant mask."""

    return sum(
        int(df.iloc[:, i].isna().sum())
        for i in range(len(df.columns))
    )


def get_invalid_examples(
    before: pd.DataFrame,
    after: pd.DataFrame,
    column_ids: list[str],
    target_id: str | None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Show non-null inputs that became null."""

    if (
        target_id not in column_ids
        or len(before) != len(after)
    ):
        return []

    index = column_ids.index(target_id)

    original = before.iloc[:, index]
    converted = after.iloc[:, index]

    invalid_mask = (
        original.notna().to_numpy()
        & converted.isna().to_numpy()
    )

    positions = np.flatnonzero(invalid_mask)[:limit]

    return [
        {
            "row": int(position) + 1,
            "original_value": safe_value(
                original.iloc[position]
            ),
        }
        for position in positions
    ]


def build_cleaning_preview(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    kind: str,
    parameters: dict[str, Any],
    *,
    max_memory_bytes: int,
    sample_rows: int = 5,
    sample_columns: int = 20,
) -> dict[str, Any]:
    """
    Simulate an operation without modifying its input.

    Conversion failures under 'reject' produce a blocked
    preview by simulating the null policy solely for
    diagnostic purposes.
    """

    blocked_reason = None
    simulated_policy = None

    try:
        result, operation_details = apply_change(
            dataframe,
            column_ids,
            kind,
            parameters,
        )

    except ConversionRejected as exc:
        if (
            kind not in CONVERSION_KINDS
            or parameters.get("invalid", "reject") != "reject"
        ):
            raise

        blocked_reason = str(exc)
        simulated_policy = "null"

        diagnostic_params = {
            **parameters,
            "invalid": "null",
        }

        result, operation_details = apply_change(
            dataframe,
            column_ids,
            kind,
            diagnostic_params,
        )

    rows_before = len(dataframe)
    rows_after = len(result)

    missing_before = count_missing(dataframe)
    missing_after = count_missing(result)

    result_memory_bytes = int(
        result.memory_usage(
            index=True,
            deep=True,
        ).sum()
    )

    changed = bool(
        operation_details.get("changed", False)
    )

    affected_rows = int(
        operation_details.get("affected_rows", 0)
    )

    removed_rows = max(
        0,
        int(rows_before - rows_after),
    )

    introduced_nulls = int(
        operation_details.get("introduced_nulls", 0)
    )

    conversion_success_percent = None
    target_id = parameters.get("column_id")

    if (
        kind in CONVERSION_KINDS
        and target_id in column_ids
    ):
        index = column_ids.index(target_id)

        attempted = int(
            dataframe.iloc[:, index].notna().sum()
        )

        if attempted:
            conversion_success_percent = round(
                max(
                    0,
                    attempted - introduced_nulls,
                ) / attempted * 100,
                2,
            )

    warnings = []

    if removed_rows:
        warnings.append(
            f"{removed_rows} rows would be removed."
        )

    if introduced_nulls:
        warnings.append(
            f"{introduced_nulls} existing non-null "
            "values would become null."
        )

    if rows_after == 0:
        warnings.append(
            "The operation would leave an empty dataset."
        )

    if result_memory_bytes > max_memory_bytes:
        blocked_reason = (
            "The transformed dataset exceeds the "
            "configured memory limit."
        )
        warnings.append(
            "The transformed result exceeds the "
            "allowed dataset memory budget."
        )

    if not changed:
        blocked_reason = (
            blocked_reason
            or "The operation would not change the dataset."
        )

    can_apply = changed and blocked_reason is None

    # For row-removal operations, these are independent
    # before/after snapshots, not paired row comparisons.
    comparison_mode = (
        "snapshots"
        if kind.startswith("rows.")
        else "same_row_positions"
    )

    return {
        "kind": kind,
        "parameters": parameters,
        "can_apply": can_apply,
        "changes_detected": changed,
        "validation_error": blocked_reason,
        "warnings": warnings,
        "simulated_policy": simulated_policy,
        "comparison_mode": comparison_mode,
        "impact": {
            "rows_before": rows_before,
            "rows_after": rows_after,
            "missing_before": missing_before,
            "missing_after": missing_after,
            "affected_rows": affected_rows,
            "removed_rows": removed_rows,
            "introduced_nulls": introduced_nulls,
            "conversion_success_percent": (
                conversion_success_percent
            ),
            "estimated_result_memory_bytes": (
                result_memory_bytes
            ),
        },
        "details": operation_details,
        "invalid_examples": get_invalid_examples(
            dataframe,
            result,
            column_ids,
            target_id if kind in CONVERSION_KINDS else None,
        ),
        "before": make_snapshot(
            dataframe,
            column_ids,
            sample_rows,
            sample_columns,
            target_id,
        ),
        "after": make_snapshot(
            result,
            column_ids,
            sample_rows,
            sample_columns,
            target_id,
        ),
    }