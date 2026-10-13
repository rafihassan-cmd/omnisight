"""Read-only calculations. Chart definitions are independent of the renderer."""
from __future__ import annotations

import math
import warnings

import numpy as np
import pandas as pd
from pandas.api import types as pdt
from scipy import stats

from .errors import CleaningError
from .profiling import column_names, duplicate_groups
from .serialization import frame_to_records
from .validation import require_columns

GOALS = (
    "trends",
    "compare_groups",
    "relationships",
    "unusual_values",
)

DEFAULTS = {
    "time_interval": "month",
    "top_n": 10,
    "iqr_multiplier": 1.5,
    "plot_point_limit": 5000,
}


def numeric_ids(df):
    return [
        cid
        for cid in df.columns
        if pdt.is_numeric_dtype(df[cid].dtype)
        and not pdt.is_bool_dtype(df[cid].dtype)
        and not pdt.is_complex_dtype(df[cid].dtype)
    ]


def finite(value):
    if value is None:
        return None

    value = float(value)
    return value if math.isfinite(value) else None


def aggregates(values):
    s = pd.Series(values)

    # Python integer summation avoids fixed-width integer overflow.
    total = (
        sum(map(int, s))
        if pdt.is_integer_dtype(s.dtype)
        else s.sum()
    )

    q = s.quantile([0.25, 0.5, 0.75])

    result = {
        "count": int(len(s)),
        "sum": total if isinstance(total, int) else finite(total),
        "mean": finite(s.mean()),
        "median": finite(q.loc[0.5]),
        "std": finite(s.std(ddof=1)),
        "min": finite(s.min()),
        "max": finite(s.max()),
        "q1": finite(q.loc[0.25]),
        "q3": finite(q.loc[0.75]),
    }

    if any(
        value is None
        for key, value in result.items()
        if key != "std"
    ):
        raise CleaningError(
            "Values exceed the numerical range supported by this analysis."
        )

    return result


def box(values):
    a = aggregates(values)

    iqr = a["q3"] - a["q1"]
    low = a["q1"] - 1.5 * iqr
    high = a["q3"] + 1.5 * iqr

    if not all(math.isfinite(value) for value in (iqr, low, high)):
        raise CleaningError(
            "Values exceed the numerical range supported by the IQR calculation."
        )

    inside = values[(values >= low) & (values <= high)]

    return {
        **a,
        "iqr": finite(iqr),
        "lower_threshold": finite(low),
        "upper_threshold": finite(high),
        "lower_whisker": finite(inside.min()),
        "upper_whisker": finite(inside.max()),
    }


def sample_rows(frame):
    limit = DEFAULTS["plot_point_limit"]

    shown = (
        frame
        if len(frame) <= limit
        else frame.sample(limit, random_state=0).sort_index()
    )

    return {
        "rows": frame_to_records(shown),
        "total_rows": len(frame),
        "shown_rows": len(shown),
        "sampled": len(shown) < len(frame),
        "method": (
            "random_seed_0"
            if len(shown) < len(frame)
            else "all"
        ),
    }


def test_result(
    method,
    observation_structure,
    values=None,
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

    if observation_structure != "independent":
        result["reason"] = (
            "Independent observations were not confirmed in Part 2."
        )
        return result

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        measured = values()

    statistic = finite(measured.statistic)
    p_value = finite(measured.pvalue)

    if statistic is None or p_value is None:
        result["reason"] = (
            "The test produced an undefined or nonfinite result."
        )
    else:
        result.update(
            status="computed",
            statistic=statistic,
            p_value=p_value,
            reason=None,
        )

    return result


def calculate(df, request):
    goal = request["goal"]
    target = request["target_column_id"]

    date = request.get("date_column_id")
    group = request.get("group_column_id")

    structure = request.get(
        "observation_structure",
        "unknown",
    )

    if duplicate_groups(df):
        raise CleaningError(
            "Resolve duplicate column names in Part 1 first."
        )

    if goal not in GOALS:
        raise CleaningError("Unsupported analysis goal.")

    require_columns(df, [target])

    numerics = numeric_ids(df)

    if target not in numerics:
        raise CleaningError(
            "The initial analysis target must be numeric, excluding boolean."
        )

    used = [target]

    comparisons = (
        [cid for cid in numerics if cid != target]
        if goal == "relationships"
        else []
    )

    if goal == "relationships" and not comparisons:
        raise CleaningError(
            "Relationships require another numeric column."
        )

    if goal == "trends":
        if not date:
            raise CleaningError(
                "Select a date column for trends."
            )

        used.append(date)

    if goal == "compare_groups":
        if not group:
            raise CleaningError(
                "Select a group column for group comparison."
            )

        used.append(group)

    used.extend(comparisons)
    require_columns(df, used)

    if len(set(used)) != len(used):
        raise CleaningError(
            "Target, date and group roles must use different columns."
        )

    missing = {
        cid: int(df[cid].isna().sum())
        for cid in used
        if df[cid].isna().any()
    }

    if missing:
        raise CleaningError(
            "Resolve missing values in the analysis columns first.",
            {
                "missing_by_column": missing,
                "selected_column_ids": used,
            },
        )

    if df.empty:
        raise CleaningError(
            "Analysis requires at least one row."
        )

    for cid in used:
        if (
            cid in numerics
            and not np.isfinite(
                df[cid].to_numpy(dtype=float)
            ).all()
        ):
            raise CleaningError(
                "Numeric analysis columns must contain finite values.",
                {"column_id": cid},
            )

    frame = df[used].reset_index(drop=True)
    names = column_names(df)

    data = {}
    charts = []
    tests = []
    notices = []

    infos = {
        cid: aggregates(frame[cid])
        for cid in [target, *comparisons]
    }

    def chart(
        identifier,
        label,
        kind,
        data_key,
        x=None,
        y=None,
    ):
        charts.append(
            {
                "id": identifier,
                "label": label,
                "kind": kind,
                "data_key": data_key,
                "x": x,
                "y": y,
            }
        )

    # Reusable target distribution and box summary.
    values = frame[target]
    numeric = values.to_numpy(dtype=float)

    try:
        counts, edges = np.histogram(numeric, bins=20)

        if (
            not np.isfinite(edges).all()
            or not np.isfinite(np.diff(edges)).all()
        ):
            raise ValueError("Nonfinite histogram boundaries")

    except (ValueError, OverflowError, IndexError) as exc:
        raise CleaningError(
            "Values exceed the numerical range supported by the histogram."
        ) from exc

    data["distribution"] = [
        {
            "lower": finite(edges[i]),
            "upper": finite(edges[i + 1]),
            "count": int(count),
        }
        for i, count in enumerate(counts)
    ]

    data["box"] = box(values)

    chart(
        "distribution",
        "Target distribution",
        "histogram",
        "distribution",
        "value",
        "count",
    )

    chart(
        "box",
        "Target spread",
        "box",
        "box",
        None,
        target,
    )

    if goal == "trends":
        date_format = request.get("date_format")

        if (
            not pdt.is_datetime64_any_dtype(frame[date].dtype)
            and not date_format
        ):
            raise CleaningError(
                "Provide the format of the selected text date column; "
                "dates are not guessed."
            )

        if pdt.is_numeric_dtype(frame[date].dtype):
            raise CleaningError(
                "Numeric date codes need conversion before trend analysis."
            )

        try:
            parsed = pd.to_datetime(
                frame[date],
                format=date_format,
                errors="raise",
            )

            if getattr(parsed.dt, "tz", None) is not None:
                parsed = parsed.dt.tz_localize(None)

            periods = parsed.dt.to_period("M")

        except (
            ValueError,
            TypeError,
            AttributeError,
            OverflowError,
        ) as exc:
            raise CleaningError(
                "Dates do not match the supplied format "
                "or use incompatible timezones."
            ) from exc

        if parsed.isna().any():
            raise CleaningError(
                "The date column contains missing dates after parsing."
            )

        full_periods = pd.period_range(
            periods.min(),
            periods.max(),
            freq="M",
        )

        if len(full_periods) > 12000:
            raise CleaningError(
                "The selected dates span too many monthly periods."
            )

        grouped = values.groupby(
            periods,
            observed=True,
        )

        rows = []

        for period in full_periods:
            if period in grouped.groups:
                a = aggregates(
                    grouped.get_group(period)
                )
            else:
                a = {
                    "count": 0,
                    "sum": None,
                    "mean": None,
                    "median": None,
                    "std": None,
                    "min": None,
                    "max": None,
                    "q1": None,
                    "q3": None,
                }

            rows.append(
                {
                    "period": str(period),
                    **a,
                }
            )

        data["trend"] = rows

        for agg in ("mean", "sum", "median", "count"):
            chart(
                "trend_" + agg,
                "Monthly " + agg,
                "line",
                "trend",
                "period",
                agg,
            )

        notices.append(
            "Months without observations remain gaps; "
            "they are not filled with zero values."
        )

    elif goal == "compare_groups":
        grouped = frame.groupby(
            group,
            sort=False,
            observed=True,
        )[target]

        if grouped.ngroups > 1000:
            raise CleaningError(
                "Choose a group column with no more than 1,000 categories."
            )

        groups = []
        samples = []

        for category, s in grouped:
            label = frame_to_records(
                pd.DataFrame(
                    {"category": [category]}
                )
            )[0]["category"]

            groups.append(
                {
                    "category": label,
                    **box(s),
                }
            )

            samples.append(
                s.to_numpy(dtype=float)
            )

        data["groups"] = groups

        chart(
            "group_box",
            "Spread by group",
            "group_box",
            "groups",
            "category",
            target,
        )

        for agg in ("mean", "sum", "median", "count"):
            chart(
                "groups_" + agg,
                "Group " + agg,
                "bar",
                "groups",
                "category",
                agg,
            )

            for direction, reverse in (
                ("top", True),
                ("bottom", False),
            ):
                key = direction + "_" + agg

                data[key] = sorted(
                    groups,
                    key=lambda row: row[agg],
                    reverse=reverse,
                )[:10]

                chart(
                    key,
                    direction.capitalize() + " 10 by " + agg,
                    "horizontal_bar",
                    key,
                    agg,
                    "category",
                )

        reason = None

        if (
            len(samples) < 2
            or any(len(s) < 2 for s in samples)
        ):
            reason = (
                "At least two groups, each with at least "
                "two observations, are needed."
            )

        elif any(
            np.var(s, ddof=1) <= 0
            for s in samples
        ):
            reason = (
                "Welch's test is unavailable because "
                "a group has zero variance."
            )

        if len(samples) == 2:
            method = "welch_t_test"
            call = lambda: stats.ttest_ind(
                *samples,
                equal_var=False,
            )
        else:
            method = "welch_anova"
            call = lambda: stats.f_oneway(
                *samples,
                equal_var=False,
            )

        tests.append(
            test_result(
                method,
                structure,
                call,
                reason,
                [
                    "Independent observations",
                    "Approximately normal populations within groups",
                ],
            )
        )

        notices.append(
            "The group test compares means; it does not "
            "identify which individual groups differ."
        )

    elif goal == "relationships":
        correlations = []

        for cid in comparisons:
            x = frame[cid].to_numpy(dtype=float)
            y = numeric

            reason = (
                "Correlation requires at least three rows "
                "and two nonconstant columns."
            )

            valid = (
                len(x) >= 3
                and np.ptp(x) > 0
                and np.ptp(y) > 0
            )

            if valid:
                with warnings.catch_warnings():
                    warnings.simplefilter(
                        "ignore",
                        RuntimeWarning,
                    )

                    coefficient = finite(
                        stats.pearsonr(x, y).statistic
                    )
            else:
                coefficient = None

            result = test_result(
                "pearson_correlation",
                structure,
                lambda: stats.pearsonr(x, y),
                None if valid else reason,
                [
                    "Independent paired observations",
                    "Bivariate normal model for the p-value",
                ],
            )

            result["column_id"] = cid
            tests.append(result)

            correlations.append(
                {
                    "column_id": cid,
                    "name": names[cid],
                    "coefficient": coefficient,
                }
            )

            key = "scatter_" + cid

            data[key] = sample_rows(
                pd.DataFrame(
                    {
                        "row": np.arange(
                            1,
                            len(frame) + 1,
                        ),
                        "x": x,
                        "y": y,
                    }
                )
            )

            chart(
                key,
                names[target] + " vs " + names[cid],
                "scatter",
                key,
                "x",
                "y",
            )

        for test in tests:
            test["p_value_adjusted"] = (
                min(
                    1.0,
                    test["p_value"] * len(comparisons),
                )
                if test["p_value"] is not None
                else None
            )

            test["adjustment"] = (
                "bonferroni_across_target_comparisons"
            )

        data["correlations"] = correlations

        chart(
            "correlations",
            "Relationships with target",
            "correlation_bar",
            "correlations",
            "coefficient",
            "name",
        )

        notices.append(
            "Correlations do not establish causes. "
            "Adjusted p-values account for the target comparisons."
        )

    else:
        b = data["box"]

        outlier_mask = (
            (values < b["lower_threshold"])
            | (values > b["upper_threshold"])
        )

        outliers = pd.DataFrame(
            {
                "row": np.arange(
                    1,
                    len(frame) + 1,
                ),
                "value": values,
            }
        )[outlier_mask]

        data["outliers"] = sample_rows(outliers)
        data["outlier_count"] = int(outlier_mask.sum())
        data["outlier_pct"] = float(
            100 * outlier_mask.mean()
        )

        chart(
            "outliers",
            "Values beyond the IQR thresholds",
            "outlier_scatter",
            "outliers",
            "row",
            "value",
        )

        notices.append(
            "Outliers are flagged using 1.5 × IQR; "
            "no rows are removed."
        )

    if any(
        test["status"] == "computed"
        for test in tests
    ):
        notices.append(
            "P-values are conditional on the stated assumptions; "
            "distribution assumptions have not been verified."
        )

    for payload in data.values():
        if (
            isinstance(payload, dict)
            and payload.get("sampled")
        ):
            notices.append(
                "A point graph is sampled to 5,000 rows. "
                "Calculations use every row."
            )
            break

    return {
        "goal": goal,
        "context": request.get("context", {}),
        "observation_structure": structure,
        "selected_column_ids": used,
        "columns": [
            {
                "id": cid,
                "name": names[cid],
            }
            for cid in used
        ],
        "defaults": DEFAULTS,
        "rows_analyzed": len(frame),
        "rows_excluded": 0,
        "infos": infos,
        "results": data,
        "tests": tests,
        "available_graphs": charts,
        "warnings": notices,
    }