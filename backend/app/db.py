"""Postgres pool helpers."""
from __future__ import annotations

import asyncio
import json
import logging

import asyncpg

from app.config import Settings

logger = logging.getLogger(__name__)


def decode_jsonb(value: object) -> object:
    """Normalize jsonb values from pools with or without the custom codec.

    The string branch also makes data written by older, double-encoded builds
    readable while those records are replaced naturally on a future crawl.
    """
    if isinstance(value, str):
        return json.loads(value)
    return value


async def create_pool(
    settings: Settings,
    database_url: str | None = None,
    *,
    max_attempts: int = 10,
    connect_timeout: float = 10,
) -> asyncpg.Pool:
    """Create a Postgres pool, optionally retrying a database startup race.

    The crawler's primary database can take a few moments to become available
    during container startup, so it keeps the generous retry behaviour. A
    user-triggered optional database (for example the brand-content database)
    must fail quickly instead of leaving the UI in a loading state.
    """

    async def configure(connection: asyncpg.Connection) -> None:
        await connection.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        await connection.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog", format="text")

    attempts = max(1, max_attempts)
    for attempt in range(attempts):
        try:
            return await asyncpg.create_pool(
                database_url or settings.database_url,
                min_size=1,
                max_size=10,
                command_timeout=30,
                timeout=connect_timeout,
                init=configure,
            )
        except (OSError, asyncpg.PostgresError) as exc:
            if attempt == attempts - 1:
                raise
            wait_seconds = min(10, 2**attempt)
            logger.warning("Database is not ready (%s); retrying in %s seconds", exc, wait_seconds)
            await asyncio.sleep(wait_seconds)
    raise RuntimeError("Database pool creation unexpectedly fell through")
