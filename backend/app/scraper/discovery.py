from __future__ import annotations

import gzip
import html
import logging
import re
import xml.etree.ElementTree as element_tree
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

from selectolax.parser import HTMLParser

from app.scraper.fetcher import FetchError, Fetcher
from app.scraper.safety import UnsafeUrl, is_same_site

_TRACKING_KEYS = {"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_", "source"}
_BLOCKED_EXTENSIONS = re.compile(r"\.(?:7z|avi|css|csv|docx?|gif|gz|ico|jpe?g|js|json|mp3|mp4|pdf|png|rar|svg|tar|webm|webp|woff2?|xlsx?|zip)$", re.I)
_PRIVATE_PATHS = re.compile(r"/(?:account|admin|api|cart|checkout|login|my-account|order-status|password|search|track|wishlist)(?:/|$)", re.I)
_POLICY_WORDS = ("faq", "help", "support", "contact", "return", "returns", "exchange", "refund", "shipping", "warranty", "privacy", "terms", "size-guide", "care", "ingredients", "policy")
_POLICY_PROBES = ("/policies/shipping", "/policies/returns", "/pages/faq", "/faq", "/faqs", "/help", "/support", "/contact", "/shipping", "/returns", "/refund-policy", "/privacy-policy", "/terms")
logger = logging.getLogger(__name__)


class DiscoveryThrottled(RuntimeError):
    """A host told us to slow down while discovering its site."""

    def __init__(self, host: str, retry_after: float, status_code: int) -> None:
        self.host = host
        self.retry_after = max(1.0, retry_after)
        self.status_code = status_code
        super().__init__(f"{host} returned HTTP {status_code}; discovery resumes automatically")


@dataclass(frozen=True, slots=True)
class DiscoveredUrl:
    url: str
    page_type: str
    allowed: bool
    reason: str | None = None
    last_modified: str | None = None


@dataclass(slots=True)
class DiscoveryResult:
    start_url: str
    crawl_delay: float | None
    urls: list[DiscoveredUrl]
    summary: dict[str, Any]


def is_sitemap_url(value: str) -> bool:
    """Identify sitemap documents from their path without touching queries."""
    return urlparse(value).path.lower().endswith((".xml", ".xml.gz"))


def normalize_url(value: str, base_url: str | None = None) -> str | None:
    try:
        parsed = urlsplit(urljoin(base_url or value, value))
    except ValueError:
        return None
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return None
    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    if is_sitemap_url(value) or path.lower().endswith((".md", ".json", ".txt")) or _BLOCKED_EXTENSIONS.search(path) or _PRIVATE_PATHS.search(path):
        return None
    query = [
        (key, item)
        for key, item in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in _TRACKING_KEYS and not key.lower().startswith("utm_")
    ]
    # Shopify variants and pagination do not make distinct knowledge pages.
    if path.startswith(("/products/", "/collections/")):
        query = []
    host = parsed.hostname.lower()
    if parsed.port and parsed.port not in {80, 443}:
        host = f"{host}:{parsed.port}"
    return urlunsplit((parsed.scheme.lower(), host, path.rstrip("/") or "/", urlencode(query, doseq=True), ""))


def classify_url(url: str) -> str:
    path = urlsplit(url).path.lower()
    if "/products/" in path:
        return "product"
    if "/collections/" in path:
        return "collection"
    if any(part in path for part in ("/blog", "/blogs/", "/articles/", "/news/")):
        return "blog"
    if "/pages/faqs" in path or any(word in path for word in _POLICY_WORDS):
        return "policy"
    if path in {"", "/"} or path.count("/") <= 3:
        return "page"
    return "other"


def _sitemap_document(data: bytes) -> tuple[bool, list[tuple[str, str | None]]]:
    """Return whether data is a sitemap index and its direct URL locations.

    Image/video sitemap extension locations are deliberately excluded: they are
    metadata about a page, not pages or child sitemap documents to crawl.
    """
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    try:
        root = element_tree.fromstring(data)
    except element_tree.ParseError:
        return False, []
    root_name = root.tag.rsplit("}", 1)[-1].lower()
    is_index = root_name == "sitemapindex"
    expected_parent = "sitemap" if is_index else "url"
    locations: list[tuple[str, str | None]] = []
    for parent in root:
        if parent.tag.rsplit("}", 1)[-1].lower() != expected_parent:
            continue
        location: str | None = None
        last_modified: str | None = None
        for node in parent:
            node_name = node.tag.rsplit("}", 1)[-1].lower()
            if node_name == "loc" and node.text and node.text.strip():
                location = node.text.strip()
            elif node_name == "lastmod" and node.text and node.text.strip():
                last_modified = node.text.strip()
        if location:
            locations.append((location, last_modified))
    return is_index, locations


def _sitemap_request_url(value: str, base_url: str) -> str | None:
    """Resolve only HTML entities for a sitemap URL; preserve its query exactly."""
    resolved = html.unescape(urljoin(base_url, value.strip()))
    parsed = urlsplit(resolved)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return None
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))


def _page_links(html: str, base_url: str) -> list[str]:
    document = HTMLParser(html)
    return [node.attributes["href"] for node in document.css("a[href]") if node.attributes.get("href")]


class Discoverer:
    def __init__(self, fetcher: Fetcher, user_agent: str, pool: Any | None = None) -> None:
        self.fetcher = fetcher
        self.user_agent = user_agent
        self.pool = pool

    async def _cached_response(self, url: str, kind: str):
        if self.pool is None:
            return None
        async with self.pool.acquire() as connection:
            cached = await connection.fetchrow(
                "SELECT status_code,body_gz FROM discovery_cache WHERE url=$1 AND kind=$2 AND expires_at>now()",
                url, kind,
            )
        if not cached:
            return None
        from app.scraper.fetcher import FetchResult
        return FetchResult(url=url, final_url=url, status_code=cached["status_code"], content_type="application/xml", body=gzip.decompress(bytes(cached["body_gz"])))

    async def _host_is_parked(self, url: str) -> None:
        if self.pool is None:
            return
        host = (urlsplit(url).hostname or "").lower()
        async with self.pool.acquire() as connection:
            row = await connection.fetchrow("SELECT resume_at,http_status FROM host_cooldowns WHERE host=$1 AND resume_at>now()", host)
        if row:
            seconds = max(1.0, (row["resume_at"] - row["resume_at"].now(row["resume_at"].tzinfo)).total_seconds())
            raise DiscoveryThrottled(host, seconds, row["http_status"] or 429)

    async def _cache_response(self, url: str, kind: str, response: Any) -> None:
        if self.pool is None or not 200 <= response.status_code < 300:
            return
        async with self.pool.acquire() as connection:
            await connection.execute(
                """INSERT INTO discovery_cache (url,kind,status_code,body_gz,expires_at)
                   VALUES ($1,$2,$3,$4,now()+interval '1 hour')
                   ON CONFLICT (url) DO UPDATE SET kind=EXCLUDED.kind,status_code=EXCLUDED.status_code,
                     body_gz=EXCLUDED.body_gz,expires_at=EXCLUDED.expires_at,updated_at=now()""",
                url, kind, response.status_code, gzip.compress(response.body),
            )

    async def _park_host(self, url: str, status_code: int, retry_after: float) -> None:
        if self.pool is None:
            return
        host = (urlsplit(url).hostname or "").lower()
        async with self.pool.acquire() as connection:
            await connection.execute(
                """INSERT INTO host_cooldowns (host,resume_at,http_status,reason)
                   VALUES ($1,now()+($2 * interval '1 second'),$3,'discovery rate limited')
                   ON CONFLICT (host) DO UPDATE SET resume_at=GREATEST(host_cooldowns.resume_at,EXCLUDED.resume_at),
                     http_status=EXCLUDED.http_status,reason=EXCLUDED.reason,updated_at=now()""",
                host, retry_after, status_code,
            )

    async def _fetch(self, url: str, cache_kind: str | None = None):
        """Use the shared limiter feedback path for discovery requests too."""
        await self._host_is_parked(url)
        if cache_kind:
            cached = await self._cached_response(url, cache_kind)
            if cached:
                return cached
        response = await self.fetcher.fetch(url, attempts=1)
        note_response = getattr(self.fetcher, "note_response", None)
        cooldown = None
        if note_response is not None:
            cooldown = await note_response(response)
        if response.status_code in {429, 503}:
            retry_after = max(cooldown or 0, response.retry_after or 0, 1.0)
            await self._park_host(url, response.status_code, retry_after)
            raise DiscoveryThrottled((urlsplit(url).hostname or "").lower(), retry_after, response.status_code)
        if cache_kind:
            await self._cache_response(url, cache_kind, response)
        return response

    async def _robots(self, start_url: str) -> tuple[RobotFileParser, list[str], float | None]:
        robots_url = urljoin(start_url, "/robots.txt")
        parser = RobotFileParser()
        parser.set_url(robots_url)
        sitemap_urls: list[str] = []
        delay: float | None = None
        try:
            response = await self._fetch(robots_url, "robots")
            if 200 <= response.status_code < 300:
                content = response.text
                parser.parse(content.splitlines())
                parser.modified()
                robots_delay = parser.crawl_delay(self.user_agent) or parser.crawl_delay("*")
                delay = min(10.0, float(robots_delay)) if robots_delay is not None else None
                sitemap_urls = [line.split(":", 1)[1].strip() for line in content.splitlines() if line.lower().startswith("sitemap:")]
            else:
                parser.parse([])
        except (FetchError, UnsafeUrl):
            parser.parse([])
        return parser, sitemap_urls, delay

    async def _walk_sitemaps(self, sitemap_urls: list[str], start_url: str, limit: int) -> tuple[list[tuple[str, str | None]], dict[str, Any]]:
        found: list[tuple[str, str | None]] = []
        queue = list(sitemap_urls)
        seen: set[str] = set()
        summary: dict[str, Any] = {"sitemaps_read": 0, "sitemaps_failed": 0, "total_urls": 0, "sitemaps": []}
        max_sitemaps = 80
        while queue and len(seen) < max_sitemaps and len(found) < limit * 3:
            sitemap = _sitemap_request_url(queue.pop(0), start_url)
            if not sitemap or sitemap in seen or not is_same_site(sitemap, start_url):
                continue
            seen.add(sitemap)
            try:
                response = await self._fetch(sitemap, "sitemap")
                if not 200 <= response.status_code < 300:
                    summary["sitemaps_failed"] += 1
                    summary["sitemaps"].append({"url": sitemap, "status": response.status_code, "bytes": len(response.body), "entries": 0, "error": None})
                    logger.warning(
                        "Sitemap fetch failed url=%s status=%s bytes=%s loc_entries=0 exception=None",
                        sitemap,
                        response.status_code,
                        len(response.body),
                    )
                    continue
                is_index, locations = _sitemap_document(response.body)
                summary["sitemaps_read"] += 1
                summary["sitemaps"].append({"url": sitemap, "status": response.status_code, "bytes": len(response.body), "entries": len(locations), "error": None})
                logger.info(
                    "Sitemap fetched url=%s status=%s bytes=%s loc_entries=%s exception=None",
                    sitemap,
                    response.status_code,
                    len(response.body),
                    len(locations),
                )
            except (FetchError, UnsafeUrl, OSError) as exc:
                summary["sitemaps_failed"] += 1
                summary["sitemaps"].append({"url": sitemap, "status": None, "bytes": 0, "entries": 0, "error": str(exc)})
                logger.warning("Sitemap fetch failed url=%s status=None bytes=0 loc_entries=0 exception=%s", sitemap, exc)
                continue
            for location, last_modified in locations:
                if is_index:
                    child_sitemap = _sitemap_request_url(location, sitemap)
                    if child_sitemap and is_same_site(child_sitemap, start_url):
                        queue.append(child_sitemap)
                    continue
                if is_sitemap_url(location):
                    child_sitemap = _sitemap_request_url(location, sitemap)
                    if child_sitemap and is_same_site(child_sitemap, start_url):
                        queue.append(child_sitemap)
                    continue
                normalized = normalize_url(html.unescape(location), sitemap)
                if not normalized or not is_same_site(normalized, start_url):
                    continue
                else:
                    found.append((normalized, last_modified))
                    if len(found) >= limit * 3:
                        break
        summary["total_urls"] = len(found)
        return found, summary

    async def _probe_policy_paths(self, start_url: str, already_found: set[str]) -> tuple[list[str], list[dict[str, Any]]]:
        found: list[str] = []
        probes: list[dict[str, Any]] = []
        for path in _POLICY_PROBES:
            candidate = urljoin(start_url, path)
            if normalize_url(candidate, start_url) in already_found:
                continue
            try:
                response = await self._fetch(candidate)
                probes.append({"url": candidate, "status": response.status_code, "error": None})
                if response.status_code == 200:
                    normalized = normalize_url(response.final_url, start_url)
                    if normalized:
                        found.append(normalized)
            except (FetchError, UnsafeUrl, OSError) as exc:
                probes.append({"url": candidate, "status": None, "error": str(exc)})
        return found, probes

    async def discover(self, value: str, limit: int) -> DiscoveryResult:
        start_url = normalize_url(value)
        if not start_url:
            raise ValueError("Enter a valid public http(s) URL")
        limit = max(1, limit)
        robots, sitemap_urls, crawl_delay = await self._robots(start_url)
        candidates: list[tuple[str, str | None]] = [(start_url, None)]
        sitemap_candidates, summary = await self._walk_sitemaps(sitemap_urls, start_url, limit)
        candidates.extend(sitemap_candidates)
        sitemap_known = {url for url, _ in sitemap_candidates}
        probed, probes = await self._probe_policy_paths(start_url, sitemap_known)
        candidates.extend((candidate, None) for candidate in probed)
        summary["probes"] = probes
        summary["fallback_used"] = False
        # Probed policy pages are useful, but they are not a replacement for
        # a one-level link crawl when the site supplied no usable sitemap.
        if summary["sitemaps_read"] == 0:
            summary["fallback_used"] = True
            # A modest homepage fallback: enough to discover normal policy and content pages,
            # without turning a user-initiated crawl into an uncontrolled spider.
            try:
                homepage = await self._fetch(start_url)
                first_level = _page_links(homepage.text, homepage.final_url)
                for link in first_level:
                    if len(candidates) >= 200:
                        break
                    normalized = normalize_url(link, homepage.final_url)
                    if normalized and is_same_site(normalized, start_url):
                        candidates.append((normalized, None))
                for page_url, _ in list(candidates[1:])[: min(20, limit)]:
                    if len(candidates) >= 200:
                        break
                    try:
                        response = await self._fetch(page_url)
                        for link in _page_links(response.text, response.final_url):
                            if len(candidates) >= 200:
                                break
                            normalized = normalize_url(link, response.final_url)
                            if normalized and is_same_site(normalized, start_url):
                                candidates.append((normalized, None))
                    except (FetchError, UnsafeUrl):
                        continue
            except (FetchError, UnsafeUrl):
                pass

        urls: list[DiscoveredUrl] = []
        unique: set[str] = set()
        for candidate, sitemap_last_modified in candidates:
            normalized = normalize_url(candidate, start_url)
            if not normalized or normalized in unique or not is_same_site(normalized, start_url):
                continue
            unique.add(normalized)
            allowed = robots.can_fetch(self.user_agent, normalized)
            urls.append(DiscoveredUrl(normalized, classify_url(normalized), allowed, None if allowed else "Blocked by robots.txt", sitemap_last_modified))
            if len(urls) >= limit:
                break
        summary["total_urls"] = len(urls)
        return DiscoveryResult(start_url=start_url, crawl_delay=crawl_delay, urls=urls, summary=summary)
