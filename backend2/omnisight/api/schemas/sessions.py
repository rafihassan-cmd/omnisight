"""Session API response schemas."""

from datetime import datetime

from pydantic import BaseModel


class SessionResponse(BaseModel):
    active: bool
    has_dataset: bool
    created_at: datetime
    idle_timeout_seconds: int