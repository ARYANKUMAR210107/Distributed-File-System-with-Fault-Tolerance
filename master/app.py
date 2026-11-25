"""FastAPI application factory for the Master Node."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from master.config import MasterSettings, get_settings
from master.database.db import MetadataDB
from master.monitoring.health_monitor import HealthMonitor
from master.replication.replicator import Replicator
from master.routes import files, nodes, system
from master.services.distributor import RoundRobinDistributor
from master.services.file_service import FileService
from master.services.node_client import NodeClient


def create_app(settings: MasterSettings | None = None) -> FastAPI:
    """Create and configure the Master Node FastAPI application."""
    resolved = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db = MetadataDB(resolved.database_path)
        db.init_default_settings(
            {
                "chunk_size": str(resolved.default_chunk_size),
                "replication_factor": str(resolved.default_replication_factor),
                "max_upload_size_mb": str(resolved.max_upload_size_mb),
                "auto_replicate_on_failure": "true"
                if resolved.auto_replicate_on_failure
                else "false",
            }
        )
        node_client = NodeClient(timeout_seconds=resolved.node_timeout_seconds)
        distributor = RoundRobinDistributor()
        replicator = Replicator(db=db, node_client=node_client)
        file_service = FileService(
            db=db, node_client=node_client, distributor=distributor
        )
        health_monitor = HealthMonitor(
            db=db,
            node_client=node_client,
            replicator=replicator,
            interval_seconds=resolved.health_check_interval_seconds,
            failure_threshold=resolved.node_failure_threshold,
            auto_replicate=resolved.auto_replicate_on_failure,
            startup_grace_seconds=resolved.startup_grace_seconds,
        )

        app.state.settings = resolved
        app.state.db = db
        app.state.node_client = node_client
        app.state.distributor = distributor
        app.state.replicator = replicator
        app.state.file_service = file_service
        app.state.health_monitor = health_monitor

        if resolved.enable_background_monitor:
            health_monitor.start()

        yield

        await health_monitor.stop()
        await node_client.close()
        db.close()

    app = FastAPI(
        title="DFS Master Node",
        description="Central coordinator for the Distributed File System with Fault Tolerance.",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(system.router)
    app.include_router(nodes.router)
    app.include_router(files.router)
    return app


app = create_app()
