"""Orb's standalone, Postgres-backed crawling API."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.crawls import router as crawls_router
from app.api.knowledge import router as knowledge_router
from app.api.pipelines import router as pipelines_router
from app.api.shopify import router as shopify_router
from app.config import get_settings
from app.db import create_pool
from app.scraper.fetcher import Fetcher
from app.scraper.render import Renderer


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.db = await create_pool(settings)
    # Keep startup independent of the optional brand-content database. A
    # slow/unreachable Supabase connection must not make crawling, dashboard
    # polling, or health checks unavailable. Generation opens this pool only
    # when a generation request is made.
    app.state.supabase_db = app.state.db
    app.state.generation_db = None
    app.state.generation_db_lock = asyncio.Lock()
    app.state.fetcher = Fetcher(settings)
    app.state.renderer = Renderer(settings)
    try:
        yield
    finally:
        await app.state.renderer.close()
        await app.state.fetcher.close()
        if app.state.generation_db is not None:
            await app.state.generation_db.close()
        await app.state.db.close()


settings = get_settings()
app = FastAPI(title="Orb crawler API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(crawls_router)
app.include_router(knowledge_router)
app.include_router(pipelines_router)
app.include_router(shopify_router)


@app.get("/healthz")
@app.get("/health")
async def health(request: Request) -> dict[str, bool]:
    await request.app.state.db.fetchval("SELECT 1")
    return {"ok": True}
