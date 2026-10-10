"""Runtime settings, read from environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

_DEFAULT_ORIGINS = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173"


@dataclass(frozen=True)
class Settings:
    cors_origins: list[str] = field(
        default_factory=lambda: [
            o.strip()
            for o in os.getenv("OMNISIGHT_CORS_ORIGINS", _DEFAULT_ORIGINS).split(",")
            if o.strip()
        ]
    )
    # In-memory store cap; the oldest dataset is evicted beyond this.
    max_datasets: int = field(
        default_factory=lambda: int(os.getenv("OMNISIGHT_MAX_DATASETS", "20"))
    )


settings = Settings()
