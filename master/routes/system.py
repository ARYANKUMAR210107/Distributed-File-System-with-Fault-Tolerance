"""System health, cluster stats, events, replication trigger, and settings routes."""

from fastapi import APIRouter, Request

from master.models.schemas import (
    ClusterStats,
    SettingsResponse,
    SettingsUpdateRequest,
    SystemEvent,
)

router = APIRouter(tags=["System"])


@router.get("/health")
async def get_master_health(request: Request) -> dict:
    """Master Node liveness endpoint."""
    return {"status": "healthy", "service": "dfs-master"}


@router.get("/stats", response_model=ClusterStats)
async def get_cluster_stats(request: Request) -> ClusterStats:
    """Return aggregated cluster storage and file metrics."""
    db = request.app.state.db
    return ClusterStats(**db.get_cluster_stats())


@router.get("/system/events", response_model=list[SystemEvent])
async def get_system_events(
    request: Request, limit: int = 100, severity: str | None = None
) -> list[SystemEvent]:
    """Return recent system events (uploads, downloads, failures, recoveries)."""
    db = request.app.state.db
    safe_limit = max(1, min(limit, 500))
    return [SystemEvent(**e) for e in db.list_events(limit=safe_limit, severity=severity)]


@router.post("/system/re-replicate")
async def trigger_re_replication(request: Request) -> dict:
    """Manually trigger re-replication of under-replicated chunks."""
    replicator = request.app.state.replicator
    return await replicator.re_replicate_under_replicated_chunks()


@router.get("/settings", response_model=SettingsResponse)
async def get_runtime_settings(request: Request) -> SettingsResponse:
    """Return safe configurable runtime settings."""
    db = request.app.state.db
    cfg = request.app.state.settings
    raw = db.get_settings()
    return SettingsResponse(
        chunk_size=int(raw.get("chunk_size", cfg.default_chunk_size)),
        replication_factor=int(raw.get("replication_factor", cfg.default_replication_factor)),
        max_upload_size_mb=int(raw.get("max_upload_size_mb", cfg.max_upload_size_mb)),
        health_check_interval_seconds=cfg.health_check_interval_seconds,
        auto_replicate_on_failure=raw.get("auto_replicate_on_failure", "true").lower() == "true",
    )


@router.put("/settings", response_model=SettingsResponse)
async def update_runtime_settings(
    request: Request, payload: SettingsUpdateRequest
) -> SettingsResponse:
    """Update safe runtime settings."""
    db = request.app.state.db
    updates: dict[str, str] = {}
    if payload.chunk_size is not None:
        updates["chunk_size"] = str(payload.chunk_size)
    if payload.replication_factor is not None:
        updates["replication_factor"] = str(payload.replication_factor)
    if payload.max_upload_size_mb is not None:
        updates["max_upload_size_mb"] = str(payload.max_upload_size_mb)
    if payload.auto_replicate_on_failure is not None:
        updates["auto_replicate_on_failure"] = "true" if payload.auto_replicate_on_failure else "false"

    if updates:
        db.update_settings(updates)
        db.log_event(
            "SETTINGS_UPDATED",
            "info",
            "Cluster runtime settings updated.",
            updates,
        )
    return await get_runtime_settings(request)
