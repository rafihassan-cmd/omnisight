"""In-memory browser session management."""

from __future__ import annotations

import secrets
import threading
import time

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from omnisight.services.datasets import DatasetState
    from omnisight.services.cleaning import CleaningPreviewTicket

class SessionCapacityError(Exception):
    """Raised when the session store reaches capacity."""


@dataclass
class SessionState:
    token: str

    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    last_activity: float = field(
        default_factory=time.monotonic
    )

    # One active dataset per session.
    # Replaced with a concrete DatasetState type
    # when dataset ingestion is implemented.
    dataset: DatasetState | None = None
    
    pending_preview: CleaningPreviewTicket | None = None

    # Reserved for future dataset mutations.
    lock: threading.RLock = field(
        default_factory=threading.RLock,
        repr=False,
    )


class SessionStore:
    """Thread-safe, single-process session storage."""

    def __init__(
        self,
        ttl_seconds: int,
        max_sessions: int,
    ):
        if ttl_seconds <= 0:
            raise ValueError(
                "Session TTL must be positive."
            )

        if max_sessions <= 0:
            raise ValueError(
                "Maximum session count must be positive."
            )

        self.ttl_seconds = ttl_seconds
        self.max_sessions = max_sessions

        self._sessions: dict[str, SessionState] = {}
        self._lock = threading.RLock()

    def _expired(
        self,
        session: SessionState,
        now: float,
    ) -> bool:
        return (
            now - session.last_activity
            >= self.ttl_seconds
        )

    def _prune_locked(self, now: float) -> int:
        expired_tokens = [
            token
            for token, session in self._sessions.items()
            if self._expired(session, now)
        ]

        for token in expired_tokens:
            del self._sessions[token]

        return len(expired_tokens)

    def create(self) -> SessionState:
        """Create a new session with a secure random token."""

        with self._lock:
            now = time.monotonic()

            self._prune_locked(now)

            if len(self._sessions) >= self.max_sessions:
                raise SessionCapacityError(
                    "Session capacity reached."
                )

            token = secrets.token_urlsafe(32)

            while token in self._sessions:
                token = secrets.token_urlsafe(32)

            session = SessionState(
                token=token,
                last_activity=now,
            )

            self._sessions[token] = session

            return session

    def get(
        self,
        token: str | None,
    ) -> SessionState | None:
        """Retrieve a session and renew its activity time."""

        if not token:
            return None

        with self._lock:
            session = self._sessions.get(token)

            if session is None:
                return None

            now = time.monotonic()

            if self._expired(session, now):
                del self._sessions[token]
                return None

            session.last_activity = now

            return session

    def delete(self, token: str | None) -> bool:
        """Remove a session from the store."""

        if not token:
            return False

        with self._lock:
            return self._sessions.pop(token, None) is not None

    def replace_dataset(
        self,
        token: str,
        dataset: DatasetState,
    ) -> bool:
        """
        Atomically replace the dataset of an active session.

        Returns False if the session is missing or expired.
        """

        with self._lock:
            session = self._sessions.get(token)

            if session is None:
                return False

            now = time.monotonic()

            if self._expired(session, now):
                del self._sessions[token]
                return False

            with session.lock:
                session.dataset = dataset
                session.pending_preview = None
                session.last_activity = now

            return True

    def remove_dataset(self, token: str) -> bool:
        """
        Remove the dataset without ending the session.

        Returns False if the session is missing or expired.
        """

        with self._lock:
            session = self._sessions.get(token)

            if session is None:
                return False

            now = time.monotonic()

            if self._expired(session, now):
                del self._sessions[token]
                return False

            with session.lock:
                session.dataset = None
                session.pending_preview = None
                session.last_activity = now

            return True

    def cleanup_expired(self) -> int:
        """Release expired sessions."""

        with self._lock:
            return self._prune_locked(
                time.monotonic()
            )

    def clear(self) -> None:
        """Release all stored session references."""

        with self._lock:
            self._sessions.clear()