"""FastAPI application factory for a Storage Node."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from storage_node.config import StorageNodeSettings, get_settings
from storage_node.routes import chunks, health
from storage_node.storage.chunk_store import ChunkStore

logger = logging.getLogger("dfs.storage_node")


async def _register_with_master(settings: StorageNodeSettings) -> None:
    """Attempt to register this Storage Node with the Master Node."""
    payload = {
        "node_id": settings.node_id,
        "name": settings.node_name,
        "url": settings.public_url,
    }
    register_url = f"{settings.master_url.rstrip('/')}/nodes/register"
    for attempt in range(1, 6):
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.post(register_url, json=payload)
                if resp.status_code in (200, 201):
                    logger.info(
                        "Registered node %s (%s) with master %s",
                        settings.node_id,
                        settings.public_url,
                        settings.master_url,
                    )
                    return
        except httpx.HTTPError as exc:
            logger.warning(
                "Registration attempt %d/5 to %s failed: %s",
                attempt,
                register_url,
                exc,
            )
        await asyncio.sleep(2.0)


def create_app(settings: StorageNodeSettings | None = None) -> FastAPI:
    """Create and configure a Storage Node FastAPI instance."""
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = resolved_settings
        app.state.chunk_store = ChunkStore(resolved_settings.storage_dir)
        app.state.started_at = time.monotonic()

        reg_task: asyncio.Task | None = None
        if resolved_settings.auto_register:
            reg_task = asyncio.create_task(_register_with_master(resolved_settings))

        yield

        if reg_task and not reg_task.done():
            reg_task.cancel()

    app = FastAPI(
        title=f"DFS Storage Node ({resolved_settings.node_id})",
        description="Independent Storage Node for the Distributed File System.",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.include_router(health.router)
    app.include_router(chunks.router)
    return app


app = create_app()
