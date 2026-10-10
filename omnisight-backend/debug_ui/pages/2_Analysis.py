"""Part 3: predefined analysis questions and column selectors."""

import json

import streamlit as st

import common


TEMPLATES = {
    "overall_mean": {
        "sentence": (
            "What is the average value of {numeric_column}?"
        ),
        "slots": [
            {
                "variable": "numeric_column",
                "label": "Numeric column",
                "kind": "numeric",
            },
        ],
    },

    "group_mean": {
        "sentence": (
            "What is the average value of {numeric_column} "
            "for each category in {category_column}?"
        ),
        "slots": [
            {
                "variable": "numeric_column",
                "label": "Numeric column to average",
                "kind": "numeric",
            },
            {
                "variable": "category_column",
                "label": "Column containing the categories",
                "kind": "category",
            },
        ],
    },

    "pearson_correlation": {
        "sentence": (
            "How strong is the linear relationship between "
            "{numeric_column_1} and {numeric_column_2}?"
        ),
        "slots": [
            {
                "variable": "numeric_column_1",
                "label": "First numeric column",
                "kind": "numeric",
            },
            {
                "variable": "numeric_column_2",
                "label": "Second numeric column",
                "kind": "numeric",
            },
        ],
    },

    "distribution": {
        "sentence": (
            "How are the values in {numeric_column} distributed?"
        ),
        "slots": [
            {
                "variable": "numeric_column",
                "label": "Numeric column",
                "kind": "numeric",
            },
        ],
    },

    "category_count": {
        "sentence": (
            "How many records belong to each category "
            "in {category_column}?"
        ),
        "slots": [
            {
                "variable": "category_column",
                "label": "Column containing the categories",
                "kind": "category",
            },
        ],
    },
}


st.set_page_config(
    page_title="OmniSight — Analysis",
    layout="wide",
)

st.title("OmniSight")
st.caption("Part 3 · Choose an analysis question")

dataset_id = common.require_dataset()
info = common.load_info(dataset_id)

common.sidebar(dataset_id, info)
common.flash()

labels = common.labels(info)
all_ids = list(labels)

numeric_ids = [
    column["id"]
    for column in info["columns_info"]
    if column["is_numeric"]
]

controls, live = st.columns([1, 1.3], gap="large")

with controls:
    st.page_link(
        "pages/1_Missing_Values.py",
        label="← Back to Part 2",
    )

    if not info["can_proceed"]:
        st.warning(
            "Resolve duplicate column names in Part 1 "
            "before selecting an analysis."
        )

    else:
        template_id = st.selectbox(
            "What would you like to analyse?",
            options=list(TEMPLATES),
            index=None,
            placeholder="Choose one of the five questions",
            format_func=lambda key: TEMPLATES[key]["sentence"],
            key=f"analysis_question_{dataset_id}",
        )

        if template_id is not None:
            template = TEMPLATES[template_id]

            selected_columns = {}
            ready = True

            for slot in template["slots"]:
                variable = slot["variable"]

                eligible = (
                    numeric_ids
                    if slot["kind"] == "numeric"
                    else all_ids
                )

                # Two-column questions require distinct columns.
                eligible = [
                    cid
                    for cid in eligible
                    if cid not in selected_columns.values()
                ]

                if not eligible:
                    ready = False

                    if slot["kind"] == "numeric":
                        st.warning(
                            f"No eligible column is available for "
                            f"'{slot['label']}'. Check column types "
                            "in Part 1. Two-column questions need "
                            "two distinct eligible columns."
                        )
                    else:
                        st.warning(
                            "Choose a different column for the "
                            "numeric value and the categories."
                        )

                    continue

                cid = st.selectbox(
                    slot["label"],
                    options=eligible,
                    index=None,
                    placeholder="Choose a column",
                    format_func=labels.get,
                    key=(
                        f"analysis_column_{dataset_id}_"
                        f"{template_id}_{variable}_"
                        f"{info['version']}"
                    ),
                )

                if slot["kind"] == "category":
                    st.caption(
                        "Choose a column whose values represent "
                        "categories. Numeric category codes "
                        "are also allowed."
                    )

                if cid is None:
                    ready = False
                else:
                    selected_columns[variable] = cid

            if not ready:
                st.info(
                    "Choose all required columns to complete "
                    "the question."
                )

            else:
                selected_names = {
                    variable: labels[cid]
                    for variable, cid in selected_columns.items()
                }

                sentence = template["sentence"].format(
                    **selected_names
                )

                request = {
                    "dataset_id": dataset_id,
                    "expected_version": info["version"],
                    "analysis": template_id,
                    "columns": selected_columns,
                }

                st.divider()
                st.write("**Your selected question**")
                st.text(sentence)

                st.write("**Generated analysis request**")
                st.code(
                    json.dumps(request, indent=2),
                    language="json",
                )

with live:
    common.render_preview(dataset_id, info)