"""Disk-backed chunk store with atomic writes and SHA-256 verification."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from storage_node.utils.security import safe_chunk_path, validate_chunk_id


class ChunkStore:
    """Manages reading, writing, deleting, and inspecting chunks on local disk."""

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def compute_sha256(data: bytes) -> str:
        """Return hex SHA-256 digest for raw chunk bytes."""
        return hashlib.sha256(data).hexdigest()

    def save_chunk(
        self,
        chunk_id: str,
        data: bytes,
        expected_sha256: str | None = None,
    ) -> dict:
        """Persist a chunk atomically and verify its SHA-256 if provided."""
        validate_chunk_id(chunk_id)
        actual_hash = self.compute_sha256(data)
        if expected_sha256 and actual_hash != expected_sha256:
            raise ValueError(
                f"Checksum mismatch for chunk {chunk_id}: "
                f"expected {expected_sha256}, got {actual_hash}"
            )

        data_path = safe_chunk_path(self.base_dir, chunk_id, ".bin")
        meta_path = safe_chunk_path(self.base_dir, chunk_id, ".meta.json")
        tmp_data_path = safe_chunk_path(self.base_dir, f"{chunk_id}_tmp", ".bin")

        tmp_data_path.write_bytes(data)
        os.replace(tmp_data_path, data_path)

        stored_at = datetime.now(timezone.utc).isoformat()
        metadata = {
            "chunk_id": chunk_id,
            "size_bytes": len(data),
            "sha256_hash": actual_hash,
            "stored_at": stored_at,
        }
        tmp_meta_path = safe_chunk_path(self.base_dir, f"{chunk_id}_tmp", ".meta.json")
        tmp_meta_path.write_text(json.dumps(metadata), encoding="utf-8")
        os.replace(tmp_meta_path, meta_path)

        return metadata

    def get_chunk(self, chunk_id: str) -> tuple[bytes, str]:
        """Load chunk bytes and return (data, actual_sha256)."""
        data_path = safe_chunk_path(self.base_dir, chunk_id, ".bin")
        if not data_path.is_file():
            raise FileNotFoundError(f"Chunk {chunk_id} not found on this node.")
        data = data_path.read_bytes()
        return data, self.compute_sha256(data)

    def delete_chunk(self, chunk_id: str) -> bool:
        """Delete a chunk and its sidecar metadata if they exist."""
        data_path = safe_chunk_path(self.base_dir, chunk_id, ".bin")
        meta_path = safe_chunk_path(self.base_dir, chunk_id, ".meta.json")
        existed = False
        if data_path.exists():
            data_path.unlink()
            existed = True
        if meta_path.exists():
            meta_path.unlink()
        return existed

    def list_chunks(self) -> list[dict]:
        """Return metadata for all chunks currently stored on this node."""
        items: list[dict] = []
        for bin_file in sorted(self.base_dir.glob("*.bin")):
            if bin_file.stem.endswith("_tmp"):
                continue
            chunk_id = bin_file.stem
            meta_path = self.base_dir / f"{chunk_id}.meta.json"
            if meta_path.is_file():
                try:
                    items.append(json.loads(meta_path.read_text(encoding="utf-8")))
                    continue
                except json.JSONDecodeError:
                    pass
            raw = bin_file.read_bytes()
            items.append(
                {
                    "chunk_id": chunk_id,
                    "size_bytes": len(raw),
                    "sha256_hash": self.compute_sha256(raw),
                    "stored_at": datetime.fromtimestamp(
                        bin_file.stat().st_mtime, tz=timezone.utc
                    ).isoformat(),
                }
            )
        return items

    def get_disk_stats(self) -> dict:
        """Return disk capacity and chunk storage usage."""
        usage = shutil.disk_usage(self.base_dir)
        chunks = self.list_chunks()
        chunks_used_bytes = sum(c["size_bytes"] for c in chunks)
        return {
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "free_bytes": usage.free,
            "chunks_used_bytes": chunks_used_bytes,
            "chunk_count": len(chunks),
        }
