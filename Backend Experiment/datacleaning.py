import pandas as pd
import numpy as np


def get_csv_file(uploaded_file):
    """
    Load a CSV into a DataFrame.
    Works with a file path (str) or a Streamlit UploadedFile object.
    Blank strings are converted to NaN so missing-value detection is consistent.
    """
    df = pd.read_csv(uploaded_file)
    df = df.replace('', np.nan)
    return df


def create_subset_df(df, selected_cols):
    """Return a new DataFrame containing only the selected columns."""
    return df[selected_cols].copy()


def create_dataframe_info(unique_counts, nan_counts, dtypes):
    """
    Combine per-column stats (unique value count, NaN count, dtype) into one
    summary DataFrame, indexed by column name.
    """
    info_df = pd.DataFrame({
        "dtype": dtypes.astype(str),
        "unique_values": unique_counts,
        "nan_count": nan_counts,
    })
    return info_df


def rename_columns(df, rename_map):
    """
    Rename column headers.
    rename_map: dict of {old_column_name: new_column_name}. Entries where
    old == new are harmless no-ops.
    """
    return df.rename(columns=rename_map)


def highlight_nan(df):
    """
    Return a pandas Styler that highlights NaN cells, for use with st.dataframe().
    """
    try:
        return df.style.map(lambda v: "background-color: #ffd6d6" if pd.isna(v) else "")
    except AttributeError:
        # older pandas (<2.1) doesn't have Styler.map
        return df.style.applymap(lambda v: "background-color: #ffd6d6" if pd.isna(v) else "")


def preview_nan_fix(df, columns, strategy, fill_value=None):
    """
    Show what a NaN-fix strategy WOULD do, without modifying df.

    Returns only the rows that currently have a NaN in `columns`:
      - "drop": those rows as-is (they are the ones that would be removed)
      - "fill"/"mean": those rows plus one "<col> -> new value" column per
        target column, showing what each NaN would be replaced with
      - "ignore": those rows unchanged
    """
    affected_mask = df[columns].isna().any(axis=1)
    affected_rows = df[affected_mask]

    if strategy == "drop":
        return affected_rows

    if strategy in ("fill", "mean"):
        preview = affected_rows.copy()
        for col in columns:
            if strategy == "fill":
                value = fill_value
            else:
                value = df[col].mean() if pd.api.types.is_numeric_dtype(df[col]) else None
            preview[f"{col} -> new value"] = df.loc[affected_mask, col].fillna(value)
        return preview

    return affected_rows  # "ignore"


def fix_nan_values(df, columns, strategy, fill_value=None):
    """
    Apply a NaN-handling strategy to the given columns of df and return a new DataFrame.

    strategy:
      "drop"   - drop rows where any of `columns` is NaN
      "fill"   - fill NaN with `fill_value`
      "mean"   - fill NaN with the column mean (numeric columns only, others skipped)
      "max"
      "min"
      "ignore" - leave the column untouched
    """
    df = df.copy()
    for col in columns:
        if strategy == "drop":
            df = df.dropna(subset=[col])
        elif strategy == "fill":
            df[col] = df[col].fillna(fill_value)
        elif strategy == "mean":
            if pd.api.types.is_numeric_dtype(df[col]):
                df[col] = df[col].fillna(df[col].mean())
            # non-numeric columns are skipped silently under "mean"
        elif strategy == "max":
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].max())
        elif strategy == "min":
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].min())
        elif strategy == "ignore":
            pass
        else:
            raise ValueError(f"Unknown strategy: {strategy}")
    return df
