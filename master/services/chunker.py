"""File chunking, SHA-256 hashing, and reconstruction utilities."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class ChunkData:
    chunk_id: str
    file_id: str
    chunk_index: int
    chunk_size: int
    sha256_hash: str
    data: bytes


def compute_sha256(data: bytes) -> str:
    """Compute hex SHA-256 hash of a byte buffer."""
    return hashlib.sha256(data).hexdigest()


def split_file_into_chunks(
    data: bytes,
    file_id: str,
    chunk_size: int,
) -> list[ChunkData]:
    """Split raw bytes into ordered ChunkData objects with deterministic IDs and SHA-256."""
    if chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer.")

    if len(data) == 0:
        return []

    chunks: list[ChunkData] = []
    total_len = len(data)
    index = 0
    for offset in range(0, total_len, chunk_size):
        slice_bytes = data[offset : offset + chunk_size]
        chunk_id = f"{file_id}_c{index:05d}"
        chunks.append(
            ChunkData(
                chunk_id=chunk_id,
                file_id=file_id,
                chunk_index=index,
                chunk_size=len(slice_bytes),
                sha256_hash=compute_sha256(slice_bytes),
                data=slice_bytes,
            )
        )
        index += 1
    return chunks


def reconstruct_chunks(ordered_chunks: list[bytes]) -> bytes:
    """Reassemble ordered chunk byte buffers into the original file payload."""
    return b"".join(ordered_chunks)
