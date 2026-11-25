"""Tests for an independent Storage Node instance."""

import hashlib
import pytest
from httpx import ASGITransport, AsyncClient

from storage_node.app import create_app
from storage_node.config import StorageNodeSettings


@pytest.mark.asyncio
async def test_storage_node_crud_and_security(tmp_path):
    settings = StorageNodeSettings(
        node_id="test-node-1",
        node_name="Test Node 1",
        storage_dir=str(tmp_path / "node1"),
        auto_register=False,
    )
    app = create_app(settings)

    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            health = await client.get("/health")
            assert health.status_code == 200
            assert health.json()["status"] == "healthy"

            payload = b"distributed-chunk-payload-12345"
            digest = hashlib.sha256(payload).hexdigest()

            # Upload chunk
            up = await client.post(
                "/chunks",
                data={"chunk_id": "file1_c00000", "sha256_hash": digest},
                files={"file": ("chunk.bin", payload, "application/octet-stream")},
            )
            assert up.status_code == 201
            assert up.json()["sha256_hash"] == digest

            # Checksum mismatch rejected
            bad_up = await client.post(
                "/chunks",
                data={"chunk_id": "file1_c00001", "sha256_hash": "0" * 64},
                files={"file": ("chunk.bin", payload, "application/octet-stream")},
            )
            assert bad_up.status_code == 400

            # Path traversal rejected
            trav = await client.get("/chunks/..%2Fetc%2Fpasswd")
            assert trav.status_code in (400, 404)

            # Download chunk
            dl = await client.get("/chunks/file1_c00000")
            assert dl.status_code == 200
            assert dl.content == payload
            assert dl.headers["X-Chunk-SHA256"] == digest

            # List & stats
            listing = await client.get("/chunks")
            assert listing.status_code == 200
            assert listing.json()["chunk_count"] == 1

            stats = await client.get("/stats")
            assert stats.status_code == 200
            assert stats.json()["chunk_count"] == 1
            assert stats.json()["chunks_used_bytes"] == len(payload)

            # Delete chunk
            del_resp = await client.delete("/chunks/file1_c00000")
            assert del_resp.status_code == 200
            assert del_resp.json()["deleted"] is True

            missing = await client.get("/chunks/file1_c00000")
            assert missing.status_code == 404
