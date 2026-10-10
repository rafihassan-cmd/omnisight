from __future__ import annotations

import numpy as np
import pandas as pd

from .errors import CleaningError


def numeric_series(series: pd.Series) -> pd.Series:
    """Reject invalid nonmissing cells rather than replacing them with null."""
    numbers = pd.to_numeric(series.astype("string"), errors="coerce")
    finite = np.isfinite(numbers.fillna(0).astype("float64"))
    invalid = series.notna() & (numbers.isna() | ~finite)
    if invalid.any():
        positions = np.flatnonzero(invalid.to_numpy())
        samples = [{"row": int(i) + 1, "value": str(series.iloc[i])}
                   for i in positions[:10]]
        raise CleaningError(
            f"Numeric conversion failed for {len(positions)} nonmissing value(s). No changes applied.",
            {"invalid_count": len(positions), "invalid_rows": samples},
        )
    if pd.api.types.is_bool_dtype(numbers):
        raise CleaningError("Boolean values cannot be converted by this operation.")
    return numbers.convert_dtypes()
