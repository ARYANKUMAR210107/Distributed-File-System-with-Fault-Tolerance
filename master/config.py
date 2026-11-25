"""Configuration for the Master Node."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class MasterSettings(BaseSettings):
    """Master Node settings loaded from environment variables or defaults."""

    master_host: str = "127.0.0.1"
    master_port: int = 8000
    database_path: str = "data/dfs_metadata.db"
    default_chunk_size: int = 1048576  # 1 MiB
    default_replication_factor: int = 2
    max_upload_size_mb: int = 200
    health_check_interval_seconds: int = 10
    startup_grace_seconds: int = 5
    node_timeout_seconds: float = 5.0
    node_failure_threshold: int = 3
    auto_replicate_on_failure: bool = True
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    enable_background_monitor: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> MasterSettings:
    """Cached Master Node settings."""
    return MasterSettings()
