from __future__ import annotations

import asyncio
import gzip
import logging
import signal
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin

import asyncpg

from app.config import Settings
from app.scraper.extract import ExtractedPage, extract_html
from app.scraper.fetcher import FetchError, FetchResult, Fetcher
from app.scraper.render import RenderUnavailable, Renderer
from app.scraper.safety import UnsafeUrl

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ClaimedUrl:
    job_id: str
    org_id: str
    start_url: str
    url: str
    attempts: int
    throttled_count: int
    page_type: str
    crawl_delay: float | None
    last_modified: str | None


class CrawlWorker:
    def __init__(self, pool: asyncpg.Pool, fetcher: Fetcher, renderer: Renderer, settings: Settings) -> None:
        self.pool, self.fetcher, self.renderer, self.settings = pool, fetcher, renderer, settings
        self.stopping = asyncio.Event()
        self.inflight: dict[asyncio.Task[None], ClaimedUrl] = {}
        self.started_at = time.monotonic()
        self.completed = 0
        self.last_summary = 0.0

    async def reap_stalled(self) -> None:
        async with self.pool.acquire() as connection:
            await connection.execute(
                """UPDATE crawl_urls cu SET status='skipped', locked_at=NULL, error='Crawl cancelled'
                FROM crawl_jobs cj WHERE cj.id=cu.job_id AND cj.status='cancelled' AND cu.status='processing'"""
            )
            await connection.execute(
                """
                UPDATE crawl_urls cu SET status = CASE WHEN cu.attempts < $1 THEN 'pending' ELSE 'failed' END,
                  locked_at = NULL, error = CASE WHEN cu.attempts < $1 THEN 'Worker lease expired' ELSE 'Worker lease expired after max attempts' END
                FROM crawl_jobs cj WHERE cj.id=cu.job_id AND cj.status='running'
                  AND cu.status = 'processing' AND cu.locked_at < now() - interval '3 minutes'
                """, self.settings.max_attempts,
            )
            await connection.execute(
                "UPDATE crawl_jobs SET status = 'failed', error = 'Discovery timed out after 5 minutes' WHERE status = 'discovering' AND created_at < now() - interval '5 minutes'"
            )

    async def claim(self, maximum: int) -> list[ClaimedUrl]:
        if self.stopping.is_set() or maximum < 1:
            return []
        async with self.pool.acquire() as connection:
            records = await connection.fetch(
                """
                WITH candidates AS (
                  SELECT cu.job_id, cu.url FROM crawl_urls cu JOIN crawl_jobs cj ON cj.id = cu.job_id
                  WHERE cu.selected AND cu.status = 'pending' AND (cu.retry_after IS NULL OR cu.retry_after <= now())
                    AND cj.status = 'running'
                  ORDER BY cu.job_id, CASE cu.page_type WHEN 'policy' THEN 1 WHEN 'page' THEN 2 WHEN 'blog' THEN 3 WHEN 'product' THEN 4 WHEN 'collection' THEN 5 ELSE 6 END, cu.url
                  FOR UPDATE OF cu SKIP LOCKED LIMIT $1
                )
                UPDATE crawl_urls cu SET status = 'processing', locked_at = now(), error = NULL
                FROM candidates c, crawl_jobs cj
                WHERE cu.job_id = c.job_id AND cu.url = c.url AND cj.id = cu.job_id
                RETURNING cu.job_id::text, cj.org_id::text, cj.start_url, cu.url, cu.attempts, cu.throttled_count,
                  cu.page_type, cj.crawl_delay, cu.last_modified
                """, maximum,
            )
        return [ClaimedUrl(**dict(record)) for record in records]

    async def _finish(
        self, item: ClaimedUrl, outcome: str, *, error: str | None = None, http_status: int | None = None,
        retry_seconds: float | None = None, count_failure: bool = False, count_throttle: bool = False,
    ) -> None:
        async with self.pool.acquire() as connection:
            await connection.execute(
                """
                UPDATE crawl_urls SET status=$3, error=$4, http_status=$5, locked_at=NULL,
                  attempts=attempts + CASE WHEN $7 THEN 1 ELSE 0 END,
                  throttled_count=throttled_count + CASE WHEN $8 THEN 1 ELSE 0 END,
                  retry_after=CASE WHEN $6::double precision IS NULL THEN NULL ELSE now() + ($6::double precision * interval '1 second') END
                WHERE job_id=$1::uuid AND url=$2 AND status='processing'
                """, item.job_id, item.url, outcome, error, http_status, retry_seconds, count_failure, count_throttle,
            )
        self.completed += 1
        await self._refresh_job(item.job_id)

    async def _refresh_job(self, job_id: str) -> None:
        async with self.pool.acquire() as connection:
            await connection.execute(
                """UPDATE crawl_jobs SET status='done' WHERE id=$1::uuid AND status='running' AND NOT EXISTS
                (SELECT 1 FROM crawl_urls WHERE job_id=$1::uuid AND selected AND status IN ('pending','processing'))""", job_id,
            )

    async def _upsert_page(self, item: ClaimedUrl, response: FetchResult, extracted: ExtractedPage, html: str, rendered_with: str) -> None:
        canonical = urljoin(response.final_url, extracted.canonical_url) if extracted.canonical_url else response.final_url
        language = None
        lower_html = html[:5000].lower()
        marker = '<html lang='
        if marker in lower_html:
            language = lower_html.split(marker, 1)[1].lstrip("\"'").split("\"", 1)[0].split("'", 1)[0].split(">", 1)[0]
        packed = await asyncio.to_thread(gzip.compress, html.encode("utf-8"))
        async with self.pool.acquire() as connection:
            await connection.execute(
                """
                INSERT INTO pages (org_id,url,canonical_url,title,description,text,structured,html_gz,content_hash,http_status,lang,last_modified,rendered_with,needs_parse,last_job_id,fetched_at)
                VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,false,$14::uuid,now())
                ON CONFLICT (org_id, canonical_url) WHERE canonical_url IS NOT NULL DO UPDATE SET
                  url=EXCLUDED.url,title=EXCLUDED.title,description=EXCLUDED.description,text=EXCLUDED.text,structured=EXCLUDED.structured,
                  html_gz=EXCLUDED.html_gz,content_hash=EXCLUDED.content_hash,http_status=EXCLUDED.http_status,lang=EXCLUDED.lang,
                  last_modified=EXCLUDED.last_modified,rendered_with=EXCLUDED.rendered_with,needs_parse=false,last_job_id=EXCLUDED.last_job_id,fetched_at=now()
                """, item.org_id, response.final_url, canonical, extracted.title, extracted.description, extracted.text,
                {**extracted.structured, "canonical_url": canonical, "page_type": item.page_type}, packed, extracted.content_hash,
                response.status_code, language, response.last_modified or item.last_modified, rendered_with, item.job_id,
            )

    async def _process_inner(self, item: ClaimedUrl) -> None:
        began = time.monotonic()
        response = await self.fetcher.fetch(item.url, crawl_delay=min(10.0, item.crawl_delay or self.settings.crawl_delay))
        cooldown = await self.fetcher.note_response(response)
        if response.status_code in {429, 503}:
            throttled = item.throttled_count + 1
            if throttled >= 8:
                await self._finish(item, "failed", error="rate limited", http_status=response.status_code, count_throttle=True)
                outcome = "failed-rate-limited"
            else:
                await self._finish(item, "pending", error="rate limited", http_status=response.status_code, retry_seconds=cooldown, count_throttle=True)
                outcome = "throttled"
            logger.info("crawl_url job_id=%s url=%s outcome=%s status=%s fetch_ms=%d cooldown=%s", item.job_id, item.url, outcome, response.status_code, response.elapsed_seconds * 1000, cooldown)
            return
        if response.status_code >= 400:
            next_attempt = item.attempts + 1
            retryable = response.status_code >= 500
            outcome = "pending" if retryable and next_attempt < self.settings.max_attempts else "failed"
            await self._finish(item, outcome, error=f"HTTP {response.status_code}", http_status=response.status_code, retry_seconds=min(300, 2 ** next_attempt) if outcome == "pending" else None, count_failure=True)
            logger.info("crawl_url job_id=%s url=%s outcome=%s status=%s fetch_ms=%d", item.job_id, item.url, outcome, response.status_code, response.elapsed_seconds * 1000)
            return
        if "html" not in response.content_type and response.content_type:
            await self._finish(item, "skipped", error=f"Unsupported content type: {response.content_type}", http_status=response.status_code)
            return
        html, rendered_with = response.text, "httpx"
        extracted = await asyncio.to_thread(extract_html, html)
        if len(extracted.text) < 80:
            if len(response.body) > 20_000 and self.settings.enable_js_render:
                try:
                    html = await self.renderer.render(response.final_url)
                    extracted, rendered_with = await asyncio.to_thread(extract_html, html), "playwright"
                except (RenderUnavailable, FetchError, UnsafeUrl) as exc:
                    await self._finish(item, "skipped", error=str(exc), http_status=response.status_code)
                    return
            elif len(response.body) > 20_000:
                await self._finish(item, "skipped", error="needs javascript rendering", http_status=response.status_code)
                return
            if len(extracted.text) < 80:
                await self._finish(item, "skipped", error="extracted text shorter than 80 characters", http_status=response.status_code)
                return
        await self._upsert_page(item, response, extracted, html, rendered_with)
        await self._finish(item, "done", http_status=response.status_code)
        logger.info("crawl_url job_id=%s url=%s outcome=done status=%s total_ms=%d", item.job_id, item.url, response.status_code, (time.monotonic() - began) * 1000)

    async def process(self, item: ClaimedUrl) -> None:
        try:
            await asyncio.wait_for(self._process_inner(item), timeout=60)
        except TimeoutError:
            next_attempt = item.attempts + 1
            await self._finish(item, "pending" if next_attempt < self.settings.max_attempts else "failed", error="timeout", retry_seconds=min(300, 2 ** next_attempt), count_failure=True)
        except (FetchError, UnsafeUrl, OSError) as exc:
            next_attempt = item.attempts + 1
            await self._finish(item, "pending" if next_attempt < self.settings.max_attempts else "failed", error=str(exc), retry_seconds=min(300, 2 ** next_attempt), count_failure=True)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("crawl_url job_id=%s url=%s outcome=unexpected_error", item.job_id, item.url)
            await self._finish(item, "failed", error="Unexpected worker error", count_failure=True)

    async def _summary(self) -> None:
        now = time.monotonic()
        if now - self.last_summary < 30:
            return
        self.last_summary = now
        async with self.pool.acquire() as connection:
            rows = await connection.fetch("SELECT status, count(*) AS count FROM crawl_urls GROUP BY status")
            depth = await connection.fetchval("SELECT count(*) FROM crawl_urls WHERE status='pending' AND selected")
            throttled = await connection.fetchval("SELECT count(*) FROM crawl_urls WHERE status='pending' AND throttled_count > 0")
        rates = self.completed / max(1, now - self.started_at)
        states = {row['status']: row['count'] for row in rows}
        states["throttled"] = throttled
        logger.info("crawl_summary states=%s queue_depth=%s pages_per_second=%.3f host_delay=%s", states, depth, rates, await self.fetcher.throttle.snapshot())

    async def run_once(self) -> int:
        await self.reap_stalled()
        claimed = await self.claim(self.settings.worker_concurrency)
        await asyncio.gather(*(self.process(item) for item in claimed))
        return len(claimed)

    async def run_forever(self) -> None:
        while not self.stopping.is_set():
            await self.reap_stalled()
            slots = self.settings.worker_concurrency - len(self.inflight)
            for item in await self.claim(slots):
                task = asyncio.create_task(self.process(item))
                self.inflight[task] = item
            if self.inflight:
                done, _ = await asyncio.wait(self.inflight, timeout=0.5, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    self.inflight.pop(task, None)
                    await task
            else:
                await asyncio.sleep(0.5)
            await self._summary()
        if self.inflight:
            done, pending = await asyncio.wait(self.inflight, timeout=30)
            for task in done:
                self.inflight.pop(task, None)
                await task
            for task in pending:
                item = self.inflight[task]
                task.cancel()
                await self._finish(item, "pending", error="Worker shutdown")
            await asyncio.gather(*pending, return_exceptions=True)


async def worker_main(pool: asyncpg.Pool, fetcher: Fetcher, renderer: Renderer, settings: Settings) -> None:
    logger.info("worker_config worker_concurrency=%s per_host_concurrency=%s crawl_delay=%s max_attempts=%s", settings.worker_concurrency, settings.per_host_concurrency, settings.crawl_delay, settings.max_attempts)
    worker = CrawlWorker(pool, fetcher, renderer, settings)
    loop = asyncio.get_running_loop()
    for event in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(event, worker.stopping.set)
        except NotImplementedError:
            signal.signal(event, lambda *_: worker.stopping.set())
    await worker.run_forever()
