import streamlit as st
from datacleaning import (
    fix_nan_values,
    preview_nan_fix,
    highlight_nan
)


st.set_page_config(
    page_title="OmniSight - Missing Values",
    layout="wide"
)

st.title("OmniSight — Handle Missing Values")

st.caption(
    "Clean missing values step-by-step"
)


# --------------------------------------------------
# Get current dataframe
# --------------------------------------------------

if "current_df" not in st.session_state:

    st.warning(
        "No working dataset yet — go back to page 1."
    )

    if st.button("← Back to page 1"):
        st.switch_page("app.py")

    st.stop()


# IMPORTANT:
# Always work on the CURRENT modified dataframe.

current_df = st.session_state["current_df"]


# --------------------------------------------------
# Back button
# --------------------------------------------------

if st.button("← Back to column selection"):

    st.switch_page("app.py")


# --------------------------------------------------
# Current dataframe
# --------------------------------------------------

st.subheader(
    "1. Current data"
)

preview_rows = min(
    20,
    len(current_df)
)

st.dataframe(
    highlight_nan(
        current_df.head(preview_rows)
    )
)


# --------------------------------------------------
# Find ONLY columns that currently contain NaN
# --------------------------------------------------

nan_counts = current_df.isna().sum()

cols_with_nan = (
    nan_counts[nan_counts > 0]
    .index
    .tolist()
)


# --------------------------------------------------
# No NaN remaining
# --------------------------------------------------

if not cols_with_nan:

    st.success(
        "🎉 No NaN values remain!"
    )

    st.subheader(
        "Final cleaned dataset"
    )

    st.dataframe(
        current_df.head(20)
    )

    csv_bytes = current_df.to_csv(
        index=False
    ).encode("utf-8")

    st.download_button(
        label="⬇️ Download final CSV",
        data=csv_bytes,
        file_name="cleaned_data.csv",
        mime="text/csv"
    )

    st.stop()


# --------------------------------------------------
# Show ONLY columns containing NaN
# --------------------------------------------------

st.subheader(
    "2. Columns containing NaN"
)

nan_table = (
    nan_counts[cols_with_nan]
    .rename("NaN count")
    .to_frame()
)

st.dataframe(
    nan_table
)


# --------------------------------------------------
# Select columns to clean
# --------------------------------------------------

target_cols = st.multiselect(
    "Which columns do you want to clean?",
    options=cols_with_nan,
)


# --------------------------------------------------
# Strategy
# --------------------------------------------------

strategy_label = st.radio(
    "Choose a strategy:",
    options=[
        "Drop rows with NaN",
        "Fill with a specific value",
        "Fill with column mean (numeric only)",
        "Fill with column max (numeric only)",
        "Fill with column min (numeric only)",
    ]
)


strategy_map = {

    "Drop rows with NaN":
        "drop",

    "Fill with a specific value":
        "fill",

    "Fill with column mean (numeric only)":
        "mean",

    "Fill with column max (numeric only)":
        "max",

    "Fill with column min (numeric only)":
        "min",
}


strategy = strategy_map[strategy_label]


# --------------------------------------------------
# Fill value
# --------------------------------------------------

fill_value = None

if strategy == "fill":

    fill_value = st.text_input(
        "Fill value",
        value="0"
    )


# --------------------------------------------------
# Preview changes
# --------------------------------------------------

if target_cols:

    st.subheader(
        "3. Preview changes"
    )

    preview_df = preview_nan_fix(
        current_df,
        target_cols,
        strategy,
        fill_value
    )

    st.dataframe(
        preview_df
    )


# --------------------------------------------------
# Apply cleaning
# --------------------------------------------------

if target_cols:

    if st.button(
        "Apply cleaning"
    ):

        updated_df = fix_nan_values(
            current_df,
            target_cols,
            strategy,
            fill_value
        )

        # IMPORTANT:
        # Replace the current dataframe.
        st.session_state["current_df"] = (
            updated_df.copy()
        )

        st.success(
            "✅ Changes applied!"
        )

        # Force Streamlit to rerun so that
        # the NaN list is recalculated.
        st.rerun()


# --------------------------------------------------
# Current progress
# --------------------------------------------------

st.subheader(
    "4. Current cleaned data"
)

st.dataframe(
    highlight_nan(
        st.session_state["current_df"].head(20)
    )
)


# --------------------------------------------------
# Download
# --------------------------------------------------

st.subheader(
    "5. Download"
)

final_df = st.session_state["current_df"]

csv_bytes = final_df.to_csv(
    index=False
).encode("utf-8")

st.download_button(
    label="⬇️ Download current CSV",
    data=csv_bytes,
    file_name="cleaned_data.csv",
    mime="text/csv"
)