import streamlit as st
from datacleaning import (
    get_csv_file,
    create_subset_df,
    create_dataframe_info,
    rename_columns,
)

st.set_page_config(
    page_title="OmniSight - Data Cleaning Demo",
    layout="wide"
)

st.title("OmniSight — Data Cleaning Demo")
st.caption("Page 1 of 2: upload, preview, inspect, and rename columns")


# --------------------------------------------------
# Upload CSV
# --------------------------------------------------

uploaded_file = st.file_uploader(
    "Upload a CSV file",
    type=["csv"]
)

if uploaded_file is not None:

    # Only reset when a new file is uploaded
    st.session_state["raw_df"] = get_csv_file(uploaded_file)

    # Reset all previous cleaning work
    st.session_state.pop("current_df", None)
    st.session_state.pop("cleaned_df", None)


# --------------------------------------------------
# Check if file exists
# --------------------------------------------------

if "raw_df" not in st.session_state:
    st.info("Upload a CSV file to get started.")
    st.stop()


df = st.session_state["raw_df"]


# --------------------------------------------------
# Select columns
# --------------------------------------------------

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


# --------------------------------------------------
# Preview
# --------------------------------------------------

st.subheader("2. Preview")

max_rows = max(1, min(100, len(working_df)))

n_rows = st.slider(
    "Rows to preview",
    min_value=1,
    max_value=max_rows,
    value=min(5, max_rows)
)

st.dataframe(working_df.head(n_rows))


# --------------------------------------------------
# DataFrame information
# --------------------------------------------------

st.subheader("3. DataFrame Info")

info_df = create_dataframe_info(
    unique_counts=working_df.nunique(),
    nan_counts=working_df.isna().sum(),
    dtypes=working_df.dtypes,
)

st.dataframe(info_df)


# --------------------------------------------------
# Rename columns
# --------------------------------------------------

st.subheader("4. Rename columns (optional)")

with st.form("rename_form"):

    new_names = {}

    rename_cols_ui = st.columns(3)

    for i, col in enumerate(working_df.columns):

        with rename_cols_ui[i % 3]:

            new_names[col] = st.text_input(
                f"'{col}' ->",
                value=col,
                key=f"rename_{col}"
            )

    apply_rename = st.form_submit_button("Apply renames")


if apply_rename:

    rename_map = {
        old: new
        for old, new in new_names.items()
        if new and new != old
    }

    if rename_map:

        working_df = rename_columns(
            working_df,
            rename_map
        )

        st.success(
            f"Renamed {len(rename_map)} column(s)."
        )

        st.dataframe(
            working_df.head(n_rows)
        )

    else:

        st.info("No changes to apply.")


# --------------------------------------------------
# Continue
# --------------------------------------------------

st.subheader("5. Continue")

if st.button("Finalize & handle missing values →"):

    # This is now the dataframe we will continue
    # cleaning from.
    st.session_state["current_df"] = working_df.copy()

    st.switch_page(
        "pages/1_Handle_Missing_Values.py"
    )