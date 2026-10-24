from __future__ import annotations

import asyncio

from app.config import Settings
from app.scraper.safety import UnsafeUrl, assert_public_url


class RenderUnavailable(RuntimeError):
    pass


class Renderer:
    """Lazy Playwright renderer. It is never started unless explicitly enabled."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._playwright = None
        self._browser = None
        self._pages = asyncio.Semaphore(3)

    async def close(self) -> None:
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
        self._browser = None
        self._playwright = None

    async def _get_browser(self):
        if not self.settings.enable_js_render:
            raise RenderUnavailable("Javascript rendering is disabled")
        if self._browser is None:
            from playwright.async_api import async_playwright

            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(headless=True)
        return self._browser

    async def render(self, value: str) -> str:
        url = await assert_public_url(value)
        browser = await self._get_browser()
        async with self._pages:
            page = await browser.new_page()
            try:
                async def guard(route):
                    request = route.request
                    if request.resource_type in {"image", "font", "media"}:
                        await route.abort()
                        return
                    try:
                        await assert_public_url(request.url)
                    except UnsafeUrl:
                        await route.abort()
                        return
                    await route.continue_()

                await page.route("**/*", guard)
                await page.goto(url, wait_until="networkidle", timeout=30_000)
                return await page.content()
            finally:
                await page.close()
