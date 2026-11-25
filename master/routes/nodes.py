"""Storage Node registration, health, and inventory routes."""

from fastapi import APIRouter, HTTPException, Request, status

from master.models.schemas import (
    NodeChunkInventory,
    NodeHealthDetail,
    NodeInfo,
    NodeRegisterRequest,
)
from master.services.node_client import NodeClientError
from master.utils.security import validate_identifier, validate_node_url

router = APIRouter(prefix="/nodes", tags=["Storage Nodes"])


@router.get("", response_model=list[NodeInfo])
async def list_nodes(request: Request, node_status: str | None = None) -> list[NodeInfo]:
    """List all registered Storage Nodes."""
    db = request.app.state.db
    return [NodeInfo(**n) for n in db.list_nodes(status=node_status)]


@router.post("/register", response_model=NodeInfo, status_code=status.HTTP_201_CREATED)
async def register_node(request: Request, payload: NodeRegisterRequest) -> NodeInfo:
    """Register or refresh a Storage Node and immediately probe its health/stats."""
    db = request.app.state.db
    monitor = request.app.state.health_monitor
    try:
        node_id = validate_identifier(payload.node_id, "node_id")
        clean_url = validate_node_url(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    node = db.upsert_node(node_id=node_id, name=payload.name.strip(), url=clean_url)
    await monitor.check_single_node(node, log_recovery=False)
    updated = db.get_node(node_id)
    db.log_event(
        "NODE_REGISTERED",
        "info",
        f"Registered storage node {node_id} at {clean_url}.",
        {"node_id": node_id, "url": clean_url},
    )
    return NodeInfo(**updated)


@router.get("/{node_id}", response_model=NodeInfo)
async def get_node(request: Request, node_id: str) -> NodeInfo:
    """Retrieve metadata for a specific Storage Node."""
    db = request.app.state.db
    node = db.get_node(node_id)
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found.")
    return NodeInfo(**node)


@router.get("/{node_id}/health", response_model=NodeHealthDetail)
async def check_node_health(request: Request, node_id: str) -> NodeHealthDetail:
    """Actively probe a Storage Node's health endpoint and update its status."""
    db = request.app.state.db
    monitor = request.app.state.health_monitor
    node = db.get_node(node_id)
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found.")
    result = await monitor.check_single_node(node)
    refreshed = db.get_node(node_id)
    return NodeHealthDetail(
        node_id=refreshed["node_id"],
        name=refreshed["name"],
        url=refreshed["url"],
        status=refreshed["status"],
        healthy=result["healthy"],
        response_time_ms=refreshed["response_time_ms"],
        uptime_seconds=refreshed["uptime_seconds"],
        last_heartbeat=refreshed["last_heartbeat"],
        error=result["error"],
    )


@router.get("/{node_id}/chunks", response_model=NodeChunkInventory)
async def get_node_chunks(request: Request, node_id: str) -> NodeChunkInventory:
    """Fetch live chunk inventory from a Storage Node."""
    db = request.app.state.db
    client = request.app.state.node_client
    node = db.get_node(node_id)
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found.")
    try:
        payload = await client.list_chunks(node["url"])
        return NodeChunkInventory(
            node_id=node_id,
            chunks=payload.get("chunks", []),
            reachable=True,
        )
    except Exception as exc:
        return NodeChunkInventory(
            node_id=node_id,
            chunks=[],
            reachable=False,
            error=str(exc),
        )
