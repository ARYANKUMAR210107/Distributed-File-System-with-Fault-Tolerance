"""File upload, download, integrity verification, distribution, and deletion."""

from __future__ import annotations

import uuid
from typing import Any

from master.database.db import MetadataDB, utc_now_iso
from master.services.chunker import (
    compute_sha256,
    reconstruct_chunks,
    split_file_into_chunks,
)
from master.services.distributor import RoundRobinDistributor
from master.services.node_client import NodeClient, NodeClientError
from master.utils.security import sanitize_filename


class FileOperationError(Exception):
    """Base error for file operations."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


class FileService:
    """Coordinates distributed file lifecycle across Master and Storage Nodes."""

    def __init__(
        self,
        db: MetadataDB,
        node_client: NodeClient,
        distributor: RoundRobinDistributor,
    ) -> None:
        self.db = db
        self.node_client = node_client
        self.distributor = distributor

    def _get_runtime_config(self) -> tuple[int, int, int]:
        settings = self.db.get_settings()
        chunk_size = int(settings.get("chunk_size", 1048576))
        replication_factor = int(settings.get("replication_factor", 2))
        max_upload_mb = int(settings.get("max_upload_size_mb", 200))
        return chunk_size, replication_factor, max_upload_mb

    async def upload_file(
        self,
        raw_filename: str,
        content_type: str,
        data: bytes,
    ) -> dict[str, Any]:
        """Split, hash, distribute, replicate, verify, and persist an uploaded file."""
        try:
            filename = sanitize_filename(raw_filename)
        except ValueError as exc:
            raise FileOperationError(str(exc), status_code=400) from exc

        chunk_size, replication_factor, max_upload_mb = self._get_runtime_config()
        max_bytes = max_upload_mb * 1024 * 1024
        if len(data) > max_bytes:
            raise FileOperationError(
                f"File exceeds maximum allowed upload size of {max_upload_mb} MB.",
                status_code=413,
            )

        online_nodes = self.db.list_nodes(status="online")
        if len(data) > 0 and not online_nodes:
            raise FileOperationError(
                "No online Storage Nodes are available to store file chunks.",
                status_code=503,
            )

        file_id = f"file_{uuid.uuid4().hex[:12]}"
        file_hash = compute_sha256(data)
        chunks = split_file_into_chunks(data, file_id=file_id, chunk_size=chunk_size)

        warnings: list[str] = []
        if len(data) > 0 and len(online_nodes) < replication_factor:
            warnings.append(
                f"Requested replication factor {replication_factor}, "
                f"but only {len(online_nodes)} online node(s) available."
            )

        uploaded_pairs: list[tuple[str, str]] = []  # (node_url, chunk_id) for rollback
        chunk_records: list[dict[str, Any]] = []
        location_records: list[dict[str, Any]] = []
        under_replicated = False

        for chunk in chunks:
            selected_nodes = self.distributor.select_nodes_for_chunk(
                online_nodes, replication_factor
            )
            chunk_records.append(
                {
                    "chunk_id": chunk.chunk_id,
                    "file_id": file_id,
                    "chunk_index": chunk.chunk_index,
                    "chunk_size": chunk.chunk_size,
                    "sha256_hash": chunk.sha256_hash,
                }
            )

            stored_on_count = 0
            for idx, node in enumerate(selected_nodes):
                is_primary = idx == 0
                try:
                    resp = await self.node_client.upload_chunk(
                        node["url"], chunk.chunk_id, chunk.data, chunk.sha256_hash
                    )
                    if resp.get("sha256_hash") != chunk.sha256_hash:
                        raise NodeClientError("Checksum verification failed after upload.")
                    uploaded_pairs.append((node["url"], chunk.chunk_id))
                    location_records.append(
                        {
                            "chunk_id": chunk.chunk_id,
                            "node_id": node["node_id"],
                            "is_primary": is_primary,
                            "status": "stored",
                            "verified_at": utc_now_iso(),
                        }
                    )
                    stored_on_count += 1
                except NodeClientError as exc:
                    warnings.append(
                        f"Chunk {chunk.chunk_index} failed to store on {node['node_id']}: {exc}"
                    )

            if stored_on_count == 0:
                # Rollback all chunks uploaded so far
                for node_url, cid in uploaded_pairs:
                    try:
                        await self.node_client.delete_chunk(node_url, cid)
                    except NodeClientError:
                        pass
                self.db.log_event(
                    "UPLOAD_FAILED",
                    "error",
                    f"Upload failed for {filename}: chunk {chunk.chunk_index} could not be stored on any node.",
                    {"filename": filename, "chunk_id": chunk.chunk_id},
                )
                raise FileOperationError(
                    f"Failed to store chunk {chunk.chunk_index} on any Storage Node.",
                    status_code=502,
                )

            if stored_on_count < replication_factor:
                under_replicated = True

        file_status = "degraded" if under_replicated else "healthy"
        rep_status = "under_replicated" if under_replicated else "replicated"
        file_record = {
            "file_id": file_id,
            "filename": filename,
            "content_type": content_type or "application/octet-stream",
            "file_size": len(data),
            "sha256_hash": file_hash,
            "chunk_size": chunk_size,
            "total_chunks": len(chunks),
            "replication_factor": replication_factor,
            "status": file_status,
            "created_at": utc_now_iso(),
        }

        self.db.create_file_with_chunks(file_record, chunk_records, location_records)
        self.db.log_event(
            "FILE_UPLOADED",
            "warning" if under_replicated else "info",
            f"Uploaded {filename} ({len(data)} bytes, {len(chunks)} chunks, status={file_status}).",
            {"file_id": file_id, "filename": filename, "chunks": len(chunks)},
        )

        return {
            "file_id": file_id,
            "filename": filename,
            "file_size": len(data),
            "sha256_hash": file_hash,
            "chunk_size": chunk_size,
            "total_chunks": len(chunks),
            "replication_factor": replication_factor,
            "status": file_status,
            "replication_status": rep_status,
            "integrity_verified": True,
            "warnings": warnings,
        }

    async def download_file(self, file_id: str) -> tuple[dict[str, Any], bytes]:
        """Reconstruct a file from healthy chunk replicas and verify SHA-256."""
        file_rec = self.db.get_file(file_id)
        if not file_rec:
            raise FileOperationError(f"File {file_id} not found.", status_code=404)

        chunks = self.db.get_file_chunks_with_locations(file_id)
        if len(chunks) != file_rec["total_chunks"]:
            raise FileOperationError(
                "Metadata mismatch: missing chunk records.", status_code=500
            )

        ordered_buffers: list[bytes] = []
        for chunk in chunks:
            chunk_id = chunk["chunk_id"]
            expected_hash = chunk["sha256_hash"]
            locations = chunk["locations"]

            # Prioritize online nodes with 'stored' status, primary first
            candidates = sorted(
                locations,
                key=lambda l: (
                    0 if (l["node_status"] == "online" and l["status"] == "stored") else 1,
                    0 if l["is_primary"] else 1,
                ),
            )

            chunk_bytes: bytes | None = None
            for loc in candidates:
                node_id = loc["node_id"]
                node_url = loc["node_url"]
                try:
                    raw = await self.node_client.download_chunk(node_url, chunk_id)
                    if compute_sha256(raw) != expected_hash:
                        self.db.update_chunk_location_status(chunk_id, node_id, "corrupted")
                        self.db.log_event(
                            "CHUNK_CORRUPTION_DETECTED",
                            "error",
                            f"Corrupted chunk {chunk_id} detected on {node_id} during download; failing over.",
                            {"file_id": file_id, "chunk_id": chunk_id, "node_id": node_id},
                        )
                        continue
                    chunk_bytes = raw
                    break
                except NodeClientError as exc:
                    self.db.log_event(
                        "REPLICA_FAILOVER",
                        "warning",
                        f"Node {node_id} failed for chunk {chunk_id}; trying next replica.",
                        {"file_id": file_id, "chunk_id": chunk_id, "node_id": node_id, "error": str(exc)},
                    )
                    continue

            if chunk_bytes is None:
                self.db.log_event(
                    "DOWNLOAD_FAILED",
                    "error",
                    f"Download failed for {file_rec['filename']}: chunk {chunk['chunk_index']} unavailable.",
                    {"file_id": file_id, "chunk_id": chunk_id},
                )
                raise FileOperationError(
                    f"Cannot reconstruct {file_rec['filename']}: chunk {chunk['chunk_index']} "
                    f"({chunk_id}) is unavailable or corrupted on all nodes.",
                    status_code=503,
                )
            ordered_buffers.append(chunk_bytes)

        reconstructed = reconstruct_chunks(ordered_buffers)
        if compute_sha256(reconstructed) != file_rec["sha256_hash"]:
            self.db.log_event(
                "INTEGRITY_MISMATCH",
                "error",
                f"Full-file SHA-256 verification failed for {file_rec['filename']}.",
                {"file_id": file_id},
            )
            raise FileOperationError(
                "Reconstructed file failed full-file SHA-256 integrity verification.",
                status_code=500,
            )

        self.db.log_event(
            "FILE_DOWNLOADED",
            "info",
            f"Downloaded and verified {file_rec['filename']} ({len(reconstructed)} bytes).",
            {"file_id": file_id},
        )
        return file_rec, reconstructed

    async def delete_file(self, file_id: str) -> dict[str, Any]:
        """Delete file chunks from all Storage Nodes and remove metadata."""
        file_rec = self.db.get_file(file_id)
        if not file_rec:
            raise FileOperationError(f"File {file_id} not found.", status_code=404)

        chunks = self.db.get_file_chunks_with_locations(file_id)
        removed = 0
        failed_deletions: list[dict[str, str]] = []

        async def _delete_one(chunk_id: str, node_id: str, node_url: str) -> tuple[bool, dict[str, str] | None]:
            try:
                await self.node_client.delete_chunk(node_url, chunk_id)
                return True, None
            except NodeClientError as exc:
                return False, {"chunk_id": chunk_id, "node_id": node_id, "error": str(exc)}

        import asyncio
        tasks = [
            _delete_one(chunk["chunk_id"], loc["node_id"], loc["node_url"])
            for chunk in chunks
            for loc in chunk["locations"]
        ]
        results = await asyncio.gather(*tasks)
        for ok, err in results:
            if ok:
                removed += 1
            elif err:
                failed_deletions.append(err)

        self.db.delete_file_record(file_id)
        severity = "warning" if failed_deletions else "info"
        self.db.log_event(
            "FILE_DELETED",
            severity,
            f"Deleted {file_rec['filename']} ({removed} chunk copies removed, {len(failed_deletions)} failed).",
            {"file_id": file_id, "failed_deletions": failed_deletions},
        )

        return {
            "file_id": file_id,
            "filename": file_rec["filename"],
            "deleted": True,
            "chunks_removed": removed,
            "failed_deletions": failed_deletions,
        }

    async def verify_file_integrity(self, file_id: str) -> dict[str, Any]:
        """Actively fetch and verify every chunk copy across Storage Nodes."""
        file_rec = self.db.get_file(file_id)
        if not file_rec:
            raise FileOperationError(f"File {file_id} not found.", status_code=404)

        chunks = self.db.get_file_chunks_with_locations(file_id)
        chunk_results: list[dict[str, Any]] = []
        healthy_chunks = 0

        for chunk in chunks:
            chunk_id = chunk["chunk_id"]
            expected_hash = chunk["sha256_hash"]
            healthy_rep = 0
            corrupted_rep = 0
            missing_rep = 0
            offline_rep = 0
            details: list[dict[str, Any]] = []

            for loc in chunk["locations"]:
                node_id = loc["node_id"]
                node_url = loc["node_url"]
                try:
                    raw = await self.node_client.download_chunk(node_url, chunk_id)
                    actual_hash = compute_sha256(raw)
                    if actual_hash == expected_hash:
                        healthy_rep += 1
                        self.db.update_chunk_location_status(chunk_id, node_id, "stored")
                        details.append({"node_id": node_id, "status": "verified"})
                    else:
                        corrupted_rep += 1
                        self.db.update_chunk_location_status(chunk_id, node_id, "corrupted")
                        details.append(
                            {
                                "node_id": node_id,
                                "status": "corrupted",
                                "actual_sha256": actual_hash,
                            }
                        )
                except NodeClientError as exc:
                    err_str = str(exc)
                    if "404" in err_str:
                        missing_rep += 1
                        self.db.update_chunk_location_status(chunk_id, node_id, "missing")
                        details.append({"node_id": node_id, "status": "missing"})
                    else:
                        offline_rep += 1
                        details.append({"node_id": node_id, "status": "unreachable"})

            if healthy_rep > 0:
                healthy_chunks += 1
                chunk_status = (
                    "healthy"
                    if corrupted_rep == 0 and missing_rep == 0 and offline_rep == 0
                    else "degraded"
                )
            else:
                chunk_status = "unavailable"

            chunk_results.append(
                {
                    "chunk_id": chunk_id,
                    "chunk_index": chunk["chunk_index"],
                    "expected_sha256": expected_hash,
                    "healthy_replicas": healthy_rep,
                    "corrupted_replicas": corrupted_rep,
                    "missing_replicas": missing_rep,
                    "offline_replicas": offline_rep,
                    "status": chunk_status,
                    "details": details,
                }
            )

        if healthy_chunks < len(chunks):
            overall = "failed"
        elif any(c["status"] != "healthy" for c in chunk_results):
            overall = "degraded"
        else:
            overall = "healthy"

        return {
            "file_id": file_id,
            "filename": file_rec["filename"],
            "overall_status": overall,
            "total_chunks": len(chunks),
            "healthy_chunks": healthy_chunks,
            "chunks": chunk_results,
        }

    def get_file_distribution(self, file_id: str) -> dict[str, Any]:
        """Return structured primary/replica distribution per chunk for visualization."""
        file_rec = self.db.get_file(file_id)
        if not file_rec:
            raise FileOperationError(f"File {file_id} not found.", status_code=404)

        chunks = self.db.get_file_chunks_with_locations(file_id)
        distribution: list[dict[str, Any]] = []
        for chunk in chunks:
            primary = None
            replicas = []
            for loc in chunk["locations"]:
                node_entry = {
                    "node_id": loc["node_id"],
                    "node_name": loc["node_name"],
                    "node_status": loc["node_status"],
                    "chunk_status": loc["status"],
                }
                if loc["is_primary"] and primary is None:
                    primary = node_entry
                else:
                    replicas.append(node_entry)
            distribution.append(
                {
                    "chunk_id": chunk["chunk_id"],
                    "chunk_index": chunk["chunk_index"],
                    "chunk_size": chunk["chunk_size"],
                    "sha256_hash": chunk["sha256_hash"],
                    "primary_node": primary,
                    "replica_nodes": replicas,
                }
            )

        return {
            "file_id": file_id,
            "filename": file_rec["filename"],
            "total_chunks": file_rec["total_chunks"],
            "replication_factor": file_rec["replication_factor"],
            "distribution": distribution,
        }
