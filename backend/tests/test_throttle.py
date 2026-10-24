import asyncio
import time

import pytest

from app.scraper.fetcher import HostThrottle


@pytest.mark.asyncio
async def test_host_throttle_spaces_requests_without_holding_slots() -> None:
    throttle = HostThrottle(per_host_concurrent=1, crawl_delay=0.03)
    started: list[float] = []

    async def request() -> None:
        semaphore = await throttle.acquire("example.com")
        try:
            started.append(time.monotonic())
        finally:
            semaphore.release()

    await asyncio.gather(request(), request(), request())
    assert started[1] - started[0] >= 0.025
    assert started[2] - started[1] >= 0.025


@pytest.mark.asyncio
async def test_host_throttle_applies_shared_cooldown_and_adapts_delay() -> None:
    throttle = HostThrottle(per_host_concurrent=1, crawl_delay=0.01)
    cooldown = await throttle.throttled("example.com", 0.03)
    assert cooldown >= 0.02
    before = time.monotonic()
    semaphore = await throttle.acquire("example.com")
    semaphore.release()
    assert time.monotonic() - before >= 0.02
    assert (await throttle.snapshot())["example.com"] == 0.2
