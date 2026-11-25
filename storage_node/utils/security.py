"""Security helpers for Storage Node path and identifier validation."""

import re
from pathlib import Path

CHUNK_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def validate_chunk_id(chunk_id: str) -> str:
    """Validate that chunk_id is safe and contains no path traversal characters."""
    if not chunk_id or not CHUNK_ID_PATTERN.match(chunk_id):
        raise ValueError(
            "Invalid chunk_id: must be 1-128 characters of [A-Za-z0-9_-]."
        )
    return chunk_id


def safe_chunk_path(base_dir: Path, chunk_id: str, suffix: str = ".bin") -> Path:
    """Resolve a chunk file path strictly within base_dir."""
    validate_chunk_id(chunk_id)
    resolved_base = base_dir.resolve()
    target = (resolved_base / f"{chunk_id}{suffix}").resolve()
    if target.parent != resolved_base:
        raise ValueError("Path traversal detected for chunk path.")
    return target
