"""Part 2: one column, explicit missing rules and validated replacement."""

import pandas as pd
import streamlit as st

import client
import common

STRATEGY_LABELS = {
    "mean": "Fill with mean",
    "median": "Fill with median",
    "mode": "Fill with most frequent value (mode)",
    "fill": "Fill with a custom value",
    "drop": "Remove rows missing a value in this column",
}

st.set_page_config(
    page_title="OmniSight — Missing Values",
    layout="wide",
)

st.title("OmniSight")
st.caption("Part 2 · Missing value management")

dataset_id = common.require_dataset()
info = common.load_info(dataset_id)

common.sidebar(dataset_id, info)
common.flash()

labels = common.labels(info)

controls, live = st.columns([1, 1.3], gap="large")

with controls:
    st.page_link("Home.py", label="← Back to Part 1")

    if not info["can_proceed"]:
        st.warning(
            "Resolve duplicate column names in Part 1 "
            "before managing missing values."
        )

    else:
        st.subheader("Missing-value overview")

        overview = pd.DataFrame(info["columns_info"])[
            ["name", "dtype", "missing", "missing_pct"]
        ]

        st.dataframe(
            overview,
            hide_index=True,
            width="stretch",
        )

        st.caption(
            "Overview counts show current null cells. Additional "
            "rules below apply to the selected column."
        )

        cid = st.selectbox(
            "Column to manage",
            list(labels),
            format_func=labels.get,
            key=f"missing_column_{dataset_id}",
        )

        prefix = f"missing_{dataset_id}_{cid}"

        with st.expander(
            "Recognise additional missing values",
            expanded=True,
        ):
            empty_strings = st.checkbox(
                "Empty strings",
                key=f"{prefix}_empty",
            )

            whitespace = st.checkbox(
                "Whitespace-only cells",
                key=f"{prefix}_whitespace",
            )

            token_text = st.text_area(
                "Placeholder text — one value per line",
                placeholder=(
                    "Enter only the placeholders you want "
                    "treated as missing."
                ),
                key=f"{prefix}_tokens",
            )

            match_case = st.checkbox(
                "Case-sensitive placeholder matching",
                value=True,
                key=f"{prefix}_case",
            )

            st.caption(
                "Placeholders match whole cells. Spaces are "
                "preserved; substrings are not matched."
            )

        rules = {
            "columns": [cid],
            "empty_strings": empty_strings,
            "whitespace": whitespace,
            "tokens": [
                token
                for token in token_text.splitlines()
                if token != ""
            ],
            "match_case": match_case,
        }

        try:
            inspection = client.preview_operation(
                dataset_id,
                "handle_missing",
                rules,
                info["version"],
            )

        except client.ApiError as exc:
            common.report_error(exc)

        else:
            m1, m2, m3 = st.columns(3)

            m1.metric(
                "Existing nulls",
                inspection["existing_missing"],
            )
            m2.metric(
                "Additional matches",
                inspection["additional_missing"],
            )
            m3.metric(
                "Total missing",
                inspection["affected_rows"],
            )

            st.caption(
                f"{inspection['missing_pct']}% missing · "
                f"{inspection['observed_values']} observed values · "
                f"type: {inspection['dtype']}"
            )

            if not inspection["affected_rows"]:
                st.success(
                    "No missing values match these rules "
                    "in this column."
                )

            else:
                supported = inspection["supported_strategies"]

                if not inspection["observed_values"]:
                    st.info(
                        "This column is entirely missing under "
                        "these rules. Choose custom fill or "
                        "row removal."
                    )

                elif "mean" not in supported:
                    st.caption(
                        "Mean and median require finite numeric "
                        "data. Numeric conversion is available "
                        "in Part 1."
                    )

                strategy = st.selectbox(
                    "Replacement strategy",
                    supported,
                    index=None,
                    placeholder="Choose a strategy",
                    format_func=STRATEGY_LABELS.get,
                    key=f"{prefix}_strategy_{info['version']}",
                )

                if strategy is None:
                    st.dataframe(
                        pd.DataFrame(
                            inspection["sample"]
                        ).rename(columns=labels),
                        hide_index=True,
                        width="stretch",
                    )

                else:
                    params = {**rules, "strategy": strategy}

                    if strategy == "fill":
                        params["value"] = st.text_input(
                            "Replacement value",
                            key=f"{prefix}_fill",
                        )

                        st.caption(
                            "The value must fit this column's type "
                            "and must not match your missing-value "
                            "rules."
                        )

                    ready = (
                        strategy != "fill"
                        or bool(params["value"].strip())
                    )

                    if not ready:
                        st.info(
                            "Enter a replacement value "
                            "to validate it."
                        )

                    else:
                        try:
                            result = client.preview_operation(
                                dataset_id,
                                "handle_missing",
                                params,
                                info["version"],
                            )

                        except client.ApiError as exc:
                            common.report_error(exc)

                        else:
                            st.subheader("Proposed change")

                            st.write(
                                f"Affected rows: "
                                f"{result['affected_rows']:,} · "
                                f"Rows remaining: "
                                f"{result['rows_after']:,}"
                            )

                            if result["fill_values"]:
                                st.write(
                                    "Replacement value:",
                                    result["fill_values"][cid],
                                )

                            for warning in result["warnings"]:
                                st.warning(warning)

                            sample_labels = {
                                **labels,
                                f"{cid}__new": (
                                    f"{labels[cid]} (after)"
                                ),
                            }

                            st.dataframe(
                                pd.DataFrame(
                                    result["sample"]
                                ).rename(columns=sample_labels),
                                hide_index=True,
                                width="stretch",
                            )

                            st.caption(
                                "Preview only. The dataset changes "
                                "when you click Apply."
                            )

                            if st.button(
                                "Apply missing-value handling",
                                type="primary",
                            ):
                                common.run_operation(
                                    dataset_id,
                                    "handle_missing",
                                    params,
                                )

with live:
    common.render_preview(dataset_id, info)

if info["can_proceed"]:
    st.divider()
    st.page_link(
        "pages/2_Analysis.py",
        label="Next: Part 3 — analysis →",
    )