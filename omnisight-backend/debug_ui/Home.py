"""Part 1 frontend. Run with: streamlit run debug_ui/Home.py"""
import pandas as pd
import streamlit as st

import client
import common

st.set_page_config(page_title="OmniSight — Data Cleaning", layout="wide")
st.title("OmniSight")
st.caption("Part 1 · Data cleaning")

uploaded = st.file_uploader("Upload a CSV file", type=["csv"])
if uploaded is not None:
    file_key = getattr(uploaded, "file_id", None) or (uploaded.name, uploaded.size)
    if st.session_state.get("uploaded_file_id") != file_key:
        try:
            with st.spinner("Uploading…"):
                common.accept_state(client.upload(uploaded.name, uploaded.getvalue()), new_upload=True)
        except client.ApiError as exc:
            common.report_error(exc)
            st.stop()
        st.session_state["uploaded_file_id"] = file_key

dataset_id = common.require_dataset()
info = common.load_info(dataset_id)
common.sidebar(dataset_id, info)
common.flash()
labels = common.labels(info)
version = info["version"]

controls, live = st.columns([1, 1.3], gap="large")
with controls:
    overview, rename, duplicates, affix = st.tabs(["Overview", "Rename", "Duplicates", "Prefix / suffix"])
    with overview:
        m1, m2, m3 = st.columns(3)
        m1.metric("Rows", f"{info['rows']:,}")
        m2.metric("Columns", info["columns"])
        m3.metric("Missing cells", f"{info['missing_cells']:,}")
        st.dataframe(pd.DataFrame(info["columns_info"])[["id", "name", "dtype", "missing"]],
                     hide_index=True, width="stretch")
    with rename:
        st.caption("Rename one column. Its data and internal ID stay the same.")
        with st.form(f"rename_{version}"):
            target = st.selectbox("Column to rename", list(labels), format_func=labels.get)
            new_name = st.text_input("New unique name")
            if st.form_submit_button("Apply rename"):
                common.run_operation(dataset_id, "rename_column",
                                     {"column_id": target, "new_name": new_name})
    with duplicates:
        groups = info["duplicate_column_groups"]
        if not groups:
            st.success("All column names are unique.")
        else:
            st.warning("Rename or discard duplicate occurrences to continue to Part 2.")
            st.caption("Matching is exact and case-sensitive. Identical names may contain different data.")
            for group in groups:
                st.write(f"**{group['name']}**: {', '.join(group['column_ids'])}")
                with st.form(f"duplicates_{version}_{group['column_ids'][0]}"):
                    cid = st.selectbox("Occurrence", group["column_ids"], format_func=labels.get)
                    action = st.radio("Resolve by", ["Rename", "Discard"], horizontal=True)
                    unique_name = st.text_input("Unique name (for Rename)")
                    if st.form_submit_button("Apply resolution"):
                        if action == "Rename":
                            common.run_operation(dataset_id, "rename_column",
                                                 {"column_id": cid, "new_name": unique_name})
                        else:
                            common.run_operation(dataset_id, "discard_column", {"column_id": cid})
    with affix:
        st.caption("Remove an exact prefix or suffix once. Existing null values are preserved.")
        with st.form(f"affix_{version}"):
            cid = st.selectbox("Column to transform", list(labels), format_func=labels.get)
            mode = st.radio("Position", ["prefix", "suffix"], horizontal=True)
            text = st.text_input("Exact text to remove", placeholder="$ or kg")
            numeric = st.checkbox("Convert this column to numeric after removal")
            st.caption("Conversion rejects invalid values, commas, new empty strings and infinities.")
            validate_col, apply_col = st.columns(2)
            validate = validate_col.form_submit_button("Validate / preview")
            apply = apply_col.form_submit_button("Apply transformation", type="primary")
        params = {"column_id": cid, "mode": mode, "text": text, "convert_to_numeric": numeric}
        if validate:
            try:
                result = client.preview_operation(dataset_id, "remove_affix", params, version)
                st.success(f"Valid · {result['changed_cells']} changed cells · {result['dtype_after']}")
                st.dataframe(pd.DataFrame(result["sample"]), hide_index=True, width="stretch")
            except client.ApiError as exc:
                common.report_error(exc)
        if apply:
            common.run_operation(dataset_id, "remove_affix", params)
    st.divider()
    if info["can_proceed"]:
        st.page_link("pages/1_Missing_Values.py", label="Next: Part 2 — missing values →")
    else:
        st.info("Part 2 is locked until duplicate names are resolved.")
with live:
    common.render_preview(dataset_id, info)
