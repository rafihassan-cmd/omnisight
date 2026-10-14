"""CSV parsing and initial dataset validation."""

from __future__ import annotations

from io import BytesIO

import pandas as pd


class CSVParseError(Exception):
    """Raised when CSV content is invalid or unsupported."""


class DatasetMemoryLimitError(Exception):
    """Raised when parsed data exceeds the memory policy."""


def parse_csv(
    buffer: BytesIO,
    max_memory_bytes: int,
) -> tuple[pd.DataFrame, int]:
    """
    Parse an in-memory CSV buffer.

    Returns:
        dataframe, estimated_memory_bytes
    """

    buffer.seek(0)

    try:
        df = pd.read_csv(
            buffer,
            encoding="utf-8-sig",
            low_memory=False,
            on_bad_lines="error",
        )

    except UnicodeError as exc:
        raise CSVParseError(
            "Unsupported CSV encoding. Use UTF-8."
        ) from exc

    except pd.errors.EmptyDataError as exc:
        raise CSVParseError(
            "CSV file is empty or has no columns."
        ) from exc

    except (
        pd.errors.ParserError,
        ValueError,
    ) as exc:
        raise CSVParseError(
            f"Could not parse CSV: {exc}"
        ) from exc

    if df.shape[1] == 0:
        raise CSVParseError(
            "CSV must contain at least one column."
        )

    if df.shape[0] == 0:
        raise CSVParseError(
            "CSV must contain at least one data row."
        )

    memory_bytes = int(
        df.memory_usage(
            index=True,
            deep=True,
        ).sum()
    )

    if memory_bytes > max_memory_bytes:
        raise DatasetMemoryLimitError(
            "Parsed dataset exceeds the configured "
            "in-memory dataset limit."
        )

    return df, memory_bytes