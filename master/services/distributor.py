"""Round-Robin chunk distribution and replica placement."""

from __future__ import annotations

import threading
from typing import Any


class RoundRobinDistributor:
    """Selects primary and replica Storage Nodes using Round-Robin scheduling."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pointer = 0

    def select_nodes_for_chunk(
        self,
        online_nodes: list[dict[str, Any]],
        replication_factor: int,
    ) -> list[dict[str, Any]]:
        """
        Select up to `replication_factor` distinct online nodes for one chunk.

        The first node in the returned list is the primary; remaining nodes are replicas.
        Returns an empty list if no online nodes are available.
        """
        if not online_nodes or replication_factor <= 0:
            return []

        ordered = sorted(online_nodes, key=lambda n: n["node_id"])
        count = len(ordered)
        target = min(replication_factor, count)

        with self._lock:
            start = self._pointer % count
            selected = [ordered[(start + i) % count] for i in range(target)]
            self._pointer = (start + 1) % count
            return selected
