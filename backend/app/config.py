"""Application configuration."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings read from environment variables."""

    database_url: str = Field(alias="DATABASE_URL")
    supabase_db_url: str | None = Field(None, alias="SUPABASE_DB_URL")
    user_agent: str = Field("OrbBot/1.0 (+https://yourdomain.com/bot)", alias="USER_AGENT")
    max_pages_hard_limit: int = Field(2000, alias="MAX_PAGES_HARD_LIMIT", ge=1)
    fetch_timeout: float = Field(15, alias="FETCH_TIMEOUT", gt=0)
    max_html_bytes: int = Field(5_000_000, alias="MAX_HTML_BYTES", ge=1)
    per_host_concurrency: int = Field(1, alias="PER_HOST_CONCURRENCY", ge=1, le=2)
    crawl_delay: float = Field(1.0, alias="CRAWL_DELAY", ge=0.1, le=10)
    worker_batch: int = Field(8, alias="WORKER_BATCH", ge=1)
    worker_concurrency: int = Field(4, alias="WORKER_CONCURRENCY", ge=1)
    max_attempts: int = Field(3, alias="MAX_ATTEMPTS", ge=1)
    enable_js_render: bool = Field(False, alias="ENABLE_JS_RENDER")
    auth_disabled: bool = Field(False, alias="AUTH_DISABLED")
    jwt_secret: str = Field("", alias="JWT_SECRET")
    cors_origins: str = Field("http://localhost:5173", validation_alias=AliasChoices("CORS_ORIGINS", "ALLOWED_ORIGINS"))
    env: Literal["dev", "production"] = Field("dev", alias="ENV")
    llm_base_url: str | None = Field(None, alias="LLM_BASE_URL")
    llm_model: str | None = Field(None, alias="LLM_MODEL")
    embedding_base_url: str | None = Field(None, alias="EMBEDDING_BASE_URL")
    embedding_model: str | None = Field(None, alias="EMBEDDING_MODEL")
    embedding_dimensions: int = Field(768, alias="EMBEDDING_DIMENSIONS", ge=1)
    qdrant_collection_prefix: str = Field("", alias="QDRANT_COLLECTION_PREFIX")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @model_validator(mode="after")
    def validate_auth(self) -> "Settings":
        if self.env == "production" and self.auth_disabled:
            raise ValueError("AUTH_DISABLED=true is forbidden in production")
        if not self.auth_disabled and not self.jwt_secret:
            raise ValueError("JWT_SECRET is required when authentication is enabled")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings object."""

    return Settings()
