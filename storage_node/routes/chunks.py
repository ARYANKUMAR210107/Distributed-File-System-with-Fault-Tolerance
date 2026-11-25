"""Chunk CRUD endpoints for a Storage Node."""

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response

from storage_node.models import (
    ChunkListResponse,
    ChunkMetadataItem,
    ChunkUploadResponse,
    DeleteChunkResponse,
)

router = APIRouter(tags=["Chunks"])


@router.post("/chunks", response_model=ChunkUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_chunk(
    request: Request,
    chunk_id: str = Form(...),
    sha256_hash: str | None = Form(default=None),
    file: UploadFile = File(...),
) -> ChunkUploadResponse:
    """Store a chunk on local disk and verify its SHA-256 hash if provided."""
    store = request.app.state.chunk_store
    settings = request.app.state.settings
    data = await file.read()
    try:
        meta = store.save_chunk(chunk_id=chunk_id, data=data, expected_sha256=sha256_hash)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return ChunkUploadResponse(
        status="stored",
        chunk_id=meta["chunk_id"],
        size_bytes=meta["size_bytes"],
        sha256_hash=meta["sha256_hash"],
        node_id=settings.node_id,
    )


@router.get("/chunks/{chunk_id}")
async def get_chunk(request: Request, chunk_id: str) -> Response:
    """Retrieve raw chunk bytes along with its SHA-256 header."""
    store = request.app.state.chunk_store
    try:
        data, sha256_hash = store.get_chunk(chunk_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"X-Chunk-SHA256": sha256_hash},
    )


@router.delete("/chunks/{chunk_id}", response_model=DeleteChunkResponse)
async def delete_chunk(request: Request, chunk_id: str) -> DeleteChunkResponse:
    """Delete a chunk from local disk."""
    store = request.app.state.chunk_store
    try:
        deleted = store.delete_chunk(chunk_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chunk {chunk_id} not found.",
        )
    return DeleteChunkResponse(status="deleted", chunk_id=chunk_id, deleted=True)


@router.get("/chunks", response_model=ChunkListResponse)
async def list_chunks(request: Request) -> ChunkListResponse:
    """List all chunks stored on this Storage Node."""
    store = request.app.state.chunk_store
    settings = request.app.state.settings
    raw_items = store.list_chunks()
    items = [ChunkMetadataItem(**item) for item in raw_items]
    return ChunkListResponse(
        node_id=settings.node_id,
        chunk_count=len(items),
        chunks=items,
    )
