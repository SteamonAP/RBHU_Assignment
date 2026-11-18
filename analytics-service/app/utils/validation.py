"""File-upload validation helpers: extension, size and the required columns."""

from typing import Optional

from app.utils.errors import ApiError

#: The CSV must contain these columns (extra columns are ignored).
REQUIRED_COLUMNS = ["salesperson", "revenue", "region"]

#: Only comma-separated values files are accepted.
ALLOWED_EXTENSIONS = {"csv"}


def allowed_file(filename: Optional[str]) -> bool:
    """Return ``True`` when ``filename`` has a supported extension."""
    if not filename or "." not in filename:
        return False
    extension = filename.rsplit(".", 1)[1].lower()
    return extension in ALLOWED_EXTENSIONS


def validate_file_size(file_size: int, max_size_mb: int) -> None:
    """Raise :class:`ApiError` (HTTP 400) when ``file_size`` exceeds the limit."""
    max_size_bytes = max_size_mb * 1024 * 1024
    if file_size > max_size_bytes:
        raise ApiError(
            "Validation failed",
            [
                {
                    "field": "file",
                    "message": f"File is too large; the maximum allowed size is {max_size_mb} MB",
                }
            ],
            status_code=400,
        )
