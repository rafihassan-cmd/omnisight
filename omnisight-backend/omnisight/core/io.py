from __future__ import annotations

import csv
import io
from pathlib import Path

import pandas as pd

from .errors import CleaningError


def load_csv(source) -> pd.DataFrame:
    """Preserve exact headers; unique internal IDs distinguish duplicates."""
    try:
        raw = source.read() if hasattr(source, "read") else Path(source).read_bytes()
        text = raw.decode("utf-8-sig") if isinstance(raw, bytes) else raw.lstrip("\ufeff")
        reader = csv.reader(io.StringIO(text), strict=True)
        headers = next(reader)
        if not headers:
            raise CleaningError("CSV must contain a header row.")
        for row_number, row in enumerate(reader, start=1):
            if row and len(row) != len(headers):
                raise CleaningError(f"Data row {row_number} has {len(row)} cells; expected {len(headers)}.")
        ids = [f"c{i}" for i in range(len(headers))]
        df = pd.read_csv(io.StringIO(text), header=0, names=ids, low_memory=False)
        df.attrs["column_names"] = dict(zip(ids, headers))
        return df
    except (StopIteration, csv.Error, pd.errors.ParserError, pd.errors.EmptyDataError,
            UnicodeDecodeError) as exc:
        raise CleaningError(f"Could not read CSV: {exc}") from exc
