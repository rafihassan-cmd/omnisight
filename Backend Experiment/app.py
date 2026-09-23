import streamlit as st
from datacleaning import (
    get_csv_file,
    create_subset_df,
    create_dataframe_info,
    rename_columns,
)

st.set_page_config(page_title="OmniSight - Data Cleaning Demo", layout="wide")
st.title("OmniSight — Data Cleaning Demo")
st.caption("Page 1 of 2: upload, preview, inspect, and rename columns")

uploaded_file = st.file_uploader("Upload a CSV file", type=["csv"])

if uploaded_file is not None:
    st.session_state["raw_df"] = get_csv_file(uploaded_file)
    # a fresh upload should discard any earlier work
    st.session_state.pop("new_df", None)
    st.session_state.pop("cleaned_df", None)

if "raw_df" not in st.session_state:
    st.info("Upload a CSV file to get started.")
    st.stop()

df = st.session_state["raw_df"]

st.subheader("1. Select columns for analysis")
selected_cols = st.multiselect(
    "Choose the columns you want to include in your working dataset:",
    options=list(df.columns),
    default=list(df.columns),
)

if not selected_cols:
    st.info("Select at least one column to continue.")
    st.stop()

working_df = create_subset_df(df, selected_cols)

st.subheader("2. Preview")
max_rows = max(1, min(100, len(working_df)))
n_rows = st.slider("Rows to preview", min_value=1, max_value=max_rows, value=min(5, max_rows))
st.dataframe(working_df.head(n_rows))

st.subheader("3. DataFrame Info")
info_df = create_dataframe_info(
    unique_counts=working_df.nunique(),
    nan_counts=working_df.isna().sum(),
    dtypes=working_df.dtypes,
)
st.dataframe(info_df)

st.subheader("4. Rename columns (optional)")
with st.form("rename_form"):
    new_names = {}
    rename_cols_ui = st.columns(3)
    for i, col in enumerate(working_df.columns):
        with rename_cols_ui[i % 3]:
            new_names[col] = st.text_input(f"'{col}' ->", value=col, key=f"rename_{col}")
    apply_rename = st.form_submit_button("Apply renames")

if apply_rename:
    rename_map = {old: new for old, new in new_names.items() if new and new != old}
    if rename_map:
        working_df = rename_columns(working_df, rename_map)
        st.success(f"Renamed {len(rename_map)} column(s).")
        st.dataframe(working_df.head(n_rows))
    else:
        st.info("No changes to apply.")

# keep the finalized working dataset current on every rerun, so it's always
# up to date the moment the user clicks through to page 2

st.subheader("5. Continue")
if st.button("Finalize & handle missing values ->"):
    st.session_state["new_df"] = working_df
    st.switch_page("pages/1_Handle_Missing_Values.py")
