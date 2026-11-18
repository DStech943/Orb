"""A direct Vault connection that failed is not retried on every request."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import asyncpg
import pytest

from app.api import shopify


def fake_request(url: str | None = "postgresql://unreachable/db"):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(supabase_database_url=url))))


@pytest.fixture(autouse=True)
def reset_breaker():
    shopify._direct_vault_down_until = 0.0
    yield
    shopify._direct_vault_down_until = 0.0


def test_failed_direct_connection_is_skipped_for_a_while(monkeypatch):
    attempts = []

    async def failing_connect(*args, **kwargs):
        attempts.append(1)
        raise TimeoutError()

    monkeypatch.setattr(asyncpg, "connect", failing_connect)

    async def run():
        first = await shopify._direct_vault_credentials(fake_request(), "The Dearist")
        second = await shopify._direct_vault_credentials(fake_request(), "The Dearist")
        return first, second

    first, second = asyncio.run(run())
    assert first == (None, None, "direct_database_unavailable")
    assert second == (None, None, "direct_database_unavailable")
    assert len(attempts) == 1


def test_direct_connection_is_tried_again_after_the_wait(monkeypatch):
    attempts = []

    async def failing_connect(*args, **kwargs):
        attempts.append(1)
        raise OSError()

    monkeypatch.setattr(asyncpg, "connect", failing_connect)

    async def run():
        await shopify._direct_vault_credentials(fake_request(), "The Dearist")
        shopify._direct_vault_down_until = 0.0  # the wait is over
        await shopify._direct_vault_credentials(fake_request(), "The Dearist")

    asyncio.run(run())
    assert len(attempts) == 2


def test_missing_database_url_is_not_a_failure():
    result = asyncio.run(shopify._direct_vault_credentials(fake_request(url=None), "The Dearist"))
    assert result == (None, None, "direct_database_not_configured")
    assert shopify._direct_vault_down_until == 0.0
