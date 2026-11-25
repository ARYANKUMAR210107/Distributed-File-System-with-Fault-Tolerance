"""Input validation and filename sanitization helpers."""

import os
import re
from urllib.parse import urlparse

SAFE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def sanitize_filename(filename: str) -> str:
    """Strip directory components and reject unsafe filenames."""
    if not filename or not filename.strip():
        raise ValueError("Filename cannot be empty.")
    # Normalize Windows and POSIX separators before taking basename
    normalized = filename.replace("\\", "/")
    base = os.path.basename(normalized).strip()
    if not base or base in (".", ".."):
        raise ValueError("Invalid filename.")
    # Remove control characters
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", base)
    if not cleaned:
        raise ValueError("Invalid filename after sanitization.")
    return cleaned


def validate_identifier(value: str, label: str = "id") -> str:
    """Ensure identifiers contain only safe alphanumeric, underscore, or hyphen chars."""
    if not value or not SAFE_ID_PATTERN.match(value):
        raise ValueError(f"Invalid {label}: must match [A-Za-z0-9_-]{{1,128}}.")
    return value


def validate_node_url(url: str) -> str:
    """Validate that a Storage Node URL is a well-formed HTTP/HTTPS URL."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Node URL must be a valid http:// or https:// URL.")
    return url.strip().rstrip("/")
