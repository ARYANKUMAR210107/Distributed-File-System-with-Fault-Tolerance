"""Pydantic request and response models for the Master Node REST API."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class NodeRegisterRequest(BaseModel):
    node_id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=100)
    url: str = Field(..., min_length=7, max_length=255)


class NodeInfo(BaseModel):
    node_id: str
    name: str
    url: str
    status: str
    total_bytes: int
    used_bytes: int
    free_bytes: int
    chunks_used_bytes: int
    chunk_count: int
    primary_count: int = 0
    replica_count: int = 0
    response_time_ms: float | None = None
    uptime_seconds: float | None = None
    consecutive_failures: int = 0
    last_heartbeat: str | None = None
    created_at: str


class NodeHealthDetail(BaseModel):
    node_id: str
    name: str
    url: str
    status: str
    healthy: bool
    response_time_ms: float | None = None
    uptime_seconds: float | None = None
    last_heartbeat: str | None = None
    error: str | None = None


class NodeChunkInventory(BaseModel):
    node_id: str
    chunks: list[dict[str, Any]]
    reachable: bool
    error: str | None = None


class ChunkLocationInfo(BaseModel):
    node_id: str
    node_name: str | None = None
    node_url: str | None = None
    node_status: str | None = None
    is_primary: bool
    status: str
    verified_at: str | None = None


class ChunkInfo(BaseModel):
    chunk_id: str
    file_id: str
    chunk_index: int
    chunk_size: int
    sha256_hash: str
    locations: list[ChunkLocationInfo] = []


class FileRecord(BaseModel):
    file_id: str
    filename: str
    content_type: str
    file_size: int
    sha256_hash: str
    chunk_size: int
    total_chunks: int
    replication_factor: int
    status: str
    created_at: str
    stored_replicas: int = 0
    expected_replicas: int = 0
    replication_status: str = "healthy"


class FileDetailResponse(BaseModel):
    file: FileRecord
    chunks: list[ChunkInfo]


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    file_size: int
    sha256_hash: str
    chunk_size: int
    total_chunks: int
    replication_factor: int
    status: str
    replication_status: str
    integrity_verified: bool
    warnings: list[str] = []


class DeleteFileResponse(BaseModel):
    file_id: str
    filename: str
    deleted: bool
    chunks_removed: int
    failed_deletions: list[dict[str, str]] = []


class ChunkIntegrityResult(BaseModel):
    chunk_id: str
    chunk_index: int
    expected_sha256: str
    healthy_replicas: int
    corrupted_replicas: int
    missing_replicas: int
    offline_replicas: int
    status: str
    details: list[dict[str, Any]]


class FileIntegrityResponse(BaseModel):
    file_id: str
    filename: str
    overall_status: str
    total_chunks: int
    healthy_chunks: int
    chunks: list[ChunkIntegrityResult]


class DistributionChunkNode(BaseModel):
    chunk_id: str
    chunk_index: int
    chunk_size: int
    sha256_hash: str
    primary_node: dict[str, Any] | None = None
    replica_nodes: list[dict[str, Any]] = []


class FileDistributionResponse(BaseModel):
    file_id: str
    filename: str
    total_chunks: int
    replication_factor: int
    distribution: list[DistributionChunkNode]


class SystemEvent(BaseModel):
    id: int
    event_type: str
    severity: str
    message: str
    details: dict[str, Any] | None = None
    created_at: str


class ClusterStats(BaseModel):
    total_files: int
    total_stored_bytes: int
    total_chunks: int
    total_replicas: int
    active_nodes: int
    offline_nodes: int
    total_nodes: int
    total_capacity_bytes: int
    total_used_bytes: int
    total_free_bytes: int
    storage_utilization_percent: float
    healthy_files: int
    degraded_files: int


class SettingsResponse(BaseModel):
    chunk_size: int
    replication_factor: int
    max_upload_size_mb: int
    health_check_interval_seconds: int
    auto_replicate_on_failure: bool


class SettingsUpdateRequest(BaseModel):
    chunk_size: int | None = Field(default=None, ge=4096, le=67108864)
    replication_factor: int | None = Field(default=None, ge=1, le=5)
    max_upload_size_mb: int | None = Field(default=None, ge=1, le=2048)
    auto_replicate_on_failure: bool | None = None
