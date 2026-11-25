"""Configuration for a Storage Node instance."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class StorageNodeSettings(BaseSettings):
    """Settings loaded from environment variables or defaults."""

    node_id: str = "node-1"
    node_name: str = "Storage Node 1"
    node_host: str = "127.0.0.1"
    node_port: int = 8001
    advertise_url: str | None = None
    storage_dir: str = "storage/node1"
    master_url: str = "http://127.0.0.1:8000"
    auto_register: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def public_url(self) -> str:
        """Return the URL advertised to the Master Node."""
        if self.advertise_url:
            return self.advertise_url.rstrip("/")
        return f"http://{self.node_host}:{self.node_port}"


@lru_cache
def get_settings() -> StorageNodeSettings:
    """Cached settings instance."""
    return StorageNodeSettings()
