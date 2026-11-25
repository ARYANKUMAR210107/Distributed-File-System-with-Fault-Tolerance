"""Unit tests for Round-Robin chunk distribution and replication placement."""

from master.services.distributor import RoundRobinDistributor


def _nodes(count: int) -> list[dict]:
    return [{"node_id": f"node-{i+1}", "url": f"http://127.0.0.1:800{i+1}"} for i in range(count)]


def test_round_robin_distribution_balances_across_nodes():
    dist = RoundRobinDistributor()
    nodes = _nodes(3)

    selections = [dist.select_nodes_for_chunk(nodes, replication_factor=2) for _ in range(6)]
    primaries = [sel[0]["node_id"] for sel in selections]
    assert primaries == ["node-1", "node-2", "node-3", "node-1", "node-2", "node-3"]

    # Every chunk's primary and replica must be on distinct nodes
    for sel in selections:
        ids = [n["node_id"] for n in sel]
        assert len(ids) == 2
        assert len(set(ids)) == 2


def test_insufficient_nodes_caps_at_available_count():
    dist = RoundRobinDistributor()
    nodes = _nodes(1)
    selected = dist.select_nodes_for_chunk(nodes, replication_factor=3)
    assert len(selected) == 1
    assert selected[0]["node_id"] == "node-1"


def test_no_online_nodes_returns_empty():
    dist = RoundRobinDistributor()
    assert dist.select_nodes_for_chunk([], replication_factor=2) == []
