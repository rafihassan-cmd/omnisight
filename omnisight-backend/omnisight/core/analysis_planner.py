"""Recommend analyses using explicit selections and calculated facts."""
from __future__ import annotations

import hashlib
import json


def build_plan(request, result):
    target = request["target_column_id"]
    group = request.get("group_column_id")
    date = request.get("date_column_id")
    goal = request["goal"]

    names = {
        c["id"]: c["name"]
        for c in result["columns"]
    }

    available = {
        g["id"]
        for g in result["available_graphs"]
    }

    plan = []

    def add(kind, params, question, reason, graph_ids):
        graph_ids = [
            gid for gid in graph_ids
            if gid in available
        ]

        if not graph_ids:
            return

        identity = json.dumps(
            [kind, params],
            sort_keys=True,
        )

        plan.append({
            "id": hashlib.sha256(
                identity.encode()
            ).hexdigest()[:20],
            "kind": kind,
            "params": params,
            "question": question,
            "reason": reason,
            "graph_ids": graph_ids,
        })

    label = names[target]

    if goal == "trends":
        add(
            "line",
            {"date": date, "value": target},
            f"How does {label} change each month?",
            "Uses your selected target and date column.",
            [
                "trend_mean",
                "trend_median",
                "trend_sum",
                "trend_count",
            ],
        )

    elif goal == "compare_groups":
        add(
            "box_group",
            {"group": group, "value": target},
            f"How does {label} differ across {names[group]} groups?",
            "Shows group spread and the calculated group values.",
            [
                "group_box",
                "groups_mean",
                "groups_median",
                "groups_sum",
                "groups_count",
            ],
        )

        add(
            "bar",
            {"col": group},
            f"How many records belong to each {names[group]} group?",
            "Counts records; shares use all analyzed rows.",
            ["category_counts"],
        )

        add(
            "ranking",
            {
                "group": group,
                "value": target,
                "top_n": 10,
            },
            f"Which groups have the highest or lowest {label}?",
            "Provides separate rankings for each aggregation.",
            [
                f"{direction}_{agg}"
                for agg in ("mean", "median", "sum", "count")
                for direction in ("top", "bottom")
            ],
        )

    elif goal == "relationships":
        partners = [
            row
            for row in result["results"]["spearman_correlations"]
            if row["coefficient"] is not None
        ]

        partners.sort(
            key=lambda row: -abs(row["coefficient"])
        )

        for partner in partners[:2]:
            cid = partner["column_id"]

            add(
                "scatter",
                {"x": cid, "y": target},
                f"Is {names[cid]} associated with {label}?",
                (
                    "Recommended by absolute Spearman correlation; "
                    "this does not establish cause."
                ),
                ["scatter_" + cid],
            )

        add(
            "heatmap",
            {
                "cols": result["results"]["spearman_heatmap"]["column_ids"]
            },
            "Which selected numeric columns move together?",
            "Shows rank correlations; undefined coefficients remain empty.",
            ["spearman_heatmap"],
        )

    else:
        add(
            "box",
            {"col": target},
            f"Are there unusual values in {label}?",
            "Uses the agreed 1.5 × IQR rule without removing rows.",
            ["box", "outliers"],
        )

    add(
        "histogram",
        {"col": target},
        f"How are {label} values distributed?",
        "Shows the target's distribution alongside calculated quartiles.",
        ["distribution"],
    )

    if goal != "unusual_values":
        add(
            "box",
            {"col": target},
            f"How spread out are {label} values?",
            "Shows median, quartiles and whiskers.",
            ["box"],
        )

    return plan