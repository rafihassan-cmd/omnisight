"""Central application configuration."""

import os
from dataclasses import dataclass


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)

    if value is None:
        return default

    return value.lower() in ("1", "true", "yes")


@dataclass(frozen=True)
class Settings:
    app_name: str = "OmniSight API"
    api_prefix: str = "/api/v1"

    # CSV ingestion
    max_upload_bytes: int = 50_000_000

    # Initial configurable memory safeguard.
    max_dataset_memory_bytes: int = int(
        os.getenv(
            "OMNISIGHT_MAX_DATASET_MEMORY_BYTES",
            "256000000",
        )
    )

    # Session management
    session_ttl_seconds: int = 3600
    session_cleanup_seconds: int = 60

    max_sessions: int = int(
        os.getenv("OMNISIGHT_MAX_SESSIONS", "20")
    )

    # Authentication
    session_cookie_name: str = "omnisight_session"

    cookie_secure: bool = env_bool(
        "OMNISIGHT_COOKIE_SECURE",
        False,
    )

    # Cleaning preview configuration
    cleaning_preview_ttl_seconds: int = 300
    cleaning_preview_sample_rows: int = 5
    cleaning_preview_sample_columns: int = 20

    planner_max_questions: int = int(
    os.getenv("OMNISIGHT_PLANNER_MAX_QUESTIONS", "80")
    )

    # Phase 5 — Gemini AI interpretation
    gemini_api_key: str = os.getenv(
        "GEMINI_API_KEY", ""
    )

    gemini_model: str = os.getenv(
        "GEMINI_MODEL", "gemini-3.8-flash"
    )

    gemini_timeout_ms: int = int(
        os.getenv("GEMINI_TIMEOUT_MS", "30000")
    )

    insights_cache_ttl_seconds: int = int(
        os.getenv("OMNISIGHT_INSIGHTS_CACHE_TTL", "900")
    )

    insights_cache_max_entries: int = int(
        os.getenv("OMNISIGHT_INSIGHTS_CACHE_MAX_ENTRIES", "12")
    )

settings = Settings()