"""Orb's standalone, Postgres-backed crawling API."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.crawls import router as crawls_router
from app.api.knowledge import router as knowledge_router
from app.config import get_settings
from app.db import create_pool
from app.scraper.fetcher import Fetcher
from app.scraper.render import Renderer


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.db = await create_pool(settings)
    # Crawls stay in the local database; brands, Vault, and generated knowledge
    # live in Supabase when a separate connection has been configured.
    app.state.supabase_db = await create_pool(settings, settings.supabase_db_url) if settings.supabase_db_url else app.state.db
    app.state.fetcher = Fetcher(settings)
    app.state.renderer = Renderer(settings)
    try:
        yield
    finally:
        await app.state.renderer.close()
        await app.state.fetcher.close()
        if app.state.supabase_db is not app.state.db:
            await app.state.supabase_db.close()
        await app.state.db.close()


settings = get_settings()
app = FastAPI(title="Orb crawler API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(crawls_router)
app.include_router(knowledge_router)


@app.get("/healthz")
@app.get("/health")
async def health(request: Request) -> dict[str, bool]:
    await request.app.state.db.fetchval("SELECT 1")
    return {"ok": True}
