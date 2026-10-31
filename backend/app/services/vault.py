"""Read server-only credentials from the backend process environment."""
from __future__ import annotations

import os

import asyncpg


class SecretUnavailable(RuntimeError):
    pass


async def vault_secret(pool: asyncpg.Pool, name: str) -> str:
    """Return a credential from ``backend/.env`` without touching Supabase Vault.

    ``pool`` remains in the signature so callers retain a stable service interface
    if a different server-side secret provider is introduced later.
    """
    del pool
    value = os.getenv(name)
    if not isinstance(value, str) or not value.strip():
        raise SecretUnavailable(f"Missing required server environment variable: {name}")
    return value.strip()
