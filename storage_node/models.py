"""Pydantic models for Storage Node API responses."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    node_id: str
    node_name: str
    uptime_seconds: float


class NodeStatsResponse(BaseModel):
    node_id: str
    node_name: str
    storage_dir: str
    total_bytes: int
    used_bytes: int
    free_bytes: int
    chunks_used_bytes: int
    chunk_count: int
    uptime_seconds: float


class ChunkUploadResponse(BaseModel):
    status: str
    chunk_id: str
    size_bytes: int
    sha256_hash: str
    node_id: str


class ChunkMetadataItem(BaseModel):
    chunk_id: str
    size_bytes: int
    sha256_hash: str
    stored_at: str


class ChunkListResponse(BaseModel):
    node_id: str
    chunk_count: int
    chunks: list[ChunkMetadataItem]


class DeleteChunkResponse(BaseModel):
    status: str
    chunk_id: str
    deleted: bool
