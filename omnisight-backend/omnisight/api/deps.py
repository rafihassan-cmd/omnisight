from __future__ import annotations

from functools import lru_cache

from omnisight.config import settings
from omnisight.services.datasets import DatasetStore


@lru_cache
def get_store() -> DatasetStore:
    return DatasetStore(max_datasets=settings.max_datasets)
