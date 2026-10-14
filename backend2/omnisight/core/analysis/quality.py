"""Dataset-level data quality analyses."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pandas as pd

from omnisight.core.analysis.common import (
    make_metric,
    make_table,
)

from omnisight.core.analysis.contracts import (
    AnalysisResult,
)

if TYPE_CHECKING:
    from omnisight.services.planner import (
        ValidatedAnalysisPlan,
    )


MAX_QUALITY_COLUMNS = 100


def run_missing_values(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    plan: ValidatedAnalysisPlan,
) -> AnalysisResult:
    """Analyze missing values across dataset columns."""

    row_count, column_count = dataframe.shape

    if len(column_ids) != column_count:
        raise ValueError(
            "Column identifiers do not match the dataset."
        )

    rows = []
    total_missing = 0
    affected_columns = 0

    for index in range(column_count):
        series = dataframe.iloc[:, index]

        missing_count = int(
            series.isna().sum()
        )

        total_missing += missing_count

        if missing_count > 0:
            affected_columns += 1

        percentage = (
            missing_count / row_count * 100
            if row_count
            else 0.0
        )

        rows.append({
            "column_id": column_ids[index],
            "column": str(series.name),
            "missing_count": missing_count,
            "missing_percent": round(
                percentage,
                4,
            ),
        })

    rows.sort(
        key=lambda item: (
            -item["missing_count"],
            item["column"].casefold(),
        )
    )

    warnings = []

    if len(rows) > MAX_QUALITY_COLUMNS:
        warnings.append(
            "Only the 100 columns with the highest "
            "missing-value counts are returned."
        )

    visible_rows = rows[:MAX_QUALITY_COLUMNS]

    total_cells = row_count * column_count

    overall_percentage = (
        total_missing / total_cells * 100
        if total_cells
        else 0.0
    )

    return AnalysisResult(
        metrics=[
            make_metric(
                "total_rows",
                "Dataset Rows",
                int(row_count),
            ),
            make_metric(
                "total_columns",
                "Dataset Columns",
                int(column_count),
            ),
            make_metric(
                "total_missing",
                "Missing Cells",
                int(total_missing),
            ),
            make_metric(
                "overall_missing_percent",
                "Overall Missing Percentage",
                round(overall_percentage, 4),
            ),
            make_metric(
                "affected_columns",
                "Columns with Missing Values",
                affected_columns,
            ),
        ],
        table=make_table(
            [
                ("column_id", "Column ID", "nominal"),
                ("column", "Column", "nominal"),
                (
                    "missing_count",
                    "Missing Count",
                    "quantitative",
                ),
                (
                    "missing_percent",
                    "Missing Percentage",
                    "quantitative",
                ),
            ],
            visible_rows,
            total_rows=column_count,
        ),
        warnings=warnings,
        metadata={
            "rows": int(row_count),
            "columns": int(column_count),
            "total_cells": int(total_cells),
            "sort_order": "missing_count_descending",
        },
    )