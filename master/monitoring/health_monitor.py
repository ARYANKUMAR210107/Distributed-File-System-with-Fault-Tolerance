"""Background health monitor for registered Storage Nodes."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from master.database.db import MetadataDB
from master.replication.replicator import Replicator
from master.services.node_client import NodeClient

logger = logging.getLogger("dfs.health_monitor")


class HealthMonitor:
    """Periodically polls all registered Storage Nodes and triggers recovery on failures."""

    def __init__(
        self,
        db: MetadataDB,
        node_client: NodeClient,
        replicator: Replicator,
        interval_seconds: int = 10,
        failure_threshold: int = 3,
        auto_replicate: bool = True,
        startup_grace_seconds: int = 5,
    ) -> None:
        self.db = db
        self.node_client = node_client
        self.replicator = replicator
        self.interval_seconds = interval_seconds
        self.failure_threshold = failure_threshold
        self.auto_replicate = auto_replicate
        self.startup_grace_seconds = startup_grace_seconds
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def check_single_node(
        self, node: dict[str, Any], log_recovery: bool = True
    ) -> dict[str, Any]:
        """Probe one Storage Node and update its metadata atomically."""
        node_id = node["node_id"]
        try:
            health_payload, latency_ms = await self.node_client.check_health(node["url"])
            stats_payload: dict[str, Any] | None = None
            try:
                stats_payload = await self.node_client.get_stats(node["url"])
            except Exception as stats_exc:
                logger.debug("Non-fatal /stats fetch failed for %s: %s", node_id, stats_exc)
            uptime = health_payload.get("uptime_seconds")
            prev_status = self.db.update_node_health_success(
                node_id=node_id,
                response_time_ms=latency_ms,
                uptime_seconds=uptime,
                stats=stats_payload,
            )
            if log_recovery and prev_status != "online":
                self.db.log_event(
                    "NODE_RECOVERED",
                    "info",
                    f"Storage node {node_id} ({node['url']}) is back online.",
                    {"node_id": node_id, "response_time_ms": latency_ms, "previous_status": prev_status},
                )
            return {
                "node_id": node_id,
                "healthy": True,
                "status": "online",
                "transitioned_offline": False,
                "response_time_ms": latency_ms,
                "uptime_seconds": uptime,
                "error": None,
            }
        except Exception as exc:
            failures, prev_status, new_status = self.db.record_node_failure(
                node_id, self.failure_threshold
            )
            transitioned_offline = False
            if prev_status == "online" and new_status == "degraded":
                self.db.log_event(
                    "NODE_DEGRADED",
                    "warning",
                    f"Storage node {node_id} ({node['url']}) missed health check ({failures}/{self.failure_threshold}).",
                    {"node_id": node_id, "error": str(exc)},
                )
            elif prev_status != "offline" and new_status == "offline":
                transitioned_offline = True
                self.db.log_event(
                    "NODE_OFFLINE",
                    "error",
                    f"Storage node {node_id} ({node['url']}) marked offline after {failures} failed checks.",
                    {"node_id": node_id, "error": str(exc)},
                )
            return {
                "node_id": node_id,
                "healthy": False,
                "status": new_status,
                "transitioned_offline": transitioned_offline,
                "response_time_ms": None,
                "uptime_seconds": None,
                "error": str(exc),
            }

    async def check_all_nodes_once(self) -> list[dict[str, Any]]:
        """Run one health check pass across all registered nodes."""
        nodes = self.db.list_nodes()
        if not nodes:
            return []
        results = await asyncio.gather(*(self.check_single_node(n) for n in nodes))
        newly_offline = any(r.get("transitioned_offline") for r in results)
        if self.auto_replicate and (newly_offline or self.db.get_under_replicated_chunks()):
            settings = self.db.get_settings()
            if settings.get("auto_replicate_on_failure", "true").lower() == "true":
                await self.replicator.re_replicate_under_replicated_chunks()
        return list(results)

    async def _run_loop(self) -> None:
        if self.startup_grace_seconds > 0:
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=self.startup_grace_seconds
                )
                return
            except asyncio.TimeoutError:
                pass
        while not self._stop_event.is_set():
            try:
                await self.check_all_nodes_once()
            except Exception as exc:
                logger.exception("Health monitor pass failed: %s", exc)
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=self.interval_seconds
                )
            except asyncio.TimeoutError:
                continue
