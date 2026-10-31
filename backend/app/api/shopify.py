"""Authenticated Shopify Admin imports for stores that block storefront crawlers."""
from __future__ import annotations

import hashlib

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, model_validator

from app.auth import User, current_user
from app.pipeline import advance_completed_crawl, create_crawl_pipeline
from app.scraper.shopify import ShopifyAdminUnavailable, admin_domain, list_admin_resources

router = APIRouter(prefix="/api/shopify", tags=["shopify"])


class ShopifyImport(BaseModel):
    brand_id: str | None = None
    maximum: int = Field(default=250, ge=1, le=250)
    domain: str | None = Field(default=None, max_length=255)
    access_token: str | None = Field(default=None, min_length=1, max_length=512)
    outputs: list[str] = Field(default_factory=lambda: ["sops", "faqs", "products"])

    @model_validator(mode="after")
    def credentials_are_complete(self) -> "ShopifyImport":
        if bool(self.domain) != bool(self.access_token):
            raise ValueError("Provide both Shopify domain and access token, or leave both empty to use server credentials")
        if self.domain:
            admin_domain(self.domain)
        return self


async def _run_import(app, job_id: str, org_id: str, maximum: int, domain: str | None, access_token: str | None) -> None:
    pool: asyncpg.Pool = app.state.db
    try:
        resources = await list_admin_resources(app.state.settings, maximum, domain=domain, access_token=access_token)
        async with pool.acquire() as connection:
            async with connection.transaction():
                job = await connection.fetchrow("SELECT brand_id,start_url,status FROM crawl_jobs WHERE id=$1::uuid FOR UPDATE", job_id)
                if not job or job["status"] != "running":
                    return
                source = await connection.fetchrow(
                    """INSERT INTO source_records (org_id,brand_id,pipeline_run_id,kind,title,source_url)
                       SELECT org_id,brand_id,id,'shopify','Shopify Admin API import',$2 FROM pipeline_runs
                       WHERE crawl_job_id=$1::uuid RETURNING id::text""",
                    job_id, job["start_url"],
                )
                await connection.executemany(
                    """INSERT INTO pages (org_id,url,canonical_url,title,text,structured,content_hash,http_status,rendered_with,needs_parse,last_job_id,fetched_at)
                       VALUES ($1::uuid,$2,$2,$3,$4,$5::jsonb,$6,200,'shopify_api',false,$7::uuid,now())
                       ON CONFLICT (org_id,url) DO UPDATE SET canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,
                         text=EXCLUDED.text,structured=EXCLUDED.structured,content_hash=EXCLUDED.content_hash,http_status=200,
                         rendered_with='shopify_api',needs_parse=false,last_job_id=EXCLUDED.last_job_id,fetched_at=now()""",
                    [
                        (org_id, item.url, item.title, item.text, {**item.structured, "page_type": item.page_type, "source_record_id": source["id"]},
                         hashlib.sha256(item.text.encode("utf-8")).hexdigest(), job_id)
                        for item in resources
                    ],
                )
                await connection.execute("UPDATE crawl_jobs SET status='done',error=NULL,resume_at=NULL WHERE id=$1::uuid", job_id)
                await advance_completed_crawl(connection, job_id)
    except Exception as exc:
        async with pool.acquire() as connection:
            await connection.execute("UPDATE crawl_jobs SET status='failed',error=$2 WHERE id=$1::uuid", job_id, str(exc)[:2000])
            await connection.execute("UPDATE pipeline_runs SET status='failed',error=$2 WHERE crawl_job_id=$1::uuid", job_id, str(exc)[:2000])
            await connection.execute(
                """UPDATE pipeline_stages SET status='failed',error=$2 WHERE pipeline_run_id IN
                   (SELECT id FROM pipeline_runs WHERE crawl_job_id=$1::uuid) AND stage='crawl'""",
                job_id, str(exc)[:2000],
            )


async def _enqueue_import(
    payload: ShopifyImport, background_tasks: BackgroundTasks, request: Request, user: User,
) -> dict:
    settings = request.app.state.settings
    domain = payload.domain or settings.shopify_the_dearist_domain
    access_token = payload.access_token or settings.shopify_the_dearist_token
    if not domain or not access_token:
        raise HTTPException(status_code=503, detail="Shopify Admin credentials are not configured on the server")
    store_domain = admin_domain(domain)
    outputs = [item for item in dict.fromkeys(payload.outputs) if item in {"sops", "faqs", "products"}]
    if not outputs:
        raise HTTPException(status_code=422, detail="Select at least one output")
    options = {"catalog_source": "shopify_admin", "maximum": payload.maximum, "outputs": outputs}
    async with request.app.state.db.acquire() as connection:
        job = await connection.fetchrow(
            """INSERT INTO crawl_jobs (org_id,start_url,brand_id,status,options)
               VALUES ($1::uuid,$2,$3::uuid,'running',$4::jsonb) RETURNING *""",
            user.org_id, f"https://{store_domain}", payload.brand_id, options,
        )
        pipeline_id = await create_crawl_pipeline(
            connection, org_id=str(user.org_id), brand_id=payload.brand_id, crawl_job_id=str(job["id"]),
            options=options, source_kind="shopify",
        )
        await connection.execute("UPDATE crawl_jobs SET options=$2::jsonb WHERE id=$1::uuid", job["id"], {**options, "pipeline_id": pipeline_id})
    # The token is kept only in this in-memory background task; it is never stored in Postgres or returned to the client.
    background_tasks.add_task(_run_import, request.app, str(job["id"]), str(user.org_id), payload.maximum, store_domain, access_token)
    return {"crawl_job_id": str(job["id"]), "pipeline_id": pipeline_id, "source": "shopify_admin", "domain": store_domain}


@router.post("/import", status_code=status.HTTP_202_ACCEPTED)
async def import_shopify(
    payload: ShopifyImport, background_tasks: BackgroundTasks, request: Request, user: User = Depends(current_user),
) -> dict:
    return await _enqueue_import(payload, background_tasks, request, user)


@router.post("/the-dearist/import", status_code=status.HTTP_202_ACCEPTED)
async def import_the_dearist(
    payload: ShopifyImport, background_tasks: BackgroundTasks, request: Request, user: User = Depends(current_user),
) -> dict:
    """Backwards-compatible route for the preconfigured The Dearist integration."""
    return await _enqueue_import(payload, background_tasks, request, user)
