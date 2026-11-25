"""Handles automatic re-replication of under-replicated chunks."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from master.database.db import MetadataDB
from master.services.chunker import compute_sha256
from master.services.node_client import NodeClient, NodeClientError

logger = logging.getLogger("dfs.replicator")


class Replicator:
    """Repairs under-replicated chunks by copying from healthy replicas to online nodes."""

    def __init__(self, db: MetadataDB, node_client: NodeClient, failure_cooldown_seconds: float = 60.0) -> None:
        self.db = db
        self.node_client = node_client
        self.failure_cooldown_seconds = failure_cooldown_seconds
        self._lock = asyncio.Lock()
        self._failed_targets: dict[tuple[str, str], float] = {}

    async def re_replicate_under_replicated_chunks(self) -> dict[str, Any]:
        """Scan for under-replicated chunks and copy them to available online nodes."""
        if self._lock.locked():
            return {"checked": 0, "replicated": 0, "failed": 0, "skipped_busy": True}

        async with self._lock:
            return await self._run_replication_pass()

    async def _run_replication_pass(self) -> dict[str, Any]:
        under_replicated = self.db.get_under_replicated_chunks()
        if not under_replicated:
            return {"checked": 0, "replicated": 0, "failed": 0}

        online_nodes = self.db.list_nodes(status="online")
        online_by_id = {n["node_id"]: n for n in online_nodes}

        replicated_count = 0
        failed_count = 0
        touched_files: set[str] = set()
        now_mono = time.monotonic()

        for item in under_replicated:
            chunk_id = item["chunk_id"]
            file_id = item["file_id"]
            expected_hash = item["sha256_hash"]
            target_factor = int(item["replication_factor"])
            touched_files.add(file_id)

            chunks = self.db.get_file_chunks_with_locations(file_id)
            chunk_meta = next((c for c in chunks if c["chunk_id"] == chunk_id), None)
            if not chunk_meta:
                continue

            locations = chunk_meta["locations"]
            healthy_node_ids = {
                loc["node_id"]
                for loc in locations
                if loc["status"] == "stored" and loc["node_id"] in online_by_id
            }
            needed = target_factor - len(healthy_node_ids)
            if needed <= 0:
                continue

            candidate_targets = [
                n
                for nid, n in online_by_id.items()
                if nid not in healthy_node_ids
                and (
                    (chunk_id, nid) not in self._failed_targets
                    or (now_mono - self._failed_targets[(chunk_id, nid)])
                    >= self.failure_cooldown_seconds
                )
            ]
            if not candidate_targets:
                continue

            # Fetch verified bytes from a healthy source node
            chunk_bytes: bytes | None = None
            for src_id in healthy_node_ids:
                src_node = online_by_id[src_id]
                try:
                    data = await self.node_client.download_chunk(src_node["url"], chunk_id)
                    if compute_sha256(data) == expected_hash:
                        chunk_bytes = data
                        break
                    self.db.update_chunk_location_status(chunk_id, src_id, "corrupted")
                    self.db.log_event(
                        "CHUNK_CORRUPTION_DETECTED",
                        "error",
                        f"Corrupted chunk {chunk_id} detected on {src_id} during re-replication.",
                        {"chunk_id": chunk_id, "node_id": src_id},
                    )
                except NodeClientError:
                    continue

            if chunk_bytes is None:
                failed_count += 1
                continue

            for target in candidate_targets[:needed]:
                target_id = target["node_id"]
                try:
                    resp = await self.node_client.upload_chunk(
                        target["url"], chunk_id, chunk_bytes, expected_hash
                    )
                    if resp.get("sha256_hash") != expected_hash:
                        raise NodeClientError("Target node returned mismatched SHA-256.")
                    self.db.update_chunk_location_status(
                        chunk_id, target_id, "stored", is_primary=False
                    )
                    self._failed_targets.pop((chunk_id, target_id), None)
                    replicated_count += 1
                    self.db.log_event(
                        "REPLICATION_COMPLETED",
                        "info",
                        f"Re-replicated chunk {chunk_id} to {target_id}.",
                        {"chunk_id": chunk_id, "file_id": file_id, "target_node": target_id},
                    )
                except NodeClientError as exc:
                    failed_count += 1
                    self._failed_targets[(chunk_id, target_id)] = now_mono
                    logger.warning("Re-replication failed for %s -> %s: %s", chunk_id, target_id, exc)

        # Refresh file health statuses
        for file_id in touched_files:
            file_rec = self.db.get_file(file_id)
            if not file_rec:
                continue
            if file_rec["replication_status"] == "replicated":
                self.db.update_file_status(file_id, "healthy")
            elif file_rec["replication_status"] == "unavailable":
                self.db.update_file_status(file_id, "failed")
            else:
                self.db.update_file_status(file_id, "degraded")

        return {
            "checked": len(under_replicated),
            "replicated": replicated_count,
            "failed": failed_count,
        }
