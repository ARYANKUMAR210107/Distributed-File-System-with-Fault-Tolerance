"""Async HTTP client for Master-to-Storage-Node communication."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx


class NodeClientError(Exception):
    """Raised when a Storage Node request fails."""


class NodeClient:
    """Handles HTTP calls to Storage Nodes with connection pooling, timeouts, and retries."""

    def __init__(self, timeout_seconds: float = 5.0, max_retries: int = 2) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout_seconds)
        return self._client

    async def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    async def check_health(self, node_url: str) -> tuple[dict[str, Any], float]:
        """Call GET /health with one transient retry and return (json_payload, response_time_ms)."""
        url = f"{node_url.rstrip('/')}/health"
        client = self._get_client()
        last_exc: Exception | None = None
        for attempt in range(2):
            start = time.perf_counter()
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                elapsed_ms = round((time.perf_counter() - start) * 1000.0, 2)
                return resp.json(), elapsed_ms
            except (httpx.HTTPError, OSError) as exc:
                last_exc = exc
                if attempt == 0:
                    await asyncio.sleep(0.2)
        assert last_exc is not None
        raise last_exc

    async def get_stats(self, node_url: str) -> dict[str, Any]:
        """Call GET /stats on a Storage Node."""
        url = f"{node_url.rstrip('/')}/stats"
        client = self._get_client()
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()

    async def list_chunks(self, node_url: str) -> dict[str, Any]:
        """Call GET /chunks on a Storage Node."""
        url = f"{node_url.rstrip('/')}/chunks"
        client = self._get_client()
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()

    async def upload_chunk(
        self,
        node_url: str,
        chunk_id: str,
        data: bytes,
        sha256_hash: str,
    ) -> dict[str, Any]:
        """Upload a chunk to a Storage Node with retry on transient network errors."""
        url = f"{node_url.rstrip('/')}/chunks"
        last_exc: Exception | None = None
        client = self._get_client()
        for attempt in range(self.max_retries + 1):
            try:
                files = {"file": (f"{chunk_id}.bin", data, "application/octet-stream")}
                form = {"chunk_id": chunk_id, "sha256_hash": sha256_hash}
                resp = await client.post(url, data=form, files=files)
                resp.raise_for_status()
                return resp.json()
            except (httpx.HTTPError, OSError) as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    await asyncio.sleep(0.2 * (attempt + 1))
        raise NodeClientError(f"Failed to upload chunk {chunk_id} to {node_url}: {last_exc}")

    async def download_chunk(self, node_url: str, chunk_id: str) -> bytes:
        """Download raw chunk bytes from a Storage Node."""
        url = f"{node_url.rstrip('/')}/chunks/{chunk_id}"
        last_exc: Exception | None = None
        client = self._get_client()
        for attempt in range(self.max_retries + 1):
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.content
            except (httpx.HTTPError, OSError) as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    await asyncio.sleep(0.2 * (attempt + 1))
        raise NodeClientError(f"Failed to download chunk {chunk_id} from {node_url}: {last_exc}")

    async def delete_chunk(self, node_url: str, chunk_id: str) -> bool:
        """Delete a chunk from a Storage Node. Returns True if deleted or already absent."""
        url = f"{node_url.rstrip('/')}/chunks/{chunk_id}"
        client = self._get_client()
        try:
            resp = await client.delete(url)
            if resp.status_code in (200, 204, 404):
                return True
            resp.raise_for_status()
            return True
        except (httpx.HTTPError, OSError) as exc:
            raise NodeClientError(
                f"Failed to delete chunk {chunk_id} from {node_url}: {exc}"
            ) from exc
