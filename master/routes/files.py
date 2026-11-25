"""File upload, download, listing, integrity, distribution, and deletion routes."""

from urllib.parse import quote
from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from fastapi.responses import Response

from master.models.schemas import (
    ChunkInfo,
    DeleteFileResponse,
    FileDetailResponse,
    FileDistributionResponse,
    FileIntegrityResponse,
    FileRecord,
    UploadResponse,
)
from master.services.file_service import FileOperationError

router = APIRouter(tags=["Files"])


@router.get("/files", response_model=list[FileRecord])
async def list_files(
    request: Request, search: str | None = None, file_status: str | None = None
) -> list[FileRecord]:
    """List stored files with optional search and status filter."""
    db = request.app.state.db
    return [FileRecord(**f) for f in db.list_files(search=search, status=file_status)]


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(request: Request, file: UploadFile = File(...)) -> UploadResponse:
    """Upload a file, split into chunks, distribute, replicate, and verify."""
    file_service = request.app.state.file_service
    data = await file.read()
    try:
        result = await file_service.upload_file(
            raw_filename=file.filename or "untitled",
            content_type=file.content_type or "application/octet-stream",
            data=data,
        )
        return UploadResponse(**result)
    except FileOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/files/{file_id}", response_model=FileDetailResponse)
async def get_file_details(request: Request, file_id: str) -> FileDetailResponse:
    """Return file metadata and all chunk/replica locations."""
    db = request.app.state.db
    file_rec = db.get_file(file_id)
    if not file_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    chunks = db.get_file_chunks_with_locations(file_id)
    return FileDetailResponse(
        file=FileRecord(**file_rec),
        chunks=[ChunkInfo(**c) for c in chunks],
    )


@router.get("/files/{file_id}/download")
async def download_file(request: Request, file_id: str) -> Response:
    """Reconstruct and download a file with automatic replica failover and SHA-256 check."""
    file_service = request.app.state.file_service
    try:
        file_rec, payload = await file_service.download_file(file_id)
    except FileOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    encoded_name = quote(file_rec["filename"])
    return Response(
        content=payload,
        media_type=file_rec["content_type"] or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}",
            "X-File-SHA256": file_rec["sha256_hash"],
        },
    )


@router.delete("/files/{file_id}", response_model=DeleteFileResponse)
async def delete_file(request: Request, file_id: str) -> DeleteFileResponse:
    """Delete a file and its chunks from all Storage Nodes."""
    file_service = request.app.state.file_service
    try:
        result = await file_service.delete_file(file_id)
        return DeleteFileResponse(**result)
    except FileOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/files/{file_id}/chunks", response_model=list[ChunkInfo])
async def get_file_chunks(request: Request, file_id: str) -> list[ChunkInfo]:
    """Return ordered chunks and replica locations for a file."""
    db = request.app.state.db
    if not db.get_file(file_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    return [ChunkInfo(**c) for c in db.get_file_chunks_with_locations(file_id)]


@router.get("/files/{file_id}/integrity", response_model=FileIntegrityResponse)
async def verify_file_integrity(request: Request, file_id: str) -> FileIntegrityResponse:
    """Actively verify chunk existence and SHA-256 hashes across Storage Nodes."""
    file_service = request.app.state.file_service
    try:
        result = await file_service.verify_file_integrity(file_id)
        return FileIntegrityResponse(**result)
    except FileOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/files/{file_id}/distribution", response_model=FileDistributionResponse)
async def get_file_distribution(request: Request, file_id: str) -> FileDistributionResponse:
    """Return chunk-to-node primary and replica mapping for visualization."""
    file_service = request.app.state.file_service
    try:
        result = file_service.get_file_distribution(file_id)
        return FileDistributionResponse(**result)
    except FileOperationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
