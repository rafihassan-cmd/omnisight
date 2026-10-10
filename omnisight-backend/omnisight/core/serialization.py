from __future__ import annotations

import json

import pandas as pd


def frame_to_records(df: pd.DataFrame) -> list[dict]:
    """JSON-safe rows: NaN/NaT/inf become null, numpy types become plain Python."""
    return json.loads(df.to_json(orient="records", date_format="iso"))


def json_scalar(value):
    """Make a single value (numpy scalar, Timestamp, ...) JSON-safe."""
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    return value
