"""Polling endpoints for durable source-to-review pipeline runs."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.auth import User, current_user
from app.pipeline import pipeline_snapshot

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
async def resume_pipeline(pipeline_id: str, request: Request, user: User = Depends(current_user)) -> dict:
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
            await connection.execute(
                """UPDATE crawl_jobs SET status='running', error=NULL, resume_at=NULL
                   WHERE id=$1::uuid AND status='paused'""",
                pipeline["crawl_job_id"],
            )
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
