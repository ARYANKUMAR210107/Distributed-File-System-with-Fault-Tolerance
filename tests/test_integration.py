"""End-to-end integration tests with Master Node and multiple live Storage Nodes."""

from __future__ import annotations

import hashlib
import os
import socket
import threading
import time
from pathlib import Path

import httpx
import pytest
import uvicorn

from master.app import create_app as create_master_app
from master.config import MasterSettings
from storage_node.app import create_app as create_storage_app
from storage_node.config import StorageNodeSettings


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class ServerHandle:
    """Runs a FastAPI app via uvicorn in a background thread for real HTTP testing."""

    def __init__(self, app, host: str, port: int) -> None:
        self.config = uvicorn.Config(
            app,
            host=host,
            port=port,
            log_level="warning",
            timeout_graceful_shutdown=1,
        )
        self.server = uvicorn.Server(self.config)
        self.thread = threading.Thread(target=self.server.run, daemon=True)
        self.url = f"http://{host}:{port}"

    def start(self) -> None:
        self.thread.start()
        deadline = time.time() + 10.0
        while time.time() < deadline:
            try:
                r = httpx.get(f"{self.url}/health", timeout=1.0)
                if r.status_code == 200:
                    return
            except Exception:
                time.sleep(0.1)
        raise RuntimeError(f"Server at {self.url} failed to start in time.")

    def stop(self) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=5.0)


@pytest.fixture
def dfs_cluster(tmp_path: Path):
    """Spin up 3 Storage Nodes and 1 Master Node in temporary directories."""
    node_ports = [_free_port() for _ in range(3)]
    master_port = _free_port()
    db_path = tmp_path / "dfs_test.db"

    master_settings = MasterSettings(
        master_host="127.0.0.1",
        master_port=master_port,
        database_path=str(db_path),
        default_chunk_size=16_384,  # 16 KB chunks for multi-chunk testing
        default_replication_factor=2,
        health_check_interval_seconds=60,
        node_timeout_seconds=2.0,
        node_failure_threshold=1,
        auto_replicate_on_failure=True,
        enable_background_monitor=False,
    )
    master = ServerHandle(create_master_app(master_settings), "127.0.0.1", master_port)
    master.start()

    nodes: list[ServerHandle] = []
    node_dirs: list[Path] = []
    for idx, port in enumerate(node_ports, start=1):
        sdir = tmp_path / f"node{idx}"
        node_dirs.append(sdir)
        n_settings = StorageNodeSettings(
            node_id=f"node-{idx}",
            node_name=f"Storage Node {idx}",
            node_host="127.0.0.1",
            node_port=port,
            storage_dir=str(sdir),
            master_url=master.url,
            auto_register=False,
        )
        handle = ServerHandle(create_storage_app(n_settings), "127.0.0.1", port)
        handle.start()
        nodes.append(handle)
        reg = httpx.post(
            f"{master.url}/nodes/register",
            json={"node_id": f"node-{idx}", "name": f"Storage Node {idx}", "url": handle.url},
            timeout=20.0,
        )
        assert reg.status_code == 201

    yield {
        "master": master,
        "master_settings": master_settings,
        "nodes": nodes,
        "node_dirs": node_dirs,
        "db_path": db_path,
    }

    for n in nodes:
        n.stop()
    master.stop()


def test_full_lifecycle_replication_failover_corruption_and_restart(dfs_cluster):
    master_url = dfs_cluster["master"].url
    nodes: list[ServerHandle] = dfs_cluster["nodes"]
    node_dirs: list[Path] = dfs_cluster["node_dirs"]

    # 1. Upload a 50 KB binary file (4 chunks at 16 KB)
    payload = os.urandom(50_000)
    expected_sha = hashlib.sha256(payload).hexdigest()

    up = httpx.post(
        f"{master_url}/upload",
        files={"file": ("../../etc/sample.bin", payload, "application/octet-stream")},
        timeout=10.0,
    )
    assert up.status_code == 201
    up_data = up.json()
    file_id = up_data["file_id"]
    assert up_data["filename"] == "sample.bin"  # sanitized
    assert up_data["total_chunks"] == 4
    assert up_data["sha256_hash"] == expected_sha
    assert up_data["status"] == "healthy"
    assert up_data["replication_status"] == "replicated"

    # 2. Verify distribution & integrity endpoints
    dist = httpx.get(f"{master_url}/files/{file_id}/distribution", timeout=5.0)
    assert dist.status_code == 200
    assert len(dist.json()["distribution"]) == 4

    integ = httpx.get(f"{master_url}/files/{file_id}/integrity", timeout=5.0)
    assert integ.status_code == 200
    assert integ.json()["overall_status"] == "healthy"

    # 3. Download and verify byte-for-byte match
    dl = httpx.get(f"{master_url}/files/{file_id}/download", timeout=10.0)
    assert dl.status_code == 200
    assert dl.content == payload

    # 4. Simulate Node 1 going offline -> check health -> trigger re-replication -> download via failover
    nodes[0].stop()
    h1 = httpx.get(f"{master_url}/nodes/node-1/health", timeout=5.0)
    assert h1.status_code == 200
    assert h1.json()["status"] == "offline"

    # Re-replicate under-replicated chunks to remaining online nodes (node-2, node-3)
    rep = httpx.post(f"{master_url}/system/re-replicate", timeout=10.0)
    assert rep.status_code == 200
    assert rep.json()["replicated"] > 0

    # Download still succeeds seamlessly
    dl2 = httpx.get(f"{master_url}/files/{file_id}/download", timeout=10.0)
    assert dl2.status_code == 200
    assert dl2.content == payload

    # 5. Simulate chunk corruption on node-2 for chunk 0 -> download detects & fails over to node-3
    corrupt_target = node_dirs[1] / f"{file_id}_c00000.bin"
    if corrupt_target.exists():
        corrupt_target.write_bytes(b"CORRUPTED_BYTES")
        dl3 = httpx.get(f"{master_url}/files/{file_id}/download", timeout=10.0)
        assert dl3.status_code == 200
        assert dl3.content == payload

    # 6. Restart Master Node and verify metadata persistence
    dfs_cluster["master"].stop()
    restarted_master = ServerHandle(
        create_master_app(dfs_cluster["master_settings"]),
        "127.0.0.1",
        dfs_cluster["master_settings"].master_port,
    )
    restarted_master.start()
    dfs_cluster["master"] = restarted_master

    files_after = httpx.get(f"{restarted_master.url}/files", timeout=5.0)
    assert files_after.status_code == 200
    assert any(f["file_id"] == file_id for f in files_after.json())

    dl4 = httpx.get(f"{restarted_master.url}/files/{file_id}/download", timeout=10.0)
    assert dl4.status_code == 200
    assert dl4.content == payload

    # 7. Delete file and verify cleanup
    delete_resp = httpx.delete(f"{restarted_master.url}/files/{file_id}", timeout=20.0)
    assert delete_resp.status_code == 200
    assert delete_resp.json()["deleted"] is True

    missing = httpx.get(f"{restarted_master.url}/files/{file_id}", timeout=5.0)
    assert missing.status_code == 404
