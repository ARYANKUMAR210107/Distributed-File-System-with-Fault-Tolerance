"""Tests for node degraded/offline transitions, atomic state updates, and replicator locking."""

import asyncio
from pathlib import Path
import pytest

from master.database.db import MetadataDB, utc_now_iso
from master.monitoring.health_monitor import HealthMonitor
from master.replication.replicator import Replicator
from master.services.node_client import NodeClient


class DummyFailClient(NodeClient):
    async def check_health(self, node_url: str):
        raise OSError("Simulated connection timeout")


class DummyRecoverClient(NodeClient):
    async def check_health(self, node_url: str):
        return {"status": "healthy", "uptime_seconds": 42.0}, 12.5

    async def get_stats(self, node_url: str):
        return {
            "total_bytes": 1000,
            "used_bytes": 200,
            "free_bytes": 800,
            "chunks_used_bytes": 0,
            "chunk_count": 0,
        }


@pytest.mark.asyncio
async def test_degraded_before_offline_and_recovery(tmp_path: Path):
    db = MetadataDB(tmp_path / "monitor.db")
    db.upsert_node("node-1", "Node 1", "http://127.0.0.1:9991")

    replicator = Replicator(db=db, node_client=DummyFailClient())
    monitor = HealthMonitor(
        db=db,
        node_client=DummyFailClient(),
        replicator=replicator,
        failure_threshold=3,
        auto_replicate=False,
    )

    node = db.get_node("node-1")
    r1 = await monitor.check_single_node(node)
    assert r1["status"] == "degraded"
    assert r1["transitioned_offline"] is False

    r2 = await monitor.check_single_node(db.get_node("node-1"))
    assert r2["status"] == "degraded"

    r3 = await monitor.check_single_node(db.get_node("node-1"))
    assert r3["status"] == "offline"
    assert r3["transitioned_offline"] is True

    # Fourth failure stays offline and does not emit duplicate NODE_OFFLINE
    r4 = await monitor.check_single_node(db.get_node("node-1"))
    assert r4["status"] == "offline"
    assert r4["transitioned_offline"] is False

    events = db.list_events(limit=20)
    offline_events = [e for e in events if e["event_type"] == "NODE_OFFLINE"]
    degraded_events = [e for e in events if e["event_type"] == "NODE_DEGRADED"]
    assert len(degraded_events) == 1
    assert len(offline_events) == 1

    # Recovery transitions back to online with a single NODE_RECOVERED event
    monitor.node_client = DummyRecoverClient()
    rec = await monitor.check_single_node(db.get_node("node-1"))
    assert rec["status"] == "online"
    assert rec["response_time_ms"] == 12.5
    recovered_events = [e for e in db.list_events(limit=20) if e["event_type"] == "NODE_RECOVERED"]
    assert len(recovered_events) == 1
    db.close()


@pytest.mark.asyncio
async def test_node_primary_and_replica_counts(tmp_path: Path):
    db = MetadataDB(tmp_path / "counts.db")
    db.upsert_node("node-1", "Node 1", "http://127.0.0.1:9001")
    db.upsert_node("node-2", "Node 2", "http://127.0.0.1:9002")

    db.create_file_with_chunks(
        {
            "file_id": "f1",
            "filename": "a.bin",
            "content_type": "application/octet-stream",
            "file_size": 100,
            "sha256_hash": "a" * 64,
            "chunk_size": 100,
            "total_chunks": 1,
            "replication_factor": 2,
            "status": "healthy",
            "created_at": utc_now_iso(),
        },
        [{"chunk_id": "f1_c0", "file_id": "f1", "chunk_index": 0, "chunk_size": 100, "sha256_hash": "a" * 64}],
        [
            {"chunk_id": "f1_c0", "node_id": "node-1", "is_primary": True, "status": "stored"},
            {"chunk_id": "f1_c0", "node_id": "node-2", "is_primary": False, "status": "stored"},
        ],
    )
    n1 = db.get_node("node-1")
    n2 = db.get_node("node-2")
    assert n1["primary_count"] == 1 and n1["replica_count"] == 0
    assert n2["primary_count"] == 0 and n2["replica_count"] == 1
    db.close()
