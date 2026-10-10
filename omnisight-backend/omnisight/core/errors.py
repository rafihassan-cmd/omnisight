class CleaningError(ValueError):
    """An operation could not be applied; safe to display to the user."""
    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.details = details or {}


class VersionConflict(CleaningError):
    """The client is editing an older dataset version."""
