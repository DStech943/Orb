import pytest
import respx
from httpx import Response

from app.config import Settings
from app.scraper.fetcher import FetchError, Fetcher


def settings(**values) -> Settings:
    return Settings(DATABASE_URL="postgresql://orb:orb@localhost:5432/orb", AUTH_DISABLED=True, **values)


@pytest.mark.asyncio
@respx.mock
async def test_fetcher_follows_redirect_after_each_safety_check(monkeypatch) -> None:
    checked: list[str] = []

    async def safe(url: str) -> str:
        checked.append(url)
        return url

    monkeypatch.setattr("app.scraper.fetcher.assert_public_url", safe)
    respx.get("https://example.com/first").mock(return_value=Response(302, headers={"location": "/final"}))
    respx.get("https://example.com/final").mock(return_value=Response(200, headers={"content-type": "text/html"}, text="<p>ok</p>"))
    client = Fetcher(settings(MAX_ATTEMPTS=1))
    try:
        result = await client.fetch("https://example.com/first")
    finally:
        await client.close()
    assert result.final_url == "https://example.com/final"
    assert checked == ["https://example.com/first", "https://example.com/final"]


@pytest.mark.asyncio
@respx.mock
async def test_fetcher_rejects_oversized_response(monkeypatch) -> None:
    async def safe(url: str) -> str:
        return url

    monkeypatch.setattr("app.scraper.fetcher.assert_public_url", safe)
    respx.get("https://example.com/large").mock(return_value=Response(200, content=b"0123456789"))
    client = Fetcher(settings(MAX_HTML_BYTES=5, MAX_ATTEMPTS=1))
    try:
        with pytest.raises(FetchError):
            await client.fetch("https://example.com/large")
    finally:
        await client.close()
