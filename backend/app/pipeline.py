"""Persistent crawl pipeline state shared by the API and background workers."""
from __future__ import annotations

from typing import Any

import asyncpg

STAGES = ("crawl", "parse", "generate", "review", "publish")


async def create_crawl_pipeline(
    connection: asyncpg.Connection, *, org_id: str, brand_id: str | None, crawl_job_id: str,
    options: dict[str, Any], source_kind: str = "crawl",
) -> str:
    row = await connection.fetchrow(
        """INSERT INTO pipeline_runs (org_id,brand_id,crawl_job_id,source_kind,options)
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb) RETURNING id::text""",
        org_id, brand_id, crawl_job_id, source_kind, options,
    )
    pipeline_id = row["id"]
    await connection.executemany(
        "INSERT INTO pipeline_stages (pipeline_run_id,stage,status) VALUES ($1::uuid,$2,$3)",
        [(pipeline_id, stage, "running" if stage == "crawl" else "queued") for stage in STAGES],
    )
    return pipeline_id


async def pipeline_snapshot(pool: asyncpg.Pool, pipeline_id: str, org_id: str) -> dict[str, Any] | None:
    async with pool.acquire() as connection:
        run = await connection.fetchrow(
            """SELECT pipeline_runs.*, crawl_jobs.start_url AS source_url
               FROM pipeline_runs
               LEFT JOIN crawl_jobs ON crawl_jobs.id=pipeline_runs.crawl_job_id
               WHERE pipeline_runs.id=$1::uuid AND pipeline_runs.org_id=$2::uuid""",
            pipeline_id,
            org_id,
        )
        if not run:
            return None
        stages = await connection.fetch("SELECT * FROM pipeline_stages WHERE pipeline_run_id=$1::uuid ORDER BY array_position(ARRAY['crawl','parse','generate','review','publish'],stage)", pipeline_id)
    result = dict(run)
    result["id"] = str(result["id"])
    result["org_id"] = str(result["org_id"])
    result["brand_id"] = str(result["brand_id"]) if result.get("brand_id") else None
    result["crawl_job_id"] = str(result["crawl_job_id"]) if result.get("crawl_job_id") else None
    result["stages"] = [{**dict(stage), "pipeline_run_id": str(stage["pipeline_run_id"])} for stage in stages]
    return result


async def park_crawl_pipeline(connection: asyncpg.Connection, job_id: str, resume_seconds: float, reason: str) -> None:
    await connection.execute(
        """UPDATE crawl_jobs SET status='throttled', error=$2, resume_at=now()+($3 * interval '1 second')
           WHERE id=$1::uuid AND status IN ('discovering','ready','running')""",
        job_id, reason, resume_seconds,
    )
    await connection.execute(
        """UPDATE pipeline_runs SET status='throttled', error=$2, resume_at=now()+($3 * interval '1 second')
           WHERE crawl_job_id=$1::uuid AND status='running'""",
        job_id, reason, resume_seconds,
    )
    await connection.execute(
        """UPDATE pipeline_stages SET status='throttled', error=$2
           WHERE pipeline_run_id IN (SELECT id FROM pipeline_runs WHERE crawl_job_id=$1::uuid) AND stage='crawl'""",
        job_id, reason,
    )


async def resume_due_pipelines(connection: asyncpg.Connection) -> list[dict[str, str]]:
    """Resume parked work, returning jobs whose discovery pass must be rerun."""
    discovery_jobs = await connection.fetch(
        """SELECT id::text,start_url FROM crawl_jobs cj WHERE status='throttled' AND resume_at <= now()
           AND NOT EXISTS (SELECT 1 FROM crawl_urls cu WHERE cu.job_id=cj.id)"""
    )
    await connection.execute(
        """UPDATE crawl_jobs cj SET status=CASE WHEN EXISTS (SELECT 1 FROM crawl_urls cu WHERE cu.job_id=cj.id)
               THEN 'running' ELSE 'discovering' END, error=NULL, resume_at=NULL
           WHERE status='throttled' AND resume_at <= now()"""
    )
    await connection.execute("UPDATE pipeline_runs SET status='running', error=NULL, resume_at=NULL WHERE status='throttled' AND resume_at <= now()")
    await connection.execute(
        """UPDATE pipeline_stages SET status='running', error=NULL
           WHERE stage='crawl' AND status='throttled' AND pipeline_run_id IN
             (SELECT id FROM pipeline_runs WHERE status='running' AND current_stage='crawl')"""
    )
    return [dict(row) for row in discovery_jobs]


async def advance_completed_crawl(connection: asyncpg.Connection, job_id: str) -> None:
    """Advance crawl and parse automatically; review remains the human gate.

    Extraction already creates clean page text. The explicit parse stage records
    that normalization so pipeline consumers have one stable progress object.
    """
    pipeline = await connection.fetchrow("SELECT id FROM pipeline_runs WHERE crawl_job_id=$1::uuid AND status='running'", job_id)
    if not pipeline:
        return
    pipeline_id = str(pipeline["id"])
    page_count = await connection.fetchval("SELECT count(*) FROM pages WHERE last_job_id=$1::uuid", job_id)
    await connection.execute("UPDATE pipeline_stages SET status='done', counts=$2::jsonb, finished_at=coalesce(finished_at,now()) WHERE pipeline_run_id=$1::uuid AND stage='crawl'", pipeline_id, {"pages_fetched": page_count})
    await connection.execute("UPDATE pipeline_stages SET status='done', counts=$2::jsonb, started_at=coalesce(started_at,now()), finished_at=now() WHERE pipeline_run_id=$1::uuid AND stage='parse'", pipeline_id, {"pages_parsed": page_count})
    await connection.execute("UPDATE pipeline_stages SET status='running', started_at=coalesce(started_at,now()) WHERE pipeline_run_id=$1::uuid AND stage='generate'", pipeline_id)
    # Generation is enabled only when model credentials and a category template
    # are configured. Until then, expose an explicit review gate rather than
    # silently inventing content.
    await connection.execute("UPDATE pipeline_stages SET status='waiting_review', counts=$2::jsonb, started_at=coalesce(started_at,now()) WHERE pipeline_run_id=$1::uuid AND stage='review'", pipeline_id, {"pages_ready": page_count})
    await connection.execute("UPDATE pipeline_runs SET current_stage='generate', counts=$2::jsonb WHERE id=$1::uuid", pipeline_id, {"pages_fetched": page_count, "pages_parsed": page_count})
