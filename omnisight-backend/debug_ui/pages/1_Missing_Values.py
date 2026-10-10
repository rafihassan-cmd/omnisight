"""Existing Part 2 strategies; reachable only after header conflicts are resolved."""
import pandas as pd
import streamlit as st

import client
import common

st.set_page_config(page_title="OmniSight — Missing Values", layout="wide")
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
        st.warning("Resolve duplicate column names in Part 1 before managing missing values.")
    else:
        try:
            meta = client.meta()
        except client.ApiError as exc:
            common.report_error(exc)
            st.stop()
        with_missing = [c for c in info["columns_info"] if c["missing"] > 0]
        if not with_missing:
            st.success("No missing values remain.")
        else:
            st.dataframe(pd.DataFrame(with_missing)[["name", "dtype", "missing", "missing_pct"]],
                         hide_index=True, width="stretch")
            targets = st.multiselect("Columns to clean", [c["id"] for c in with_missing],
                                     format_func=labels.get, key=f"targets_{info['version']}")
            strategy = st.radio("Strategy", meta["missing_strategies"], horizontal=True)
            value = st.text_input("Fill value") if strategy == "fill" else None
            if targets:
                params = {"columns": targets, "strategy": strategy}
                if strategy == "fill":
                    params["value"] = value
                try:
                    result = client.preview_operation(dataset_id, "handle_missing", params, info["version"])
                except client.ApiError as exc:
                    common.report_error(exc)
                else:
                    st.write(f"Rows affected: {result['affected_rows']:,} · Rows after: {result['rows_after']:,}")
                    if result["fill_values"]:
                        st.write("Fill values:", {labels[c]: v for c, v in result["fill_values"].items()})
                    sample_labels = {**labels, **{f"{c}__new": f"{name} (after)" for c, name in labels.items()}}
                    st.dataframe(pd.DataFrame(result["sample"]).rename(columns=sample_labels),
                                 hide_index=True, width="stretch")
                    if st.button("Apply cleaning", type="primary"):
                        common.run_operation(dataset_id, "handle_missing", params)
with live:
    common.render_preview(dataset_id, info)
