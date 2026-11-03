"""Polling endpoints for durable source-to-review pipeline runs."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request

from app.auth import User, current_user
from app.api.crawls import discover_job
from app.api.knowledge import _admin, _run_generation_rest, _supabase_background_rows
from app.db import decode_jsonb
from app.pipeline import pipeline_snapshot
from app.services.llm import GenerationUnavailable

router = APIRouter(prefix="/api/pipelines", tags=["pipelines"])


@router.get("")
async def list_pipelines(
    request: Request,
    brand_id: str = Query(..., description="Return only runs belonging to this brand"),
    user: User = Depends(current_user),
) -> dict:
    """List recent pipelines for one brand, never for the whole workspace."""
    async with request.app.state.db.acquire() as connection:
        rows = await connection.fetch(
            """SELECT id::text FROM pipeline_runs
               WHERE org_id=$1::uuid AND brand_id=$2::uuid
               ORDER BY updated_at DESC LIMIT 20""",
            user.org_id,
            brand_id,
        )
    pipelines = []
    for row in rows:
        pipeline = await pipeline_snapshot(request.app.state.db, row["id"], str(user.org_id))
        if pipeline:
            pipelines.append(pipeline)
    return {"pipelines": pipelines}


@router.get("/{pipeline_id}")
async def get_pipeline(pipeline_id: str, request: Request, user: User = Depends(current_user)) -> dict:
    pipeline = await pipeline_snapshot(request.app.state.db, pipeline_id, str(user.org_id))
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return {"pipeline": pipeline}


@router.post("/{pipeline_id}/generate", status_code=202)
async def start_pipeline_generation(
    pipeline_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    user: User = Depends(_admin),
) -> dict:
    """Create the generation job selected when this source was imported.

    Crawling does not call an LLM by itself. This explicit handoff gives the
    person reviewing a source one final chance to confirm the configured
    output types and keeps the Draft stage truthful.
    """
    async with request.app.state.db.acquire() as connection:
        pipeline = await connection.fetchrow(
            """SELECT id::text,brand_id::text,crawl_job_id::text,options,status
               FROM pipeline_runs WHERE id=$1::uuid AND org_id=$2::uuid FOR UPDATE""",
            pipeline_id,
            user.org_id,
        )
        if not pipeline:
            raise HTTPException(status_code=404, detail="Pipeline run not found")
        if not pipeline["brand_id"] or not pipeline["crawl_job_id"]:
            raise HTTPException(status_code=409, detail="This source is not linked to a brand crawl")
        stage = await connection.fetchrow(
            "SELECT status,counts FROM pipeline_stages WHERE pipeline_run_id=$1::uuid AND stage='generate'",
            pipeline_id,
        )
        if not stage:
            raise HTTPException(status_code=409, detail="Draft stage is unavailable for this pipeline")
        stage_counts = decode_jsonb(stage["counts"]) or {}
        if stage_counts.get("generation_job_id") and str(stage_counts.get("generation_status")) in {"queued", "running", "done"}:
            raise HTTPException(status_code=409, detail="Draft generation has already been started")
        if stage["status"] not in {"waiting_review", "running", "failed"}:
            raise HTTPException(status_code=409, detail="Finish collecting and parsing this source before drafting")
        page_count = await connection.fetchval("SELECT count(*) FROM pages WHERE last_job_id=$1::uuid", pipeline["crawl_job_id"])
        if not page_count:
            raise HTTPException(status_code=409, detail="No processed source pages are available to draft from")
        options = decode_jsonb(pipeline["options"]) or {}
        outputs = [item for item in options.get("outputs", []) if item in {"sops", "faqs", "products"}]
        if not outputs:
            raise HTTPException(status_code=409, detail="Select at least one output type before starting generation")

    try:
        job_payload = {
            "brand_id": pipeline["brand_id"],
            "requested_outputs": outputs,
            "source_job_ids": [pipeline["crawl_job_id"]],
        }
        # Local REST-only development has no matching Supabase auth.users row
        # for the synthetic dev identity. created_by is nullable provenance, so
        # omit it rather than violating its foreign key.
        if not request.app.state.settings.auth_disabled:
            job_payload["created_by"] = str(user.id)
        rows = await _supabase_background_rows(
            request.app,
            "POST",
            "orb_generation_jobs",
            params={"select": "id"},
            payload=job_payload,
        )
    except GenerationUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not rows or not rows[0].get("id"):
        raise HTTPException(status_code=503, detail="Supabase did not return a draft generation job")
    generation_id = str(rows[0]["id"])
    async with request.app.state.db.acquire() as connection:
        await connection.execute(
            """UPDATE pipeline_stages SET status='running', error=NULL,
               counts=counts || $2::jsonb, started_at=coalesce(started_at,now()), finished_at=NULL
               WHERE pipeline_run_id=$1::uuid AND stage='generate'""",
            pipeline_id,
            {"pages_ready": page_count, "outputs": outputs, "generation_status": "queued", "generation_job_id": generation_id, "message": "Orb is drafting content from the collected source pages."},
        )
        await connection.execute(
            """UPDATE pipeline_runs SET status='running', current_stage='generate', error=NULL,
               counts=counts || $2::jsonb WHERE id=$1::uuid""",
            pipeline_id,
            {"pages_ready": page_count, "outputs": outputs, "generation_status": "queued", "generation_job_id": generation_id},
        )
    background_tasks.add_task(
        _run_generation_rest,
        request.app,
        generation_id,
        pipeline["brand_id"],
        outputs,
        [pipeline["crawl_job_id"]],
        pipeline_id,
    )
    return {
        "generation_job_id": generation_id,
        "pipeline": await pipeline_snapshot(request.app.state.db, pipeline_id, str(user.org_id)),
    }


@router.post("/{pipeline_id}/pause")
async def pause_pipeline(pipeline_id: str, request: Request, user: User = Depends(current_user)) -> dict:
    async with request.app.state.db.acquire() as connection:
        pipeline = await connection.fetchrow(
            """UPDATE pipeline_runs SET status='paused', error='Paused by user', resume_at=NULL
               WHERE id=$1::uuid AND org_id=$2::uuid AND status IN ('running','throttled')
               RETURNING current_stage,crawl_job_id""",
            pipeline_id, user.org_id,
        )
        if not pipeline:
            raise HTTPException(status_code=409, detail="This pipeline cannot be paused in its current state")
        await connection.execute(
            """UPDATE pipeline_stages SET status='paused', error='Paused by user'
               WHERE pipeline_run_id=$1::uuid AND stage=$2 AND status IN ('running','throttled')""",
            pipeline_id, pipeline["current_stage"],
        )
        if pipeline["current_stage"] == "crawl":
            await connection.execute(
                """UPDATE crawl_jobs SET status='paused', error='Paused by user', resume_at=NULL
                   WHERE id=$1::uuid AND status IN ('discovering','ready','running','throttled')""",
                pipeline["crawl_job_id"],
            )
    return {"pipeline": await pipeline_snapshot(request.app.state.db, pipeline_id, str(user.org_id))}


@router.post("/{pipeline_id}/resume")
async def resume_pipeline(
    pipeline_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    user: User = Depends(current_user),
) -> dict:
    discovery_job: tuple[str, str, dict] | None = None
    async with request.app.state.db.acquire() as connection:
        pipeline = await connection.fetchrow(
            """UPDATE pipeline_runs SET status='running', error=NULL, resume_at=NULL
               WHERE id=$1::uuid AND org_id=$2::uuid AND status='paused'
               RETURNING current_stage,crawl_job_id""",
            pipeline_id, user.org_id,
        )
        if not pipeline:
            raise HTTPException(status_code=409, detail="This pipeline is not paused")
        await connection.execute(
            """UPDATE pipeline_stages SET status='running', error=NULL
               WHERE pipeline_run_id=$1::uuid AND stage=$2 AND status='paused'""",
            pipeline_id, pipeline["current_stage"],
        )
        if pipeline["current_stage"] == "crawl":
            crawl = await connection.fetchrow(
                "SELECT start_url, options, EXISTS(SELECT 1 FROM crawl_urls WHERE job_id=$1::uuid) AS has_queue "
                "FROM crawl_jobs WHERE id=$1::uuid",
                pipeline["crawl_job_id"],
            )
            if not crawl:
                raise HTTPException(status_code=404, detail="The crawl for this pipeline no longer exists")
            crawl_status = "running" if crawl["has_queue"] else "discovering"
            await connection.execute(
                """UPDATE crawl_jobs SET status=$2, error=NULL, resume_at=NULL
                   WHERE id=$1::uuid AND status='paused'""",
                pipeline["crawl_job_id"], crawl_status,
            )
            if not crawl["has_queue"]:
                discovery_job = (
                    str(pipeline["crawl_job_id"]),
                    str(crawl["start_url"]),
                    decode_jsonb(crawl["options"]),
                )
    if discovery_job:
        job_id, start_url, options = discovery_job
        background_tasks.add_task(discover_job, request.app, job_id, user.org_id, start_url, options)
    return {"pipeline": await pipeline_snapshot(request.app.state.db, pipeline_id, str(user.org_id))}


@router.post("/{pipeline_id}/cancel")
async def cancel_pipeline(pipeline_id: str, request: Request, user: User = Depends(current_user)) -> dict:
    async with request.app.state.db.acquire() as connection:
        pipeline = await connection.fetchrow(
            """UPDATE pipeline_runs SET status='cancelled', error='Stopped by user', resume_at=NULL
               WHERE id=$1::uuid AND org_id=$2::uuid AND status IN ('running','paused','throttled')
               RETURNING crawl_job_id""",
            pipeline_id, user.org_id,
        )
        if not pipeline:
            raise HTTPException(status_code=409, detail="This pipeline has already finished")
        await connection.execute(
            """UPDATE pipeline_stages SET status='cancelled', error='Stopped by user', finished_at=now()
               WHERE pipeline_run_id=$1::uuid AND status IN ('queued','running','paused','throttled','waiting_review')""",
            pipeline_id,
        )
        await connection.execute(
            """UPDATE crawl_jobs SET status='cancelled', error='Stopped by user', resume_at=NULL
               WHERE id=$1::uuid AND status IN ('discovering','ready','running','paused','throttled')""",
            pipeline["crawl_job_id"],
        )
    return {"pipeline": await pipeline_snapshot(request.app.state.db, pipeline_id, str(user.org_id))}
