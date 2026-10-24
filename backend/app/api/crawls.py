from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, model_validator

from app.auth import User, current_user
from app.db import decode_jsonb
from app.scraper.discovery import Discoverer

router = APIRouter(prefix="/api/crawls", tags=["crawls"])


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CrawlCreate(RequestModel):
    url: AnyHttpUrl | None = None
    start_url: AnyHttpUrl | None = None
    max_pages: int = Field(200, ge=1)
    catalog_source: Literal["crawl", "external"] = "crawl"
    brand_id: str | None = None

    @model_validator(mode="after")
    def one_url(self) -> "CrawlCreate":
        if self.url is None and self.start_url is None:
            raise ValueError("url or start_url is required")
        if self.url is not None and self.start_url is not None and str(self.url) != str(self.start_url):
            raise ValueError("url and start_url must match when both are provided")
        return self

    @property
    def crawl_url(self) -> str:
        return str(self.url or self.start_url)


class UrlSelection(RequestModel):
    urls: list[str] = Field(min_length=1)
    selected: bool


class StartCrawl(RequestModel):
    page_types: list[Literal["product", "collection", "blog", "policy", "page", "other"]] | None = None
    max_pages: int = Field(100, ge=1)
    include: list[str] = Field(default_factory=list)
    exclude: list[str] = Field(default_factory=list)


class JobOut(BaseModel):
    id: str
    org_id: str
    start_url: str
    status: str
    error: str | None
    crawl_delay: float | None
    options: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class UrlOut(BaseModel):
    url: str
    page_type: str
    selected: bool
    status: str
    attempts: int
    throttled_count: int
    error: str | None
    http_status: int | None
    retry_after: datetime | None


class UrlListOut(BaseModel):
    items: list[UrlOut]
    total: int


class PageOut(BaseModel):
    url: str
    title: str | None
    text_length: int
    rendered_with: str | None
    needs_parse: bool
    fetched_at: datetime


class PageListOut(BaseModel):
    items: list[PageOut]
    total: int


class JobDetailOut(JobOut):
    progress: dict[str, int]
    discovered_by_type: dict[str, int]


def _job_out(record: asyncpg.Record) -> JobOut:
    values = dict(record)
    values["id"] = str(values["id"])
    values["org_id"] = str(values["org_id"])
    values["options"] = decode_jsonb(values.get("options"))
    return JobOut(**values)


async def _owned_job(pool: asyncpg.Pool, job_id: str, user: User) -> asyncpg.Record:
    async with pool.acquire() as connection:
        job = await connection.fetchrow("SELECT * FROM crawl_jobs WHERE id = $1::uuid AND org_id = $2::uuid", job_id, user.org_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crawl job not found")
    return job


async def discover_job(app, job_id: str, org_id: str, start_url: str, options: dict[str, Any]) -> None:
    pool: asyncpg.Pool = app.state.db
    try:
        max_pages = min(int(options.get("max_pages", 200)), app.state.settings.max_pages_hard_limit)
        discoverer = Discoverer(app.state.fetcher, app.state.settings.user_agent)
        result = await discoverer.discover(start_url, max_pages)
        discovered_options = {**options, "discovery": result.summary}
        async with pool.acquire() as connection:
            async with connection.transaction():
                job_is_active = await connection.fetchval(
                    "SELECT status = 'discovering' FROM crawl_jobs WHERE id = $1::uuid AND org_id = $2::uuid FOR UPDATE",
                    job_id,
                    org_id,
                )
                if not job_is_active:
                    return
                await connection.executemany(
                    """
                    INSERT INTO crawl_urls (job_id, url, page_type, selected, status, error, last_modified)
                    VALUES ($1::uuid, $2, $3, false, $4, $5, $6)
                    ON CONFLICT (job_id, url) DO NOTHING
                    """,
                    [
                        (job_id, item.url, item.page_type, "pending" if item.allowed else "skipped", item.reason, item.last_modified)
                        for item in result.urls
                    ],
                )
                await connection.execute(
                    "UPDATE crawl_jobs SET start_url = $2, crawl_delay = $3, options = $4::jsonb, status = 'ready', error = NULL WHERE id = $1::uuid",
                    job_id,
                    result.start_url,
                    result.crawl_delay,
                    discovered_options,
                )

    except Exception as exc:
        async with pool.acquire() as connection:
            await connection.execute(
                "UPDATE crawl_jobs SET status = 'failed', error = $2 WHERE id = $1::uuid AND status = 'discovering'",
                job_id,
                str(exc)[:2000],
            )


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_crawl(payload: CrawlCreate, background_tasks: BackgroundTasks, request: Request, user: User = Depends(current_user)) -> JobOut:
    options = {
        "max_pages": min(payload.max_pages, request.app.state.settings.max_pages_hard_limit),
        "catalog_source": payload.catalog_source,
    }
    async with request.app.state.db.acquire() as connection:
        job = await connection.fetchrow(
            """
            INSERT INTO crawl_jobs (org_id, start_url, options, brand_id)
            VALUES ($1::uuid, $2, $3::jsonb, $4::uuid)
            RETURNING *
            """,
            user.org_id,
            payload.crawl_url, options, payload.brand_id,
        )
    background_tasks.add_task(discover_job, request.app, str(job["id"]), user.org_id, payload.crawl_url, options)
    return _job_out(job)


@router.get("", response_model=list[JobOut])
async def list_crawls(request: Request, user: User = Depends(current_user)) -> list[JobOut]:
    async with request.app.state.db.acquire() as connection:
        rows = await connection.fetch("SELECT * FROM crawl_jobs WHERE org_id = $1::uuid ORDER BY created_at DESC", user.org_id)
    return [_job_out(row) for row in rows]


@router.get("/{job_id}", response_model=JobDetailOut)
async def get_crawl(job_id: str, request: Request, user: User = Depends(current_user)) -> JobDetailOut:
    job = _job_out(await _owned_job(request.app.state.db, job_id, user))
    async with request.app.state.db.acquire() as connection:
        status_rows = await connection.fetch("SELECT status, count(*) AS count FROM crawl_urls WHERE job_id=$1::uuid GROUP BY status", job_id)
        type_rows = await connection.fetch("SELECT page_type, count(*) AS count FROM crawl_urls WHERE job_id=$1::uuid GROUP BY page_type", job_id)
        throttled = await connection.fetchval("SELECT count(*) FROM crawl_urls WHERE job_id=$1::uuid AND status='pending' AND throttled_count > 0", job_id)
    progress = {key: 0 for key in ("pending", "processing", "done", "failed", "skipped", "throttled")}
    progress.update({row["status"]: row["count"] for row in status_rows})
    progress["throttled"] = throttled
    return JobDetailOut(**job.model_dump(), progress=progress, discovered_by_type={row["page_type"]: row["count"] for row in type_rows})


@router.get("/{job_id}/urls", response_model=UrlListOut)
async def list_urls(
    job_id: str,
    request: Request,
    user: User = Depends(current_user),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status_filter: str | None = Query(default=None, alias="status"),
    page_type: str | None = None,
) -> UrlListOut:
    await _owned_job(request.app.state.db, job_id, user)
    async with request.app.state.db.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT url, page_type, selected, status, attempts, throttled_count, error, http_status, retry_after
            FROM crawl_urls WHERE job_id = $1::uuid AND ($2::text IS NULL OR status = $2) AND ($3::text IS NULL OR page_type = $3)
            ORDER BY page_type, url LIMIT $4 OFFSET $5
            """,
            job_id,
            status_filter, page_type, limit, offset,
        )
        total = await connection.fetchval("SELECT count(*) FROM crawl_urls WHERE job_id = $1::uuid AND ($2::text IS NULL OR status = $2) AND ($3::text IS NULL OR page_type = $3)", job_id, status_filter, page_type)
    return UrlListOut(items=[UrlOut(**dict(row)) for row in rows], total=total)


@router.patch("/{job_id}/urls", status_code=status.HTTP_204_NO_CONTENT)
async def select_urls(job_id: str, payload: UrlSelection, request: Request, user: User = Depends(current_user)) -> Response:
    await _owned_job(request.app.state.db, job_id, user)
    async with request.app.state.db.acquire() as connection:
        await connection.execute(
            "UPDATE crawl_urls SET selected = $3 WHERE job_id = $1::uuid AND url = ANY($2::text[])",
            job_id,
            payload.urls,
            payload.selected,
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{job_id}/pages", response_model=PageListOut)
async def list_pages(
    job_id: str,
    request: Request,
    user: User = Depends(current_user),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> PageListOut:
    await _owned_job(request.app.state.db, job_id, user)
    async with request.app.state.db.acquire() as connection:
        rows = await connection.fetch(
            "SELECT url,title,length(coalesce(text,'')) AS text_length,rendered_with,needs_parse,fetched_at FROM pages WHERE last_job_id=$1::uuid ORDER BY fetched_at DESC LIMIT $2 OFFSET $3",
            job_id, limit, offset,
        )
        total = await connection.fetchval("SELECT count(*) FROM pages WHERE last_job_id=$1::uuid", job_id)
    return PageListOut(items=[PageOut(**dict(row)) for row in rows], total=total)


@router.post("/{job_id}/start", response_model=JobOut)
async def start_crawl(job_id: str, request: Request, payload: StartCrawl | None = None, user: User = Depends(current_user)) -> JobOut:
    owned = await _owned_job(request.app.state.db, job_id, user)
    options = decode_jsonb(owned["options"])
    catalog_external = isinstance(options, dict) and options.get("catalog_source") == "external"
    async with request.app.state.db.acquire() as connection:
        selected = await connection.fetchval("SELECT count(*) FROM crawl_urls WHERE job_id = $1::uuid AND selected AND status = 'pending'", job_id)
        if payload is not None or not selected:
            defaults = ["policy", "page", "blog"]
            page_types = payload.page_types if payload and payload.page_types is not None else defaults
            if catalog_external and payload is None:
                page_types = [page_type for page_type in page_types if page_type not in {"product", "collection"}]
            maximum = payload.max_pages if payload else 100
            include = payload.include if payload else []
            exclude = payload.exclude if payload else []
            rows = await connection.fetch(
                "SELECT url, page_type FROM crawl_urls WHERE job_id=$1::uuid AND status='pending' ORDER BY CASE page_type WHEN 'policy' THEN 1 WHEN 'page' THEN 2 WHEN 'blog' THEN 3 WHEN 'product' THEN 4 WHEN 'collection' THEN 5 ELSE 6 END, url",
                job_id,
            )
            chosen = [
                row["url"] for row in rows
                if row["page_type"] in page_types
                and (not include or any(term.lower() in row["url"].lower() for term in include))
                and not any(term.lower() in row["url"].lower() for term in exclude)
            ][:maximum]
            await connection.execute("UPDATE crawl_urls SET selected=false WHERE job_id=$1::uuid AND status='pending'", job_id)
            if chosen:
                await connection.execute("UPDATE crawl_urls SET selected=true WHERE job_id=$1::uuid AND url = ANY($2::text[])", job_id, chosen)
            selected = len(chosen)
        if not selected:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Select at least one pending URL before starting")
        job = await connection.fetchrow(
            "UPDATE crawl_jobs SET status = 'running', error = NULL WHERE id = $1::uuid AND status IN ('ready', 'done') RETURNING *",
            job_id,
        )
    if not job:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This crawl cannot be started in its current state")
    return _job_out(job)


@router.post("/{job_id}/retry-failed", response_model=JobOut)
async def retry_failed(job_id: str, request: Request, user: User = Depends(current_user)) -> JobOut:
    await _owned_job(request.app.state.db, job_id, user)
    async with request.app.state.db.acquire() as connection:
        await connection.execute(
            "UPDATE crawl_urls SET status = 'pending', attempts = 0, throttled_count = 0, error = NULL, retry_after = NULL WHERE job_id = $1::uuid AND selected AND status = 'failed'",
            job_id,
        )
        job = await connection.fetchrow("UPDATE crawl_jobs SET status = 'running', error = NULL WHERE id = $1::uuid RETURNING *", job_id)
    return _job_out(job)


@router.post("/{job_id}/cancel", response_model=JobOut)
async def cancel_crawl(job_id: str, request: Request, user: User = Depends(current_user)) -> JobOut:
    await _owned_job(request.app.state.db, job_id, user)
    async with request.app.state.db.acquire() as connection:
        job = await connection.fetchrow(
            "UPDATE crawl_jobs SET status = 'cancelled' WHERE id = $1::uuid AND status IN ('discovering', 'ready', 'running') RETURNING *",
            job_id,
        )
    if not job:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This crawl has already finished")
    return _job_out(job)
