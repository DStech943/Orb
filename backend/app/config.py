"""Application configuration."""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal
from uuid import UUID

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings read from environment variables."""

    database_url: str = Field(alias="DATABASE_URL")
    # Generation jobs live with the brand and content tables.  In the common
    # single-Postgres deployment this is the same database as the crawler; a
    # separate URL is supported when those tables remain in Supabase.
    supabase_database_url: str | None = Field(
        None,
        validation_alias=AliasChoices("SUPABASE_DATABASE_URL", "SUPABASE_DB_URL"),
    )
    supabase_url: str | None = Field(None, validation_alias=AliasChoices("SUPABASE_URL", "VITE_SUPABASE_URL"))
    supabase_publishable_key: str | None = Field(
        None,
        validation_alias=AliasChoices("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"),
    )
    # Server-only elevated key used for narrowly scoped Supabase RPC calls.
    # Never send this value to the browser or put it in Vite variables.
    supabase_service_role_key: str | None = Field(
        None,
        validation_alias=AliasChoices("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
    )
    user_agent: str = Field("OrbBot/1.0 (+https://yourdomain.com/bot)", alias="USER_AGENT")
    max_pages_hard_limit: int = Field(2000, alias="MAX_PAGES_HARD_LIMIT", ge=1)
    fetch_timeout: float = Field(15, alias="FETCH_TIMEOUT", gt=0)
    max_html_bytes: int = Field(5_000_000, alias="MAX_HTML_BYTES", ge=1)
    per_host_concurrency: int = Field(1, alias="PER_HOST_CONCURRENCY", ge=1, le=2)
    crawl_delay: float = Field(1.0, alias="CRAWL_DELAY", ge=0.1, le=10)
    worker_batch: int = Field(8, alias="WORKER_BATCH", ge=1)
    worker_concurrency: int = Field(4, alias="WORKER_CONCURRENCY", ge=1)
    worker_mode: Literal["crawl", "render"] = Field("crawl", alias="WORKER_MODE")
    max_attempts: int = Field(3, alias="MAX_ATTEMPTS", ge=1)
    enable_js_render: bool = Field(False, alias="ENABLE_JS_RENDER")
    auth_disabled: bool = Field(False, alias="AUTH_DISABLED")
    jwt_secret: str = Field("", alias="JWT_SECRET")
    # Orb currently uses a shared internal workspace. A verified Supabase user
    # without an explicit org claim is mapped here; custom JWTs can still
    # carry their own org_id claim.
    default_org_id: UUID = Field(UUID("00000000-0000-0000-0000-000000000002"), alias="DEFAULT_ORG_ID")
    cors_origins: str = Field("http://localhost:5173,http://127.0.0.1:5173", validation_alias=AliasChoices("CORS_ORIGINS", "ALLOWED_ORIGINS"))
    env: Literal["dev", "production"] = Field("dev", alias="ENV")
    llm_base_url: str | None = Field(None, alias="LLM_BASE_URL")
    llm_model: str | None = Field(None, alias="LLM_MODEL")
    # Source-to-draft can use a separate compatible provider and key from the
    # conversational/guide features. This keeps OpenRouter configuration
    # independent from a Google AI Studio draft key.
    draft_base_url: str | None = Field("https://generativelanguage.googleapis.com/v1beta/openai/", alias="DRAFT_BASE_URL")
    draft_model: str | None = Field("gemini-3.5-flash-lite", alias="DRAFT_MODEL")
    embedding_base_url: str | None = Field(None, alias="EMBEDDING_BASE_URL")
    embedding_model: str | None = Field(None, alias="EMBEDDING_MODEL")
    embedding_dimensions: int = Field(768, alias="EMBEDDING_DIMENSIONS", ge=1)
    qdrant_collection_prefix: str = Field("", alias="QDRANT_COLLECTION_PREFIX")
    shopify_the_dearist_domain: str | None = Field(None, alias="SHOPIFY_THE_DEARIST_DOMAIN")
    shopify_the_dearist_token: str | None = Field(None, alias="SHOPIFY_THE_DEARIST_TOKEN")
    # Used only to encrypt Shopify tokens persisted by the Install Shopify
    # flow in the Railway Postgres database. Keep this server-only and stable:
    # changing it makes previously stored tokens unreadable.
    shopify_credentials_encryption_key: str | None = Field(None, alias="SHOPIFY_CREDENTIALS_ENCRYPTION_KEY")
    shopify_admin_api_version: str = Field("2025-10", alias="SHOPIFY_ADMIN_API_VERSION")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @model_validator(mode="after")
    def validate_auth(self) -> "Settings":
        # Docker Compose declares both historical variable names.  When the
        # first alias exists but is an empty string, pydantic's AliasChoices
        # does not continue to the populated fallback.  Prefer any non-empty
        # environment value so REST-only/local deployments use the actual
        # Supabase database rather than silently falling back to crawler DB.
        if not self.supabase_database_url:
            self.supabase_database_url = (
                os.getenv("SUPABASE_DATABASE_URL", "").strip()
                or os.getenv("SUPABASE_DB_URL", "").strip()
                or None
            )
        if self.env == "production" and self.auth_disabled:
            raise ValueError("AUTH_DISABLED=true is forbidden in production")
        if not self.auth_disabled and not self.jwt_secret and not (self.supabase_url and self.supabase_publishable_key):
            raise ValueError("JWT_SECRET or Supabase authentication settings are required when authentication is enabled")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings object."""

    return Settings()
