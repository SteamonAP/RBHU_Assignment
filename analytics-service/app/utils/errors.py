"""Small API exception type plus the JSON response-envelope helpers.

Every response the service returns - success or failure - is shaped here so the
HTTP layer stays thin and the payload is consistent platform-wide.
"""

from typing import Any, Optional


class ApiError(Exception):
    """Raised for expected, client-facing failures.

    Carries the top-level ``message``, a list of field-level ``errors`` ready to
    be serialised into the response envelope, and the HTTP ``status_code`` that
    should be returned to the client.
    """

    def __init__(self, message: str, errors: Optional[list] = None, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.errors = errors or []
        self.status_code = status_code


def success_response(message: str, data: Any = None) -> dict:
    """Build the standard success envelope ``{success, message, data}``."""
    payload = {"success": True, "message": message}
    if data is not None:
        payload["data"] = data
    return payload


def error_response(message: str, errors: Optional[list] = None) -> dict:
    """Build the standard error envelope ``{success, message, errors}``."""
    payload = {"success": False, "message": message}
    if errors:
        payload["errors"] = errors
    return payload
