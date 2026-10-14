"""In-memory dataset state and unified change history."""

from __future__ import annotations

import copy
import uuid

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from omnisight.core.profiling import build_profile

from omnisight.core.changes.registry import (
    get_change_definition,
)

from omnisight.core.changes.engine import (
    apply_change,
    ColumnNotFound,
    ColumnNameConflict,
    InvalidColumnName,
)


class DatasetVersionConflict(Exception):
    """Mutation attempted against an outdated revision."""


class DatasetMemoryLimitError(Exception):
    """Transformed dataset exceeds the configured limit."""


class UndoUnavailable(Exception):
    """No committed operation is available to undo."""

def column_ids_for_history(
    dataset: DatasetState,
    history: list[ChangeRecord],
) -> list[str]:
    """
    Reconstruct active column IDs from the original IDs
    and committed operations.

    Column names and data types may change, but the
    stable IDs only disappear through column.drop.
    """

    working_ids = list(
        dataset.original_column_ids
    )

    for record in history:
        if record.kind != "column.drop":
            continue

        column_id = record.parameters["column_id"]

        if column_id not in working_ids:
            raise RuntimeError(
                "Invalid history: a column was dropped "
                "more than once or no longer exists."
            )

        if len(working_ids) <= 1:
            raise RuntimeError(
                "Invalid history: the last column "
                "cannot be deleted."
            )

        working_ids.remove(column_id)

    return working_ids

@dataclass(frozen=True)
class ChangeRecord:
    """One committed dataset transformation."""

    id: str
    kind: str
    parameters: dict[str, Any]
    details: dict[str, Any]
    created_at: datetime


@dataclass
class DatasetState:
    id: str
    filename: str

    original: pd.DataFrame
    current: pd.DataFrame

    source_size_bytes: int
    estimated_memory_bytes: int

    # Column identifiers remain stable through renames.
    column_ids: list[str] = field(default_factory=list)

    # Monotonically increasing dataset revision.
    version: int = 0

    uploaded_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    # Chronological, unified operation history.
    history: list[ChangeRecord] = field(
        default_factory=list
    )

    profile_cache: dict[str, Any] | None = field(
        default=None,
        repr=False,
    )

    profile_version: int = -1
    insights_cache: dict[str, dict] = field(
        default_factory=dict
    )

    original_column_ids: list[str] = field(
    default_factory=list
    )

    def __post_init__(self):
        if not self.original_column_ids:
            self.original_column_ids = list(
                self.column_ids
            )


def create_dataset(
    filename: str,
    dataframe: pd.DataFrame,
    source_size_bytes: int,
    estimated_memory_bytes: int,
) -> DatasetState:
    """Create a dataset with empty history."""

    column_ids = [
        f"col_{uuid.uuid4().hex}"
        for _ in dataframe.columns
    ]

    return DatasetState(
        id=uuid.uuid4().hex,
        filename=filename,
        original=dataframe,
        current=dataframe,
        source_size_bytes=source_size_bytes,
        estimated_memory_bytes=estimated_memory_bytes,
        column_ids=column_ids,
    )


def dataframe_memory_bytes(
    dataframe: pd.DataFrame,
) -> int:
    """Estimate the retained memory of a DataFrame."""

    return int(
        dataframe.memory_usage(
            index=True,
            deep=True,
        ).sum()
    )


def enforce_memory_limit(
    memory_bytes: int,
    max_memory_bytes: int | None,
) -> None:
    """Reject a result that exceeds the dataset budget."""

    if (
        max_memory_bytes is not None
        and memory_bytes > max_memory_bytes
    ):
        raise DatasetMemoryLimitError(
            "The resulting dataset exceeds the "
            "configured in-memory limit."
        )


def invalidate_profile(
    dataset: DatasetState,
) -> None:
    """Invalidate cached profiling data."""

    dataset.profile_cache = None
    dataset.profile_version = -1


def profile_dataset(
    dataset: DatasetState,
) -> dict[str, Any]:
    """Get the current dataset profile, using its cache."""

    if (
        dataset.profile_cache is None
        or dataset.profile_version != dataset.version
    ):
        dataset.profile_cache = build_profile(
            dataset.current,
            dataset.column_ids,
        )

        dataset.profile_version = dataset.version

    return {
        "dataset_id": dataset.id,
        "filename": dataset.filename,
        "dataset_version": dataset.version,
        **dataset.profile_cache,
    }


def check_dataset_version(
    dataset: DatasetState,
    expected_version: int,
) -> None:
    """Reject stale mutation requests."""

    if dataset.version != expected_version:
        raise DatasetVersionConflict(
            "Dataset has changed. Refresh and retry."
        )


def commit_dataset_change(
    dataset: DatasetState,
    kind: str,
    parameters: dict[str, Any],
    expected_version: int,
    max_memory_bytes: int | None = None,
) -> tuple[DatasetState, ChangeRecord | None]:
    """
    Execute and commit a dataset transformation.

    Caller must hold the owning session lock.

    A failure must not modify the dataset.
    """

    check_dataset_version(
        dataset,
        expected_version,
    )

    get_change_definition(kind)

    saved_parameters = copy.deepcopy(parameters)

    # Calculate before modifying session dataset state.
    result, details = apply_change(
        dataframe=dataset.current,
        column_ids=dataset.column_ids,
        kind=kind,
        parameters=saved_parameters,
    )

    if not details.get("changed", True):
        return dataset, None

    memory_bytes = dataframe_memory_bytes(result)

    enforce_memory_limit(
        memory_bytes,
        max_memory_bytes,
    )

    record = ChangeRecord(
        id=uuid.uuid4().hex,
        kind=kind,
        parameters=saved_parameters,
        details=copy.deepcopy(details),
        created_at=datetime.now(timezone.utc),
    )

    # Prepare the updated state before committing.
    new_history = [*dataset.history, record]

    new_column_ids = column_ids_for_history(
        dataset,
        new_history,
    )

    if len(new_column_ids) != len(result.columns):
        raise RuntimeError(
            "Column IDs are inconsistent with "
            "the transformed dataset."
        )

    # All validations passed. Commit atomically
    # with respect to ordinary Python exceptions
    # while the caller holds the session lock.
    dataset.current = result
    dataset.history = new_history
    dataset.column_ids = new_column_ids
    dataset.estimated_memory_bytes = memory_bytes
    dataset.version += 1

    invalidate_profile(dataset)

    return dataset, record


def rename_dataset_column(
    dataset: DatasetState,
    column_id: str,
    new_name: str,
    expected_version: int,
    max_memory_bytes: int | None = None,
) -> DatasetState:
    """Rename through the unified mutation mechanism."""

    updated, _ = commit_dataset_change(
        dataset=dataset,
        kind="column.rename",
        parameters={
            "column_id": column_id,
            "name": new_name,
        },
        expected_version=expected_version,
        max_memory_bytes=max_memory_bytes,
    )

    return updated

def replay_dataset_history(
    dataset: DatasetState,
    history: list[ChangeRecord],
    max_memory_bytes: int | None = None,
) -> pd.DataFrame:
    """
    Reconstruct the working DataFrame from the original
    dataset by replaying committed operations.

    Maintain column IDs throughout the replay.
    """

    working = dataset.original.copy(deep=False)
    working_ids = list(dataset.original_column_ids)

    for record in history:
        if len(working_ids) != len(working.columns):
            raise RuntimeError(
                "Column metadata became misaligned "
                "during history replay."
            )

        working, _ = apply_change(
            dataframe=working,
            column_ids=working_ids,
            kind=record.kind,
            parameters=copy.deepcopy(record.parameters),
        )

        if record.kind == "column.drop":
            column_id = record.parameters["column_id"]

            if column_id not in working_ids:
                raise RuntimeError(
                    "History references an already deleted "
                    "or unknown column."
                )

            working_ids.remove(column_id)

        if len(working_ids) != len(working.columns):
            raise RuntimeError(
                "History replay produced inconsistent "
                "column metadata."
            )

        enforce_memory_limit(
            dataframe_memory_bytes(working),
            max_memory_bytes,
        )

    return working


def undo_dataset_change(
    dataset: DatasetState,
    expected_version: int,
    max_memory_bytes: int | None = None,
) -> tuple[DatasetState, ChangeRecord]:
    """
    Undo the most recent committed operation.

    Reconstruct and validate everything before
    modifying the active dataset state.
    """

    check_dataset_version(
        dataset,
        expected_version,
    )

    if not dataset.history:
        raise UndoUnavailable(
            "There are no committed changes to undo."
        )

    undone_record = dataset.history[-1]
    remaining_history = dataset.history[:-1]

    # Reconstruct the DataFrame without mutating state.
    reconstructed = replay_dataset_history(
        dataset,
        remaining_history,
        max_memory_bytes=max_memory_bytes,
    )

    # Reconstruct stable column IDs.
    new_column_ids = column_ids_for_history(
        dataset,
        remaining_history,
    )

    if len(new_column_ids) != len(
        reconstructed.columns
    ):
        raise RuntimeError(
            "Restored column IDs do not match "
            "the reconstructed DataFrame."
        )

    memory_bytes = dataframe_memory_bytes(
        reconstructed
    )

    enforce_memory_limit(
        memory_bytes,
        max_memory_bytes,
    )

    # All checks passed. Commit the restored state.
    dataset.current = reconstructed
    dataset.history = remaining_history
    dataset.column_ids = new_column_ids
    dataset.estimated_memory_bytes = memory_bytes
    dataset.version += 1

    invalidate_profile(dataset)

    return dataset, undone_record

def reset_dataset_changes(
    dataset: DatasetState,
    expected_version: int,
    max_memory_bytes: int | None = None,
) -> tuple[DatasetState, bool]:
    """
    Restore the original uploaded DataFrame and names.

    A reset with empty history is a no-op.
    """

    check_dataset_version(
        dataset,
        expected_version,
    )

    if not dataset.history:
        return dataset, False

    restored = dataset.original.copy(deep=False)

    memory_bytes = dataframe_memory_bytes(
        restored
    )

    enforce_memory_limit(
        memory_bytes,
        max_memory_bytes,
    )

    dataset.current = restored
    dataset.history = []
    dataset.estimated_memory_bytes = memory_bytes
    dataset.version += 1
    dataset.column_ids = list(
        dataset.original_column_ids
    )

    invalidate_profile(dataset)

    return dataset, True