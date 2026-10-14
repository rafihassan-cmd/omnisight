"""Extracted statistical additions; no cleaning, plotting or AI calls."""
from __future__ import annotations

import math
import warnings

from scipy import stats

from .analysis_planner import build_plan


def number(value):
    value = float(value)
    return value if math.isfinite(value) else None


def checked_test(
    method,
    structure,
    calculate,
    reason=None,
    assumptions=None,
):
    result = {
        "method": method,
        "status": "unavailable",
        "statistic": None,
        "p_value": None,
        "reason": reason,
        "assumptions": assumptions or [],
    }

    if reason:
        return result

    if structure != "independent":
        result["reason"] = (
            "Independent observations were not confirmed in Part 2."
        )
        return result

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        measured = calculate()

    statistic = number(measured.statistic)
    p_value = number(measured.pvalue)

    if statistic is None or p_value is None:
        result["reason"] = (
            "The test result is undefined or nonfinite."
        )
    else:
        result.update(
            status="computed",
            statistic=statistic,
            p_value=p_value,
        )

    return result


def enrich_result(df, request, result):
    # calculate() has already validated all used columns.
    target = request["target_column_id"]
    goal = request["goal"]
    structure = request.get(
        "observation_structure",
        "unknown",
    )

    data = result["results"]
    values = df[target]

    result["infos"][target].update(
        skew=(
            number(values.skew())
            if len(values) >= 3
            else None
        ),
        excess_kurtosis=(
            number(values.kurt())
            if len(values) >= 4
            else None
        ),
    )

    if goal == "compare_groups":
        group = request["group_column_id"]

        data["category_counts"] = sorted(
            [
                {
                    "category": row["category"],
                    "count": row["count"],
                    "share": (
                        row["count"]
                        / result["rows_analyzed"]
                    ),
                    "percentage": (
                        100 * row["count"]
                        / result["rows_analyzed"]
                    ),
                }
                for row in data["groups"]
            ],
            key=lambda row: -row["count"],
        )

        result["available_graphs"].append({
            "id": "category_counts",
            "label": "Records per group",
            "kind": "bar",
            "data_key": "category_counts",
            "x": "category",
            "y": "count",
        })

        samples = [
            s.to_numpy(dtype=float)
            for _, s in df.groupby(
                group,
                sort=False,
                observed=True,
            )[target]
        ]

        reason = None

        if (
            len(samples) < 2
            or any(len(s) < 5 for s in samples)
        ):
            reason = (
                "Kruskal-Wallis requires at least two groups "
                "with five or more rows each here."
            )
        elif values.nunique() < 2:
            reason = "All target values are identical."

        test = checked_test(
            "kruskal_wallis",
            structure,
            lambda: stats.kruskal(*samples),
            reason,
            [
                "Independent observations",
                (
                    "Comparable distribution shapes "
                    "for a median interpretation"
                ),
            ],
        )

        test["rank_effect_size"] = None
        test["effect_size_formula"] = (
            "max(0, (H - groups + 1) / (rows - groups))"
        )

        if test["status"] == "computed":
            k = len(samples)
            n = sum(len(s) for s in samples)

            test["rank_effect_size"] = max(
                0.0,
                (test["statistic"] - k + 1) / (n - k),
            )

        result["tests"].append(test)

        if test["status"] == "computed":
            result["warnings"].append(
                "The Kruskal-Wallis p-value depends on the "
                "stated sampling assumptions. An overall "
                "difference does not identify which groups differ."
            )

        result["warnings"].append(
            "Kruskal-Wallis concerns group distributions. "
            "Its rank effect size is not a percentage "
            "of target variance explained."
        )

    elif goal == "relationships":
        ids = result["selected_column_ids"]
        correlations = []
        tests = []

        for cid in ids:
            if cid == target:
                continue

            x = df[cid].to_numpy(dtype=float)
            y = values.to_numpy(dtype=float)

            valid = (
                len(x) >= 3
                and df[cid].nunique() > 1
                and values.nunique() > 1
            )

            coefficient = None

            if valid:
                with warnings.catch_warnings():
                    warnings.simplefilter(
                        "ignore",
                        RuntimeWarning,
                    )
                    coefficient = number(
                        stats.spearmanr(x, y).statistic
                    )

            reason = None

            if not valid:
                reason = (
                    "At least three rows and two "
                    "nonconstant columns are required."
                )
            elif len(x) <= 500:
                reason = (
                    "Small-sample Spearman p-values need "
                    "a permutation test; that is deferred."
                )

            test = checked_test(
                "spearman_correlation",
                structure,
                lambda: stats.spearmanr(x, y),
                reason,
                [
                    "Independent paired observations",
                    "Large-sample approximation",
                ],
            )

            test["column_id"] = cid
            tests.append(test)

            correlations.append({
                "column_id": cid,
                "coefficient": coefficient,
            })

        for test in tests:
            test["p_value_adjusted"] = (
                min(
                    1.0,
                    test["p_value"] * len(tests),
                )
                if test["p_value"] is not None
                else None
            )

            test["adjustment"] = (
                "bonferroni_across_spearman_target_comparisons"
            )

        result["tests"].extend(tests)
        data["spearman_correlations"] = correlations

        matrix_ids = ids[:12]
        matrix = df[matrix_ids].corr(
            method="spearman"
        )

        names = {
            c["id"]: c["name"]
            for c in result["columns"]
        }

        data["spearman_heatmap"] = {
            "column_ids": matrix_ids,
            "labels": [
                names[cid]
                for cid in matrix_ids
            ],
            "matrix": [
                [number(value) for value in row]
                for row in matrix.to_numpy()
            ],
            "rows_used": result["rows_analyzed"],
            "columns_truncated": (
                len(ids) > len(matrix_ids)
            ),
        }

        result["available_graphs"].append({
            "id": "spearman_heatmap",
            "label": "Spearman correlation heatmap",
            "kind": "heatmap",
            "data_key": "spearman_heatmap",
            "x": None,
            "y": None,
        })

        if len(ids) > 12:
            result["warnings"].append(
                "The heatmap shows the target and first "
                "11 other numeric columns. Pairwise target "
                "results still include all selected numeric columns."
            )

    result["analysis_plan"] = build_plan(
        request,
        result,
    )

    return result