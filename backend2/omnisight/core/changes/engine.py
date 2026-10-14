"""Pure dataset transformation functions."""

from __future__ import annotations

from typing import Any

import pandas as pd

from omnisight.core.changes.registry import (
    get_change_definition,
)
from omnisight.core.changes.cleaning import (
    drop_duplicates,
    drop_missing_rows,
    fill_mean,
    fill_constant,
    trim_text,
    strip_affixes,
    remove_separators,
    convert_to_numeric,
    convert_to_datetime,
)


class ColumnNotFound(Exception):
    pass


class ColumnNameConflict(Exception):
    pass


class InvalidColumnName(Exception):
    pass


def apply_column_rename(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    parameters: dict[str, Any],
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """
    Rename one column without changing input data.

    Returns:
        transformed DataFrame, operation details
    """

    column_id = parameters.get("column_id")
    requested_name = parameters.get("name")

    if not isinstance(column_id, str):
        raise ColumnNotFound(
            "A valid column identifier is required."
        )

    try:
        column_index = column_ids.index(column_id)
    except ValueError as exc:
        raise ColumnNotFound(
            "Column identifier not found."
        ) from exc

    if not isinstance(requested_name, str):
        raise InvalidColumnName(
            "Column name must be a string."
        )

    new_name = requested_name.strip()

    if (
        not new_name
        or len(new_name) > 128
        or any(
            ord(char) < 32 or ord(char) == 127
            for char in new_name
        )
    ):
        raise InvalidColumnName(
            "Column name must contain 1–128 valid characters."
        )

    old_name = str(
        dataframe.columns[column_index]
    )

    if new_name == old_name:
        return dataframe, {
            "changed": False,
            "column_id": column_id,
            "old_name": old_name,
            "new_name": new_name,
        }

    for index, existing_name in enumerate(
        dataframe.columns
    ):
        if index == column_index:
            continue

        if (
            str(existing_name).casefold()
            == new_name.casefold()
        ):
            raise ColumnNameConflict(
                "Another column already has this name."
            )

    # Create a separate DataFrame object.
    # Only its column labels are modified.
    result = dataframe.copy(deep=False)

    updated_columns = list(result.columns)
    updated_columns[column_index] = new_name

    result.columns = updated_columns

    return result, {
        "changed": True,
        "column_id": column_id,
        "old_name": old_name,
        "new_name": new_name,
    }


CHANGE_HANDLERS = {
    "column.rename": apply_column_rename,

    "rows.drop_duplicates": drop_duplicates,
    "rows.drop_missing": drop_missing_rows,

    "missing.fill_mean": fill_mean,
    "missing.fill_constant": fill_constant,

    "text.trim": trim_text,
    "text.strip_affixes": strip_affixes,
    "text.remove_separators": remove_separators,

    "column.to_numeric": convert_to_numeric,
    "column.to_datetime": convert_to_datetime,
}


def apply_change(
    dataframe: pd.DataFrame,
    column_ids: list[str],
    kind: str,
    parameters: dict[str, Any],
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """
    Execute one registered dataset operation.

    This function:
      - does not modify the original DataFrame
      - does not write to session state
      - does not add history records
      - does not increment dataset versions

    Those responsibilities belong to the dataset service.
    """

    get_change_definition(kind)

    handler = CHANGE_HANDLERS.get(kind)

    if handler is None:
        raise NotImplementedError(
            f"No executor implemented for {kind}"
        )

    return handler(
        dataframe,
        column_ids,
        parameters,
    )