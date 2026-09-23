import streamlit as st
from datacleaning import fix_nan_values, preview_nan_fix, highlight_nan

st.set_page_config(page_title="OmniSight - Missing Values", layout="wide")
st.title("OmniSight — Handle Missing Values")
st.caption("Page 2 of 2: fix NaN values in the finalized dataset")

if "new_df" not in st.session_state:
    st.warning("No finalized dataset yet — go back to page 1 and select your columns first.")
    if st.button("<- Back to page 1"):
        st.switch_page("app.py")
    st.stop()

new_df = st.session_state["new_df"]

if st.button("<- Back to column selection"):
    st.switch_page("app.py")

st.subheader("1. Current data (NaN cells highlighted)")
preview_rows = min(20, len(new_df))
st.dataframe(highlight_nan(new_df.head(preview_rows)))

nan_counts = new_df.isna().sum()
cols_with_nan = nan_counts[nan_counts > 0].index.tolist()

if not cols_with_nan:
    st.success("No NaN values found in the finalized dataset — nothing to fix.")
    st.stop()

st.subheader("2. Columns with missing values")
st.dataframe(nan_counts[cols_with_nan].rename("NaN count"))

target_cols = st.multiselect(
    "Which columns should the fix apply to?",
    options=cols_with_nan,
    default=cols_with_nan,
)

strategy_label = st.radio(
    "Choose a strategy:",
    options=[
        "Drop rows with NaN",
        "Fill with a specific value",
        "Fill with column mean (numeric only)",
        "Ignore",
    ],
)
strategy_map = {
    "Drop rows with NaN": "drop",
    "Fill with a specific value": "fill",
    "Fill with column mean (numeric only)": "mean",
    "Fill with column max (numeric only)": "max",
    "Fill with column min (numeric only)": "min",
    "Ignore": "ignore",
}
strategy = strategy_map[strategy_label]

fill_value = None
if strategy == "fill":
    fill_value = st.text_input("Fill value", value="0")

if target_cols and strategy != "ignore":
    st.subheader("3. Preview: before -> after")
    preview_df = preview_nan_fix(new_df, target_cols, strategy, fill_value)
    if strategy == "drop":
        st.write(f"{len(preview_df)} row(s) currently have NaN in the selected columns and will be removed:")
    else:
        st.write("Rows that currently have NaN in the selected columns, with the proposed replacement shown alongside:")
    st.dataframe(preview_df)

if target_cols and st.button("Apply"):
    cleaned_df = fix_nan_values(new_df, target_cols, strategy, fill_value)
    st.session_state["cleaned_df"] = cleaned_df
    st.success("Done.")

if "cleaned_df" in st.session_state:
    st.subheader("4. Result")
    st.dataframe(st.session_state["cleaned_df"].head(20))
    csv_bytes = st.session_state["cleaned_df"].to_csv(index=False).encode("utf-8")
    st.download_button("Download cleaned CSV", csv_bytes, "cleaned_data.csv", "text/csv")
