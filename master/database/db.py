"""Thread-safe SQLite metadata repository for the Master Node."""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


class MetadataDB:
    """Manages SQLite persistence for nodes, files, chunks, locations, events, and settings."""

    def __init__(self, db_path: str | Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(
            str(self.db_path),
            check_same_thread=False,
            isolation_level=None,
        )
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            cur = self._conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL;")
            cur.execute("PRAGMA foreign_keys=ON;")
            cur.executescript(
                """
                CREATE TABLE IF NOT EXISTS storage_nodes (
                    node_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    url TEXT NOT NULL UNIQUE,
                    status TEXT NOT NULL DEFAULT 'online',
                    total_bytes INTEGER NOT NULL DEFAULT 0,
                    used_bytes INTEGER NOT NULL DEFAULT 0,
                    free_bytes INTEGER NOT NULL DEFAULT 0,
                    chunks_used_bytes INTEGER NOT NULL DEFAULT 0,
                    chunk_count INTEGER NOT NULL DEFAULT 0,
                    response_time_ms REAL,
                    uptime_seconds REAL,
                    consecutive_failures INTEGER NOT NULL DEFAULT 0,
                    last_heartbeat TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS files (
                    file_id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    sha256_hash TEXT NOT NULL,
                    chunk_size INTEGER NOT NULL,
                    total_chunks INTEGER NOT NULL,
                    replication_factor INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'healthy',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS chunks (
                    chunk_id TEXT PRIMARY KEY,
                    file_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    chunk_size INTEGER NOT NULL,
                    sha256_hash TEXT NOT NULL,
                    FOREIGN KEY (file_id) REFERENCES files(file_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS chunk_locations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chunk_id TEXT NOT NULL,
                    node_id TEXT NOT NULL,
                    is_primary INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'stored',
                    verified_at TEXT,
                    UNIQUE(chunk_id, node_id),
                    FOREIGN KEY (chunk_id) REFERENCES chunks(chunk_id) ON DELETE CASCADE,
                    FOREIGN KEY (node_id) REFERENCES storage_nodes(node_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS system_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    message TEXT NOT NULL,
                    details_json TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id);
                CREATE INDEX IF NOT EXISTS idx_chunk_locations_chunk_id ON chunk_locations(chunk_id);
                CREATE INDEX IF NOT EXISTS idx_chunk_locations_node_id ON chunk_locations(node_id);
                CREATE INDEX IF NOT EXISTS idx_events_created_at ON system_events(created_at);
                """
            )

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # ── Settings ─────────────────────────────────────────────────────────────

    def init_default_settings(self, defaults: dict[str, str]) -> None:
        with self._lock:
            for key, val in defaults.items():
                self._conn.execute(
                    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                    (key, str(val)),
                )

    def get_settings(self) -> dict[str, str]:
        with self._lock:
            rows = self._conn.execute("SELECT key, value FROM settings").fetchall()
            return {r["key"]: r["value"] for r in rows}

    def update_settings(self, updates: dict[str, str]) -> None:
        with self._lock:
            for key, val in updates.items():
                self._conn.execute(
                    """
                    INSERT INTO settings (key, value) VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    """,
                    (key, str(val)),
                )

    # ── Storage Nodes ────────────────────────────────────────────────────────

    def upsert_node(self, node_id: str, name: str, url: str) -> dict[str, Any]:
        now = utc_now_iso()
        with self._lock:
            existing = self._conn.execute(
                "SELECT * FROM storage_nodes WHERE node_id = ?", (node_id,)
            ).fetchone()
            if existing:
                self._conn.execute(
                    """
                    UPDATE storage_nodes
                    SET name = ?, url = ?, status = 'online', consecutive_failures = 0, last_heartbeat = ?
                    WHERE node_id = ?
                    """,
                    (name, url, now, node_id),
                )
            else:
                self._conn.execute(
                    """
                    INSERT INTO storage_nodes (
                        node_id, name, url, status, consecutive_failures, last_heartbeat, created_at
                    ) VALUES (?, ?, ?, 'online', 0, ?, ?)
                    """,
                    (node_id, name, url, now, now),
                )
            return self.get_node(node_id)  # type: ignore[return-value]

    def _attach_node_replica_counts(self, node_dict: dict[str, Any]) -> dict[str, Any]:
        row = self._conn.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN is_primary = 1 THEN 1 ELSE 0 END), 0) AS primary_count,
                COALESCE(SUM(CASE WHEN is_primary = 0 THEN 1 ELSE 0 END), 0) AS replica_count
            FROM chunk_locations
            WHERE node_id = ? AND status = 'stored'
            """,
            (node_dict["node_id"],),
        ).fetchone()
        node_dict["primary_count"] = int(row["primary_count"]) if row else 0
        node_dict["replica_count"] = int(row["replica_count"]) if row else 0
        return node_dict

    def get_node(self, node_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM storage_nodes WHERE node_id = ?", (node_id,)
            ).fetchone()
            return self._attach_node_replica_counts(dict(row)) if row else None

    def list_nodes(self, status: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            if status:
                rows = self._conn.execute(
                    "SELECT * FROM storage_nodes WHERE status = ? ORDER BY node_id",
                    (status,),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT * FROM storage_nodes ORDER BY node_id"
                ).fetchall()
            return [self._attach_node_replica_counts(dict(r)) for r in rows]

    def update_node_health_success(
        self,
        node_id: str,
        response_time_ms: float,
        uptime_seconds: float | None,
        stats: dict[str, Any] | None = None,
    ) -> str:
        """Atomically mark node online and return its previous status."""
        now = utc_now_iso()
        with self._lock:
            prev_row = self._conn.execute(
                "SELECT status FROM storage_nodes WHERE node_id = ?", (node_id,)
            ).fetchone()
            prev_status = prev_row["status"] if prev_row else "online"
            if stats:
                self._conn.execute(
                    """
                    UPDATE storage_nodes
                    SET status = 'online',
                        consecutive_failures = 0,
                        response_time_ms = ?,
                        uptime_seconds = ?,
                        total_bytes = ?,
                        used_bytes = ?,
                        free_bytes = ?,
                        chunks_used_bytes = ?,
                        chunk_count = ?,
                        last_heartbeat = ?
                    WHERE node_id = ?
                    """,
                    (
                        response_time_ms,
                        uptime_seconds,
                        stats.get("total_bytes", 0),
                        stats.get("used_bytes", 0),
                        stats.get("free_bytes", 0),
                        stats.get("chunks_used_bytes", 0),
                        stats.get("chunk_count", 0),
                        now,
                        node_id,
                    ),
                )
            else:
                self._conn.execute(
                    """
                    UPDATE storage_nodes
                    SET status = 'online',
                        consecutive_failures = 0,
                        response_time_ms = ?,
                        uptime_seconds = ?,
                        last_heartbeat = ?
                    WHERE node_id = ?
                    """,
                    (response_time_ms, uptime_seconds, now, node_id),
                )
            return prev_status

    def record_node_failure(
        self, node_id: str, failure_threshold: int
    ) -> tuple[int, str, str]:
        """Increment failure count and return (consecutive_failures, prev_status, new_status)."""
        with self._lock:
            row = self._conn.execute(
                "SELECT consecutive_failures, status FROM storage_nodes WHERE node_id = ?",
                (node_id,),
            ).fetchone()
            if not row:
                return 0, "offline", "offline"
            prev_status = str(row["status"])
            failures = int(row["consecutive_failures"]) + 1
            if failures >= failure_threshold:
                new_status = "offline"
            else:
                new_status = "degraded"
            self._conn.execute(
                """
                UPDATE storage_nodes
                SET consecutive_failures = ?, status = ?, response_time_ms = NULL
                WHERE node_id = ?
                """,
                (failures, new_status, node_id),
            )
            return failures, prev_status, new_status

    # ── Files & Chunks ───────────────────────────────────────────────────────

    def create_file_with_chunks(
        self,
        file_record: dict[str, Any],
        chunks: list[dict[str, Any]],
        locations: list[dict[str, Any]],
    ) -> None:
        with self._lock:
            self._conn.execute("BEGIN")
            try:
                self._conn.execute(
                    """
                    INSERT INTO files (
                        file_id, filename, content_type, file_size, sha256_hash,
                        chunk_size, total_chunks, replication_factor, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        file_record["file_id"],
                        file_record["filename"],
                        file_record["content_type"],
                        file_record["file_size"],
                        file_record["sha256_hash"],
                        file_record["chunk_size"],
                        file_record["total_chunks"],
                        file_record["replication_factor"],
                        file_record["status"],
                        file_record["created_at"],
                    ),
                )
                for chunk in chunks:
                    self._conn.execute(
                        """
                        INSERT INTO chunks (chunk_id, file_id, chunk_index, chunk_size, sha256_hash)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            chunk["chunk_id"],
                            chunk["file_id"],
                            chunk["chunk_index"],
                            chunk["chunk_size"],
                            chunk["sha256_hash"],
                        ),
                    )
                for loc in locations:
                    self._conn.execute(
                        """
                        INSERT INTO chunk_locations (chunk_id, node_id, is_primary, status, verified_at)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            loc["chunk_id"],
                            loc["node_id"],
                            1 if loc["is_primary"] else 0,
                            loc["status"],
                            loc.get("verified_at"),
                        ),
                    )
                self._conn.execute("COMMIT")
            except Exception:
                self._conn.execute("ROLLBACK")
                raise

    def list_files(self, search: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            query = "SELECT * FROM files WHERE 1=1"
            params: list[Any] = []
            if search:
                query += " AND (LOWER(filename) LIKE ? OR LOWER(file_id) LIKE ?)"
                like = f"%{search.lower()}%"
                params.extend([like, like])
            if status:
                query += " AND status = ?"
                params.append(status)
            query += " ORDER BY created_at DESC"
            rows = self._conn.execute(query, params).fetchall()
            results = []
            for row in rows:
                d = dict(row)
                d.update(self._compute_file_replication_summary(d["file_id"], d["total_chunks"], d["replication_factor"]))
                results.append(d)
            return results

    def _compute_file_replication_summary(
        self, file_id: str, total_chunks: int, replication_factor: int
    ) -> dict[str, Any]:
        row = self._conn.execute(
            """
            SELECT COUNT(*) AS stored_count
            FROM chunk_locations cl
            JOIN chunks c ON c.chunk_id = cl.chunk_id
            JOIN storage_nodes sn ON sn.node_id = cl.node_id
            WHERE c.file_id = ? AND cl.status = 'stored' AND sn.status = 'online'
            """,
            (file_id,),
        ).fetchone()
        stored_replicas = int(row["stored_count"]) if row else 0
        expected_replicas = total_chunks * replication_factor
        if stored_replicas == 0 and total_chunks > 0:
            rep_status = "unavailable"
        elif stored_replicas < expected_replicas:
            rep_status = "under_replicated"
        else:
            rep_status = "replicated"
        return {
            "stored_replicas": stored_replicas,
            "expected_replicas": expected_replicas,
            "replication_status": rep_status,
        }

    def get_file(self, file_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM files WHERE file_id = ?", (file_id,)
            ).fetchone()
            if not row:
                return None
            d = dict(row)
            d.update(
                self._compute_file_replication_summary(
                    d["file_id"], d["total_chunks"], d["replication_factor"]
                )
            )
            return d

    def get_file_chunks_with_locations(self, file_id: str) -> list[dict[str, Any]]:
        with self._lock:
            chunk_rows = self._conn.execute(
                "SELECT * FROM chunks WHERE file_id = ? ORDER BY chunk_index ASC",
                (file_id,),
            ).fetchall()
            chunks: list[dict[str, Any]] = []
            for ch in chunk_rows:
                ch_dict = dict(ch)
                loc_rows = self._conn.execute(
                    """
                    SELECT cl.*, sn.name AS node_name, sn.url AS node_url, sn.status AS node_status
                    FROM chunk_locations cl
                    JOIN storage_nodes sn ON sn.node_id = cl.node_id
                    WHERE cl.chunk_id = ?
                    ORDER BY cl.is_primary DESC, sn.status ASC, cl.node_id ASC
                    """,
                    (ch_dict["chunk_id"],),
                ).fetchall()
                ch_dict["locations"] = [
                    {
                        "node_id": lr["node_id"],
                        "node_name": lr["node_name"],
                        "node_url": lr["node_url"],
                        "node_status": lr["node_status"],
                        "is_primary": bool(lr["is_primary"]),
                        "status": lr["status"],
                        "verified_at": lr["verified_at"],
                    }
                    for lr in loc_rows
                ]
                chunks.append(ch_dict)
            return chunks

    def update_chunk_location_status(
        self, chunk_id: str, node_id: str, status: str, is_primary: bool | None = None
    ) -> None:
        now = utc_now_iso()
        with self._lock:
            if is_primary is None:
                self._conn.execute(
                    """
                    INSERT INTO chunk_locations (chunk_id, node_id, is_primary, status, verified_at)
                    VALUES (?, ?, 0, ?, ?)
                    ON CONFLICT(chunk_id, node_id) DO UPDATE SET
                        status = excluded.status,
                        verified_at = excluded.verified_at
                    """,
                    (chunk_id, node_id, status, now),
                )
            else:
                self._conn.execute(
                    """
                    INSERT INTO chunk_locations (chunk_id, node_id, is_primary, status, verified_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(chunk_id, node_id) DO UPDATE SET
                        is_primary = excluded.is_primary,
                        status = excluded.status,
                        verified_at = excluded.verified_at
                    """,
                    (chunk_id, node_id, 1 if is_primary else 0, status, now),
                )

    def update_file_status(self, file_id: str, status: str) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE files SET status = ? WHERE file_id = ?", (status, file_id)
            )

    def delete_file_record(self, file_id: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM files WHERE file_id = ?", (file_id,))

    def get_under_replicated_chunks(self) -> list[dict[str, Any]]:
        """Return chunks whose active stored replicas on online nodes < file.replication_factor."""
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT
                    c.chunk_id,
                    c.file_id,
                    c.chunk_index,
                    c.chunk_size,
                    c.sha256_hash,
                    f.replication_factor,
                    SUM(
                        CASE WHEN cl.status = 'stored' AND sn.status = 'online' THEN 1 ELSE 0 END
                    ) AS active_replicas
                FROM chunks c
                JOIN files f ON f.file_id = c.file_id
                LEFT JOIN chunk_locations cl ON cl.chunk_id = c.chunk_id
                LEFT JOIN storage_nodes sn ON sn.node_id = cl.node_id
                GROUP BY c.chunk_id
                HAVING active_replicas < f.replication_factor AND active_replicas > 0
                """
            ).fetchall()
            return [dict(r) for r in rows]

    # ── System Events ────────────────────────────────────────────────────────

    def log_event(
        self,
        event_type: str,
        severity: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> int:
        now = utc_now_iso()
        details_json = json.dumps(details) if details is not None else None
        with self._lock:
            cur = self._conn.execute(
                """
                INSERT INTO system_events (event_type, severity, message, details_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (event_type, severity, message, details_json, now),
            )
            return int(cur.lastrowid)

    def list_events(
        self, limit: int = 100, severity: str | None = None
    ) -> list[dict[str, Any]]:
        with self._lock:
            if severity:
                rows = self._conn.execute(
                    """
                    SELECT * FROM system_events
                    WHERE severity = ?
                    ORDER BY id DESC LIMIT ?
                    """,
                    (severity, limit),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT * FROM system_events ORDER BY id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            events = []
            for r in rows:
                d = dict(r)
                details = None
                if d.get("details_json"):
                    try:
                        details = json.loads(d["details_json"])
                    except json.JSONDecodeError:
                        details = {"raw": d["details_json"]}
                events.append(
                    {
                        "id": d["id"],
                        "event_type": d["event_type"],
                        "severity": d["severity"],
                        "message": d["message"],
                        "details": details,
                        "created_at": d["created_at"],
                    }
                )
            return events

    # ── Cluster Stats ────────────────────────────────────────────────────────

    def get_cluster_stats(self) -> dict[str, Any]:
        with self._lock:
            file_stats = self._conn.execute(
                """
                SELECT
                    COUNT(*) AS total_files,
                    COALESCE(SUM(file_size), 0) AS total_stored_bytes,
                    COALESCE(SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END), 0) AS healthy_files,
                    COALESCE(SUM(CASE WHEN status != 'healthy' THEN 1 ELSE 0 END), 0) AS degraded_files
                FROM files
                """
            ).fetchone()
            chunk_count_row = self._conn.execute(
                "SELECT COUNT(*) AS total_chunks FROM chunks"
            ).fetchone()
            rep_count_row = self._conn.execute(
                "SELECT COUNT(*) AS total_replicas FROM chunk_locations WHERE status = 'stored'"
            ).fetchone()
            node_rows = self._conn.execute(
                "SELECT status, total_bytes, used_bytes, free_bytes, chunks_used_bytes FROM storage_nodes"
            ).fetchall()

            active_nodes = sum(1 for n in node_rows if n["status"] == "online")
            offline_nodes = sum(1 for n in node_rows if n["status"] != "online")
            total_capacity = sum(int(n["total_bytes"]) for n in node_rows)
            total_used = sum(int(n["used_bytes"]) for n in node_rows)
            total_free = sum(int(n["free_bytes"]) for n in node_rows)
            utilization = (
                round((total_used / total_capacity) * 100.0, 2)
                if total_capacity > 0
                else 0.0
            )

            return {
                "total_files": int(file_stats["total_files"]),
                "total_stored_bytes": int(file_stats["total_stored_bytes"]),
                "total_chunks": int(chunk_count_row["total_chunks"]),
                "total_replicas": int(rep_count_row["total_replicas"]),
                "active_nodes": active_nodes,
                "offline_nodes": offline_nodes,
                "total_nodes": len(node_rows),
                "total_capacity_bytes": total_capacity,
                "total_used_bytes": total_used,
                "total_free_bytes": total_free,
                "storage_utilization_percent": utilization,
                "healthy_files": int(file_stats["healthy_files"]),
                "degraded_files": int(file_stats["degraded_files"]),
            }
