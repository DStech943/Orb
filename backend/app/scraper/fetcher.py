from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin, urlsplit

import httpx

from app.config import Settings
from app.scraper.safety import assert_public_url

logger = logging.getLogger(__name__)


class FetchError(RuntimeError):
    pass


@dataclass(slots=True)
class FetchResult:
    url: str
    final_url: str
    status_code: int
    content_type: str
    body: bytes
    retry_after: float | None = None
    elapsed_seconds: float = 0.0
    last_modified: str | None = None

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")


def parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(0.0, min(120.0, float(value)))
    except ValueError:
        try:
            return max(0.0, min(120.0, parsedate_to_datetime(value).timestamp() - time.time()))
        except (TypeError, ValueError):
            return None


@dataclass(slots=True)
class _HostState:
    semaphore: asyncio.Semaphore
    delay: float
    next_token: float = 0.0
    cooldown_until: float = 0.0
    successes: int = 0


class HostThrottle:
    """Per-host token bucket and adaptive cooldown shared by every worker task."""

    def __init__(self, per_host_concurrent: int, crawl_delay: float) -> None:
        self.per_host_concurrent = per_host_concurrent
        self.base_delay = min(10.0, max(0.1, crawl_delay))
        self._states: dict[str, _HostState] = {}
        self._lock = asyncio.Lock()

    async def _state(self, host: str) -> _HostState:
        async with self._lock:
            return self._states.setdefault(host, _HostState(asyncio.Semaphore(self.per_host_concurrent), self.base_delay))

    async def acquire(self, host: str, robots_delay: float | None = None) -> asyncio.Semaphore:
        state = await self._state(host)
        minimum_delay = min(10.0, max(self.base_delay, robots_delay or 0.0))
        while True:
            async with self._lock:
                now = time.monotonic()
                effective_delay = max(state.delay, minimum_delay)
                available_at = max(state.next_token, state.cooldown_until)
                if available_at <= now:
                    state.next_token = now + effective_delay
                    break
                wait_for = available_at - now
            await asyncio.sleep(wait_for)
        # The delay/cooldown wait occurs before this slot is held.
        await state.semaphore.acquire()
        return state.semaphore

    async def throttled(self, host: str, retry_after: float | None) -> float:
        state = await self._state(host)
        cooldown = min(120.0, retry_after if retry_after is not None else 30.0)
        async with self._lock:
            state.delay = min(10.0, max(self.base_delay, state.delay * 2))
            state.cooldown_until = max(state.cooldown_until, time.monotonic() + cooldown)
            state.next_token = max(state.next_token, state.cooldown_until)
            state.successes = 0
            return max(0.0, state.cooldown_until - time.monotonic())

    async def succeeded(self, host: str) -> None:
        state = await self._state(host)
        async with self._lock:
            state.successes += 1
            if state.successes >= 10:
                state.delay = max(self.base_delay, state.delay / 2)
                state.successes = 0

    async def snapshot(self) -> dict[str, float]:
        async with self._lock:
            return {host: round(state.delay, 3) for host, state in self._states.items()}


class Fetcher:
    """Single-attempt bounded fetcher; worker code owns retry/accounting policy."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(settings.fetch_timeout),
            headers={"User-Agent": settings.user_agent, "Accept": "text/html,application/xml,text/xml,application/json;q=0.9,*/*;q=0.5"},
        )
        self.throttle = HostThrottle(settings.per_host_concurrency, settings.crawl_delay)

    async def close(self) -> None:
        await self.client.aclose()

    async def _read_limited(self, response: httpx.Response) -> bytes:
        chunks: list[bytes] = []
        size = 0
        async for chunk in response.aiter_bytes():
            size += len(chunk)
            if size > self.settings.max_html_bytes:
                raise FetchError(f"Response exceeds {self.settings.max_html_bytes} byte limit")
            chunks.append(chunk)
        return b"".join(chunks)

    async def fetch(self, value: str, attempts: int | None = None, crawl_delay: float | None = None) -> FetchResult:
        del attempts  # Retained only for callers from the discovery API.
        initial = await assert_public_url(value)
        current = initial
        started = time.monotonic()
        for _ in range(6):
            host = urlsplit(current).hostname or ""
            semaphore = await self.throttle.acquire(host, crawl_delay)
            try:
                async with self.client.stream("GET", current) as response:
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location:
                            raise FetchError("Redirect response has no Location header")
                        current = await assert_public_url(urljoin(current, location))
                        continue
                    body = await self._read_limited(response)
                    return FetchResult(
                        url=initial,
                        final_url=current,
                        status_code=response.status_code,
                        content_type=response.headers.get("content-type", "").split(";", 1)[0].lower(),
                        body=body,
                        retry_after=parse_retry_after(response.headers.get("retry-after")),
                        elapsed_seconds=time.monotonic() - started,
                        last_modified=response.headers.get("last-modified"),
                    )
            finally:
                semaphore.release()
        raise FetchError("Too many redirects")

    async def note_response(self, result: FetchResult) -> float | None:
        host = urlsplit(result.final_url).hostname or ""
        if result.status_code in {429, 503}:
            return await self.throttle.throttled(host, result.retry_after)
        if result.status_code < 400:
            await self.throttle.succeeded(host)
        return None
