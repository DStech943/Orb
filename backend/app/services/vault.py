"""Read server credentials from Supabase Vault without exposing them to clients."""
from __future__ import annotations

import asyncpg


class SecretUnavailable(RuntimeError):
    pass


async def vault_secret(pool: asyncpg.Pool, name: str) -> str:
    try:
        value = await pool.fetchval(
            "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1",
            name,
        )
    except asyncpg.PostgresError as exc:
        raise SecretUnavailable(f"Supabase Vault is unavailable while reading {name}") from exc
    if not isinstance(value, str) or not value.strip():
        raise SecretUnavailable(f"Missing required Vault secret: {name}")
    return value.strip()
