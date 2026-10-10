"""Operation registry. A new cleaning/analysis step is one function plus one line here.

Every operation has the shape  fn(df, **params) -> new DataFrame  and must not mutate df.
Params are plain JSON values, so the same call can come from React, Streamlit or a replay.
"""
from __future__ import annotations

import inspect
from typing import Callable

import pandas as pd

from .errors import CleaningError
from .missing import STRATEGIES, apply_missing, preview_missing
from .profiling import duplicate_groups
from .transforms import rename_column, discard_column, remove_affix, preview_affix

OPERATIONS: dict[str, Callable[..., pd.DataFrame]] = {
    "rename_column": rename_column,
    "discard_column": discard_column,
    "remove_affix": remove_affix,
    "handle_missing": apply_missing,
}

# Optional dry-run for an operation: fn(df, **params) -> JSON-safe dict.
PREVIEWS: dict[str, Callable[..., dict]] = {
    "remove_affix": preview_affix,
    "handle_missing": preview_missing,
}


def _bind(registry: dict, name: str, df, params: dict):
    if name == "handle_missing" and duplicate_groups(df):
        raise CleaningError("Resolve duplicate column names before Part 2.")
    fn = registry.get(name)
    if fn is None:
        raise CleaningError(f"Unknown operation {name!r}. Available: {sorted(registry)}")
    try:
        inspect.signature(fn).bind(df, **params)
    except TypeError as exc:
        raise CleaningError(f"Invalid parameters for {name!r}: {exc}") from exc
    return fn


def apply_operation(df: pd.DataFrame, name: str, params: dict | None = None) -> pd.DataFrame:
    params = params or {}
    return _bind(OPERATIONS, name, df, params)(df, **params)


def preview_operation(df: pd.DataFrame, name: str, params: dict | None = None) -> dict:
    params = params or {}
    if name not in PREVIEWS:
        raise CleaningError(f"Operation {name!r} has no preview.")
    return _bind(PREVIEWS, name, df, params)(df, **params)


def describe_operations() -> dict:
    """Machine-readable catalogue, so any client can build its UI from the API."""
    return {
        "operations": {
            name: {
                "params": list(inspect.signature(fn).parameters)[1:],
                "has_preview": name in PREVIEWS,
            }
            for name, fn in OPERATIONS.items()
        },
        "missing_strategies": list(STRATEGIES),
        "conversion_targets": ["numeric"],
    }
