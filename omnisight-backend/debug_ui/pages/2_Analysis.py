"""Temporary HTTP-only UI. React can consume the same analysis endpoints."""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import client
import common

GOAL_LABELS = {
    "trends": "Trends over time",
    "compare_groups": "Compare groups",
    "relationships": "Relationships",
    "unusual_values": "Unusual values",
}


def render_graph(graph, result, target):
    data = result["results"][graph["data_key"]]
    kind = graph["kind"]

    names = {
        column["id"]: column["name"]
        for column in result["columns"]
    }

    fig = go.Figure()

    if kind in ("box", "group_box"):
        rows = [data] if kind == "box" else data

        for row in rows:
            fig.add_trace(
                go.Box(
                    name=(
                        names[target]
                        if kind == "box"
                        else str(row["category"])
                    ),
                    q1=[row["q1"]],
                    median=[row["median"]],
                    q3=[row["q3"]],
                    lowerfence=[
                        row["lower_whisker"]
                    ],
                    upperfence=[
                        row["upper_whisker"]
                    ],
                    boxpoints=False,
                )
            )

        fig.update_layout(
            yaxis_title=names[target],
            showlegend=False,
        )

    elif kind == "histogram":
        fig.add_trace(
            go.Bar(
                x=[
                    row["lower"] / 2
                    + row["upper"] / 2
                    for row in data
                ],
                y=[
                    row["count"]
                    for row in data
                ],
                width=[
                    row["upper"] - row["lower"]
                    for row in data
                ],
                text=[
                    f"{row['lower']:g} to {row['upper']:g}"
                    for row in data
                ],
                hovertemplate=(
                    "%{text}<br>"
                    "Count: %{y}"
                    "<extra></extra>"
                ),
            )
        )

        fig.update_layout(
            xaxis_title=names[target],
            yaxis_title="Count",
            bargap=0,
        )

    elif kind in ("scatter", "outlier_scatter"):
        rows = data["rows"]

        fig.add_trace(
            go.Scatter(
                x=[
                    row[graph["x"]]
                    for row in rows
                ],
                y=[
                    row[graph["y"]]
                    for row in rows
                ],
                mode="markers",
                customdata=[
                    row["row"]
                    for row in rows
                ],
                hovertemplate=(
                    "Row: %{customdata}<br>"
                    "x: %{x}<br>"
                    "y: %{y}"
                    "<extra></extra>"
                ),
            )
        )

        x_title = (
            names[
                graph["id"].removeprefix("scatter_")
            ]
            if kind == "scatter"
            else "Current data row"
        )

        fig.update_layout(
            xaxis_title=x_title,
            yaxis_title=names[target],
        )

        st.caption(
            f"{data['shown_rows']:,} of "
            f"{data['total_rows']:,} points shown. "
            "Calculations use every row."
        )

    else:
        x = [
            row[graph["x"]]
            for row in data
        ]

        y = [
            row[graph["y"]]
            for row in data
        ]

        if kind == "line":
            fig.add_trace(
                go.Scatter(
                    x=x,
                    y=y,
                    mode="lines+markers",
                    connectgaps=False,
                )
            )

        elif kind in (
            "horizontal_bar",
            "correlation_bar",
        ):
            fig.add_trace(
                go.Bar(
                    x=x,
                    y=[str(value) for value in y],
                    orientation="h",
                )
            )

            fig.update_layout(
                yaxis={
                    "type": "category",
                    "autorange": "reversed",
                }
            )

        else:
            fig.add_trace(
                go.Bar(
                    x=[str(value) for value in x],
                    y=y,
                )
            )

            fig.update_xaxes(type="category")

        fig.update_layout(
            xaxis_title=graph["x"],
            yaxis_title=graph["y"],
        )

    fig.update_layout(title=graph["label"])

    st.plotly_chart(
        fig,
        width="stretch",
    )


st.set_page_config(
    page_title="OmniSight — Analysis",
    layout="wide",
)

st.title("OmniSight")
st.caption("Part 3 · Data analysis")

dataset_id = common.require_dataset()
info = common.load_info(dataset_id)

common.sidebar(dataset_id, info)
common.flash()

st.page_link(
    "pages/1_Missing_Values.py",
    label="← Back to missing values",
)

if not info["can_proceed"]:
    st.info(
        "Resolve duplicate column names "
        "in Part 1 first."
    )
    st.stop()

try:
    options = client.analysis_options(dataset_id)

except client.ApiError as exc:
    common.report_error(exc)
    st.stop()

if options["version"] != info["version"]:
    st.session_state.pop(
        "dataset_state",
        None,
    )
    st.rerun()

columns = options["columns"]

labels = {
    column["id"]: column["name"]
    for column in columns
}

numeric = [
    column["id"]
    for column in columns
    if column["is_numeric"]
]

if not numeric:
    st.info(
        "Convert a target column to numeric "
        "in Part 1 first."
    )
    st.stop()

topic = st.text_input(
    "Data subject",
    placeholder="Sales, revenue, expenses, grades…",
)

audience = st.text_input(
    "Intended audience",
    placeholder="Business owner, customer, student…",
)

unit = st.text_input(
    "Unit (optional)",
    placeholder="BDT, marks, kilograms…",
)

goal = st.selectbox(
    "Goal",
    options["goals"],
    index=None,
    format_func=GOAL_LABELS.get,
    key=f"analysis_goal_{dataset_id}",
)

target = st.selectbox(
    "Target column",
    numeric,
    index=None,
    format_func=labels.get,
    key=f"analysis_target_{dataset_id}",
)

date = None
group = None
date_format = None

others = [
    cid
    for cid in labels
    if cid != target
]

if goal == "trends":
    date = st.selectbox(
        "Date column",
        others,
        index=None,
        format_func=labels.get,
    )

    date_format = st.text_input(
        "Date format",
        placeholder=(
            "%Y-%m-%d or %d/%m/%Y or %m/%d/%Y"
        ),
    )

    st.caption(
        "Monthly intervals. Provide the exact "
        "text date format; dates are not guessed."
    )

elif goal == "compare_groups":
    group = st.selectbox(
        "Group column",
        others,
        index=None,
        format_func=labels.get,
    )

    st.caption(
        "Mean, sum, median and count are calculated. "
        "Rankings show the top/bottom 10."
    )

elif goal == "relationships":
    st.caption(
        "The target is compared with every other "
        "numeric column. Missing values must be "
        "resolved in each of these columns."
    )

elif goal == "unusual_values":
    st.caption(
        "Flag values beyond 1.5 × IQR. "
        "Rows are not removed."
    )

structure = st.session_state.get(
    f"observation_structure_{dataset_id}",
    "unknown",
)

st.caption(
    f"Observation structure from Part 2: {structure}"
)

selected = [target] if target else []

if goal == "trends" and date:
    selected.append(date)

if goal == "compare_groups" and group:
    selected.append(group)

if goal == "relationships":
    selected.extend(
        cid
        for cid in numeric
        if cid != target
    )

missing = [
    column
    for column in columns
    if (
        column["id"] in selected
        and column["missing"]
    )
]

if missing:
    st.info(
        "Resolve missing values in: "
        + ", ".join(
            column["name"]
            for column in missing
        )
    )

ready = bool(
    goal
    and target
    and not missing
)

ready = ready and (
    goal != "trends"
    or bool(date and date_format.strip())
)

ready = ready and (
    goal != "compare_groups"
    or bool(group)
)

ready = ready and (
    goal != "relationships"
    or len(numeric) > 1
)

if st.button(
    "Run analysis",
    type="primary",
    disabled=not ready,
):
    payload = {
        "expected_version": info["version"],
        "goal": goal,
        "target_column_id": target,
        "date_column_id": date,
        "group_column_id": group,
        "date_format": date_format or None,
        "observation_structure": structure,
        "context": {
            "topic": topic,
            "audience": audience,
            "unit": unit,
        },
    }

    try:
        with st.spinner("Calculating…"):
            result = client.analyze(
                dataset_id,
                payload,
            )

        st.session_state["analysis_result"] = {
            "request": payload,
            "response": result,
        }

    except client.ApiError as exc:
        common.report_error(exc)

saved = st.session_state.get("analysis_result")

if saved:
    result = saved["response"]
    submitted = saved["request"]

    outdated = (
        result["dataset_id"] != dataset_id
        or result["version"] != info["version"]
        or submitted["observation_structure"] != structure
    )

    if outdated:
        st.session_state.pop(
            "analysis_result",
            None,
        )

        st.info(
            "Run analysis again for the current "
            "dataset and observation structure."
        )

    else:
        st.divider()

        st.caption(
            "Results from the last submitted settings: "
            + GOAL_LABELS[result["goal"]]
        )

        a = result["infos"][
            submitted["target_column_id"]
        ]

        for slot, key in zip(
            st.columns(4),
            ("count", "sum", "mean", "median"),
        ):
            slot.metric(
                key.capitalize(),
                f"{a[key]:,.4g}",
            )

        if "outlier_count" in result["results"]:
            st.metric(
                "Outliers",
                result["results"]["outlier_count"],
            )

        if result["tests"]:
            st.dataframe(
                pd.DataFrame(result["tests"]),
                hide_index=True,
                width="stretch",
            )

        graphs = {
            graph["id"]: graph
            for graph in result["available_graphs"]
        }

        graph_id = st.selectbox(
            "Available graphs",
            list(graphs),
            index=None,
            format_func=lambda gid: graphs[gid]["label"],
            key=(
                f"graph_{dataset_id}_"
                f"{result['version']}_"
                f"{result['goal']}_"
                f"{submitted['target_column_id']}_"
                f"{submitted.get('group_column_id')}"
            ),
        )

        if graph_id:
            render_graph(
                graphs[graph_id],
                result,
                submitted["target_column_id"],
            )

            st.button(
                "AI summary",
                disabled=True,
                help="AI summaries are not available yet.",
            )

        for notice in result["warnings"]:
            st.caption(notice)

        with st.expander("All calculated values"):
            st.json(
                {
                    "infos": result["infos"],
                    "results": {
                        key: value
                        for key, value in result["results"].items()
                        if (
                            not isinstance(value, dict)
                            or "rows" not in value
                        )
                    },
                }
            )