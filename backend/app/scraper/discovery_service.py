"""Durable discovery job orchestration shared by the API and queue worker."""
from __future__ import annotations

import asyncpg

from app.config import Settings
from app.pipeline import park_crawl_pipeline
from app.scraper.discovery import Discoverer, DiscoveryThrottled
from app.scraper.fetcher import Fetcher


async def run_discovery_job(pool: asyncpg.Pool, fetcher: Fetcher, settings: Settings, job_id: str) -> None:
    """Populate a crawl job's URL queue, or park it cleanly when rate-limited."""
    async with pool.acquire() as connection:
        job = await connection.fetchrow(
            "SELECT id::text,org_id::text,start_url,options,status FROM crawl_jobs WHERE id=$1::uuid", job_id
        )
    if not job or job["status"] != "discovering":
        return
    options = dict(job["options"] or {})
    try:
        maximum = min(int(options.get("max_pages", 200)), settings.max_pages_hard_limit)
        result = await Discoverer(fetcher, settings.user_agent, pool).discover(job["start_url"], maximum)
        discovered_options = {**options, "discovery": result.summary}
        async with pool.acquire() as connection:
            async with connection.transaction():
                active = await connection.fetchval(
                    "SELECT status='discovering' FROM crawl_jobs WHERE id=$1::uuid FOR UPDATE", job_id
                )
                if not active:
                    return
                await connection.executemany(
                    """INSERT INTO crawl_urls (job_id,url,page_type,selected,status,error,last_modified)
                       VALUES ($1::uuid,$2,$3,$4,$5,$6,$7) ON CONFLICT (job_id,url) DO NOTHING""",
                    [
                        (job_id, item.url, item.page_type, item.allowed, "pending" if item.allowed else "skipped", item.reason, item.last_modified)
                        for item in result.urls
                    ],
                )
                await connection.execute(
                    """UPDATE crawl_jobs SET start_url=$2,crawl_delay=$3,options=$4::jsonb,status='running',error=NULL,resume_at=NULL
                       WHERE id=$1::uuid""",
                    job_id, result.start_url, result.crawl_delay, discovered_options,
                )
    except DiscoveryThrottled as exc:
        async with pool.acquire() as connection:
            await park_crawl_pipeline(connection, job_id, exc.retry_after, str(exc))
    except Exception as exc:
        async with pool.acquire() as connection:
            await connection.execute(
                "UPDATE crawl_jobs SET status='failed',error=$2 WHERE id=$1::uuid AND status='discovering'",
                job_id, str(exc)[:2000],
            )
