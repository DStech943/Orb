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


async def create_pool(settings: Settings, database_url: str | None = None) -> asyncpg.Pool:
    """Create the shared asyncpg pool, tolerating database startup races."""

    async def configure(connection: asyncpg.Connection) -> None:
        await connection.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        await connection.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog", format="text")

    for attempt in range(10):
        try:
            return await asyncpg.create_pool(
                database_url or settings.database_url,
                min_size=1,
                max_size=10,
                command_timeout=30,
                init=configure,
            )
        except (OSError, asyncpg.PostgresError) as exc:
            if attempt == 9:
                raise
            wait_seconds = min(10, 2**attempt)
            logger.warning("Database is not ready (%s); retrying in %s seconds", exc, wait_seconds)
            await asyncio.sleep(wait_seconds)
    raise RuntimeError("Database pool creation unexpectedly fell through")
