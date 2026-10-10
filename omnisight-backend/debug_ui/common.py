"""Frontend state and display helpers, shared by the two separate pages."""
import math

import pandas as pd
import streamlit as st

import client


def accept_state(state: dict, new_upload: bool = False):
    st.session_state["dataset_state"] = state
    st.session_state["dataset_id"] = state["dataset_id"]
    ids = [c["id"] for c in state["columns_info"]]
    selected = st.session_state.get("visible_columns", ids)
    st.session_state["visible_columns"] = ids if new_upload else [c for c in selected if c in ids]
    st.session_state["cached_preview"] = state.get("preview")
    st.session_state.pop("export", None)


def require_dataset() -> str:
    dataset_id = st.session_state.get("dataset_id")
    if not dataset_id:
        st.info("Upload a CSV on the Home page first.")
        st.stop()
    return dataset_id


def report_error(exc: client.ApiError):
    if exc.status == 409:
        st.session_state.pop("dataset_state", None)
        st.session_state.pop("cached_preview", None)
        st.session_state["flash"] = ("warning", str(exc))
        st.rerun()
    if exc.status == 404:
        for key in ("dataset_id", "dataset_state", "uploaded_file_id", "cached_preview", "export"):
            st.session_state.pop(key, None)
    st.error(str(exc))
    if exc.payload.get("invalid_rows"):
        st.caption("Invalid values (first 10); row numbers start at 1 below the CSV header.")
        st.dataframe(pd.DataFrame(exc.payload["invalid_rows"]), hide_index=True, width="stretch")


def load_info(dataset_id: str) -> dict:
    cached = st.session_state.get("dataset_state")
    if cached and cached["dataset_id"] == dataset_id:
        return cached
    try:
        state = client.info(dataset_id)
    except client.ApiError as exc:
        report_error(exc)
        st.stop()
    accept_state(state)
    return state


def flash():
    message = st.session_state.pop("flash", None)
    if message:
        kind, text = message
        getattr(st, kind)(text)


def preview_selection() -> dict:
    return {"limit": st.session_state.get("preview_limit", 20),
            "column_ids": st.session_state.get("visible_columns")}


def run_operation(dataset_id: str, name: str, params: dict):
    try:
        state = client.apply_operation(dataset_id, name, params,
                                       load_info(dataset_id)["version"], preview_selection())
    except client.ApiError as exc:
        report_error(exc)
        return
    accept_state(state)
    st.session_state["flash"] = ("success", f"{name.replace('_', ' ').capitalize()} applied.")
    st.rerun()


def labels(info: dict) -> dict:
    duplicated = {g["name"] for g in info["duplicate_column_groups"]}
    return {c["id"]: f"{c['name']} [{c['id']}]" if c["name"] in duplicated else c["name"]
            for c in info["columns_info"]}


def render_preview(dataset_id: str, info: dict):
    st.subheader("Live dataset preview")
    st.caption(f"Version {info['version']} · {info['rows']:,} rows · visibility does not delete columns")
    names = labels(info)
    st.multiselect("Visible columns", list(names), format_func=names.get, key="visible_columns")
    st.select_slider("Rows per page", [10, 20, 50, 100], value=20, key="preview_limit")
    limit = st.session_state["preview_limit"]
    pages = max(1, math.ceil(info["rows"] / limit))
    page = st.number_input("Page", min_value=1, max_value=pages, value=1,
                           key=f"preview_page_{info['version']}_{limit}")
    offset = (page - 1) * limit
    ids = st.session_state["visible_columns"]
    if not ids:
        st.info("Select at least one column to display. The dataset is unchanged.")
        return
    sample = st.session_state.get("cached_preview")
    if not sample or (sample["version"], sample["offset"], sample["limit"],
                      [c["id"] for c in sample["columns"]]) != (info["version"], offset, limit, ids):
        try:
            sample = client.preview(dataset_id, offset, limit, ids)
        except client.ApiError as exc:
            report_error(exc)
            return
        if sample["version"] != info["version"]:
            st.session_state.pop("dataset_state", None)
            st.rerun()
        st.session_state["cached_preview"] = sample
    table = pd.DataFrame(sample["rows"], columns=ids).rename(columns=names)
    st.dataframe(table, hide_index=True, width="stretch", height=430)
    st.caption(f"Page {page} of {pages} · {len(table)} rows shown")


def sidebar(dataset_id: str, info: dict):
    with st.sidebar:
        st.markdown(f"**{info['filename']}**")
        st.caption(f"{info['rows']:,} rows × {info['columns']} columns")
        undo_col, reset_col = st.columns(2)
        action = None
        if undo_col.button("Undo", disabled=not info["history_count"], width="stretch"):
            action = client.undo
        if reset_col.button("Reset", disabled=not info["history_count"], width="stretch"):
            action = client.reset
        if action:
            try:
                accept_state(action(dataset_id, info["version"], preview_selection()))
                st.rerun()
            except client.ApiError as exc:
                report_error(exc)
        if st.button("Refresh dataset", width="stretch"):
            st.session_state.pop("dataset_state", None)
            st.session_state.pop("cached_preview", None)
            st.session_state.pop("export", None)
            st.rerun()
        st.divider()
        st.markdown("**History**")
        try:
            for item in client.history(dataset_id):
                with st.expander(f"{item['index'] + 1}. {item['name']}"):
                    st.json(item["params"])
        except client.ApiError as exc:
            report_error(exc)
        st.divider()
        if st.button("Prepare CSV download", width="stretch"):
            try:
                st.session_state["export"] = client.export_csv(dataset_id)
            except client.ApiError as exc:
                report_error(exc)
        if "export" in st.session_state:
            st.download_button("Download CSV", st.session_state["export"],
                               "cleaned_data.csv", "text/csv", width="stretch")
