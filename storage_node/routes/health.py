"""Health and statistics endpoints for a Storage Node."""

import time
from fastapi import APIRouter, Request

from storage_node.models import HealthResponse, NodeStatsResponse

router = APIRouter(tags=["Health & Stats"])


@router.get("/health", response_model=HealthResponse)
async def get_health(request: Request) -> HealthResponse:
    """Return liveness status and uptime for this Storage Node."""
    settings = request.app.state.settings
    started_at: float = request.app.state.started_at
    return HealthResponse(
        status="healthy",
        node_id=settings.node_id,
        node_name=settings.node_name,
        uptime_seconds=round(time.monotonic() - started_at, 2),
    )


@router.get("/stats", response_model=NodeStatsResponse)
async def get_stats(request: Request) -> NodeStatsResponse:
    """Return disk capacity, chunk count, and storage usage."""
    settings = request.app.state.settings
    store = request.app.state.chunk_store
    started_at: float = request.app.state.started_at
    disk = store.get_disk_stats()
    return NodeStatsResponse(
        node_id=settings.node_id,
        node_name=settings.node_name,
        storage_dir=settings.storage_dir,
        total_bytes=disk["total_bytes"],
        used_bytes=disk["used_bytes"],
        free_bytes=disk["free_bytes"],
        chunks_used_bytes=disk["chunks_used_bytes"],
        chunk_count=disk["chunk_count"],
        uptime_seconds=round(time.monotonic() - started_at, 2),
    )
