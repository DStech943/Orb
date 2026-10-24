"""Process entry point for the independent Postgres queue worker."""
from __future__ import annotations

import asyncio

from app.config import get_settings
from app.db import create_pool
from app.scraper.fetcher import Fetcher
from app.scraper.render import Renderer
from app.scraper.worker import worker_main


async def main() -> None:
    settings = get_settings()
    pool = await create_pool(settings)
    fetcher = Fetcher(settings)
    renderer = Renderer(settings)
    try:
        await worker_main(pool, fetcher, renderer, settings)
    finally:
        await renderer.close()
        await fetcher.close()
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
