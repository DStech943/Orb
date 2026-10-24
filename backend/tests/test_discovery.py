import gzip
from pathlib import Path
from urllib.parse import urlparse

import pytest

from app.scraper.discovery import Discoverer, classify_url, is_sitemap_url, normalize_url
from app.scraper.fetcher import FetchResult


def test_normalize_strips_tracking_and_shopify_variant() -> None:
    assert normalize_url("https://www.example.com/products/serum/?utm_source=mail&variant=4#review") == "https://www.example.com/products/serum"
    assert normalize_url("https://example.com/assets/logo.png") is None
    assert normalize_url("https://example.com/sitemap_products_1.xml?from=1&to=2") is None
    assert normalize_url("https://example.com/agents.md") is None
    assert is_sitemap_url("https://example.com/sitemap_products_1.xml?from=1&to=2")


def test_classify_url() -> None:
    assert classify_url("https://example.com/products/serum") == "product"
    assert classify_url("https://example.com/policies/returns") == "policy"
    assert classify_url("https://example.com/blogs/news/post") == "blog"


class FakeFetcher:
    async def fetch(self, url: str, attempts: int = 1) -> FetchResult:
        if url.endswith("robots.txt"):
            return FetchResult(url, url, 200, "text/plain", b"User-agent: *\nDisallow: /private\nSitemap: https://example.com/sitemap.xml\n")
        if url.endswith("sitemap.xml"):
            xml = b"<urlset><url><loc>https://example.com/products/serum?utm_source=a</loc></url><url><loc>https://example.com/private</loc></url></urlset>"
            return FetchResult(url, url, 200, "application/xml", gzip.compress(xml), None)
        return FetchResult(url, url, 404, "text/html", b"")


@pytest.mark.asyncio
async def test_discovery_respects_robots_and_sitemap() -> None:
    result = await Discoverer(FakeFetcher(), "OrbBot/1.0").discover("https://example.com", 20)
    values = {item.url: item for item in result.urls}
    assert values["https://example.com/products/serum"].page_type == "product"
    assert values["https://example.com/private"].allowed is False


class ShopifySitemapFetcher:
    def __init__(self) -> None:
        fixture_path = Path(__file__).parent / "fixtures"
        self.responses = {
            "https://shop.example/sitemap.xml": (fixture_path / "shopify_sitemap_index.xml").read_bytes(),
            "https://shop.example/sitemap_products_1.xml?from=1&to=2": (fixture_path / "shopify_sitemap_products.xml").read_bytes(),
            "https://shop.example/sitemap_collections_1.xml?from=1&to=2": (fixture_path / "shopify_sitemap_collections.xml").read_bytes(),
            "https://shop.example/sitemap_pages_1.xml?from=1&to=2": (fixture_path / "shopify_sitemap_pages.xml").read_bytes(),
        }
        self.calls: list[str] = []

    async def fetch(self, url: str, attempts: int = 1) -> FetchResult:
        self.calls.append(url)
        if url.endswith("robots.txt"):
            body = b"User-agent: *\nSitemap: https://shop.example/sitemap.xml\n"
            return FetchResult(url, url, 200, "text/plain", body)
        if url in self.responses:
            return FetchResult(url, url, 200, "application/xml", self.responses[url])
        return FetchResult(url, url, 404, "text/html", b"")


@pytest.mark.asyncio
async def test_shopify_sitemap_index_expands_query_children_without_storing_sitemaps() -> None:
    fetcher = ShopifySitemapFetcher()
    result = await Discoverer(fetcher, "OrbBot/1.0").discover("https://shop.example", 100)
    urls = {item.url for item in result.urls}

    assert set(fetcher.responses).issubset(fetcher.calls)
    assert "https://shop.example/products/serum" in urls
    assert "https://shop.example/collections/skincare" in urls
    assert "https://shop.example/policies/shipping" in urls
    assert all(not urlparse(url).path.lower().endswith((".xml", ".xml.gz", ".md")) for url in urls)
    assert "https://cdn.shop.example/images/serum.jpg" not in urls
    assert result.summary["sitemaps_read"] == 4
    assert result.summary["sitemaps_failed"] == 0
    assert result.summary["total_urls"] == 4
    assert result.summary["fallback_used"] is False


@pytest.mark.asyncio
async def test_sitemap_lastmod_survives_query_child_expansion() -> None:
    class LastModifiedFetcher:
        async def fetch(self, url: str, attempts: int = 1) -> FetchResult:
            if url.endswith("robots.txt"):
                return FetchResult(url, url, 200, "text/plain", b"Sitemap: https://example.com/index.xml\n")
            if url.endswith("index.xml"):
                return FetchResult(url, url, 200, "application/xml", b"""<sitemapindex>
                  <sitemap><loc>https://example.com/pages.xml?from=1&amp;to=2</loc></sitemap>
                </sitemapindex>""")
            if url.endswith("pages.xml?from=1&to=2"):
                return FetchResult(url, url, 200, "application/xml", b"""<urlset>
                  <url><loc>https://example.com/pages/faq</loc><lastmod>2026-10-01</lastmod></url>
                  <url><loc>https://example.com/agents.md</loc></url>
                  <url><loc>https://example.com/sitemap_products.xml?from=1</loc></url>
                </urlset>""")
            return FetchResult(url, url, 404, "text/html", b"")

    result = await Discoverer(LastModifiedFetcher(), "OrbBot/1.0").discover("https://example.com", 20)
    urls = {item.url: item for item in result.urls}
    assert urls["https://example.com/pages/faq"].last_modified == "2026-10-01"
    assert all(not urlparse(url).path.endswith((".xml", ".md")) for url in urls)


@pytest.mark.asyncio
async def test_no_sitemap_uses_link_fallback_even_when_policy_probe_succeeds() -> None:
    class NoSitemapFetcher:
        async def fetch(self, url: str, attempts: int = 1) -> FetchResult:
            if url.endswith("robots.txt"):
                return FetchResult(url, url, 404, "text/plain", b"")
            if url == "https://example.com/":
                return FetchResult(url, url, 200, "text/html", b'<a href="/linked">Linked page</a>')
            if url == "https://example.com/help":
                return FetchResult(url, url, 200, "text/html", b"Help")
            return FetchResult(url, url, 404, "text/html", b"")

    result = await Discoverer(NoSitemapFetcher(), "OrbBot/1.0").discover("https://example.com", 20)
    assert result.summary["fallback_used"] is True
    assert "https://example.com/linked" in {item.url for item in result.urls}
