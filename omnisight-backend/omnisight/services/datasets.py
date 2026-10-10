"""Dataset state: the original frame, the current frame and the operation history.

The store is in-memory and single-process. Its public methods are the only thing the API
touches, so it can be replaced by a disk/Redis/DB-backed version without touching routes.
"""
from __future__ import annotations

import threading
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone

import pandas as pd

from omnisight.core.errors import CleaningError, VersionConflict
from omnisight.core.operations import apply_operation
from omnisight.core.profiling import shape_stats


class DatasetNotFound(KeyError):
    pass


@dataclass
class OperationRecord:
    name: str
    params: dict
    summary: dict
    at: str


@dataclass
class Dataset:
    id: str
    filename: str
    original: pd.DataFrame
    current: pd.DataFrame
    version: int = 0
    history: list[OperationRecord] = field(default_factory=list)
    lock: threading.RLock = field(default_factory=threading.RLock, repr=False)


class DatasetStore:
    def __init__(self, max_datasets: int = 20):
        self._items: OrderedDict[str, Dataset] = OrderedDict()
        self._lock = threading.Lock()
        self._max = max_datasets

    def create(self, filename: str, df: pd.DataFrame) -> Dataset:
        ds = Dataset(id=uuid.uuid4().hex, filename=filename, original=df, current=df)
        with self._lock:
            self._items[ds.id] = ds
            while len(self._items) > self._max:
                self._items.popitem(last=False)
        return ds

    def get(self, dataset_id: str) -> Dataset:
        with self._lock:
            ds = self._items.get(dataset_id)
        if ds is None:
            raise DatasetNotFound(dataset_id)
        return ds

    def delete(self, dataset_id: str) -> None:
        with self._lock:
            if self._items.pop(dataset_id, None) is None:
                raise DatasetNotFound(dataset_id)

    @staticmethod
    def check_version(ds: Dataset, expected_version: int) -> None:
        if ds.version != expected_version:
            raise VersionConflict("Dataset changed. Refresh the preview and try again.",
                                  {"current_version": ds.version})

    def apply(self, dataset_id: str, name: str, params: dict,
              expected_version: int) -> tuple[Dataset, OperationRecord]:
        ds = self.get(dataset_id)
        with ds.lock:
            self.check_version(ds, expected_version)
            before = ds.current
            after = apply_operation(before, name, params)  # raises before any state changes
            record = OperationRecord(
                name=name,
                params=params,
                summary={"before": shape_stats(before), "after": shape_stats(after)},
                at=datetime.now(timezone.utc).isoformat(),
            )
            ds.current = after
            ds.history.append(record)
            ds.version += 1
            return ds, record

    def undo(self, dataset_id: str, expected_version: int) -> Dataset:
        ds = self.get(dataset_id)
        with ds.lock:
            self.check_version(ds, expected_version)
            if not ds.history:
                raise CleaningError("Nothing to undo.")
            remaining = ds.history[:-1]
            df = ds.original
            for rec in remaining:  # replay is deterministic and keeps memory low
                df = apply_operation(df, rec.name, rec.params)
            ds.history = remaining
            ds.current = df
            ds.version += 1
            return ds

    def reset(self, dataset_id: str, expected_version: int) -> Dataset:
        ds = self.get(dataset_id)
        with ds.lock:
            self.check_version(ds, expected_version)
            ds.history = []
            ds.current = ds.original
            ds.version += 1
            return ds
