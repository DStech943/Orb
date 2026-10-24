from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit, urlunsplit


class UnsafeUrl(ValueError):
    """Raised when a URL could reach a local or otherwise unsafe network."""


def canonical_http_url(value: str) -> str:
    """Return a safe, normalized HTTP URL without a fragment."""
    parsed = urlsplit(value.strip())
    if parsed.scheme.lower() not in {"http", "https"}:
        raise UnsafeUrl("Only http and https URLs are allowed")
    if not parsed.hostname:
        raise UnsafeUrl("URL must include a hostname")
    if parsed.username or parsed.password:
        raise UnsafeUrl("Credentials in crawl URLs are not allowed")
    return urlunsplit((parsed.scheme.lower(), parsed.netloc, parsed.path or "/", parsed.query, ""))


async def assert_public_url(value: str) -> str:
    """Resolve a host and reject private, loopback, and link-local addresses."""
    url = canonical_http_url(value)
    parsed = urlsplit(url)
    assert parsed.hostname is not None
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        info = await asyncio.get_running_loop().getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeUrl("Could not resolve URL hostname") from exc

    addresses = {result[4][0] for result in info}
    if not addresses:
        raise UnsafeUrl("Could not resolve URL hostname")
    for address in addresses:
        try:
            if not ipaddress.ip_address(address).is_global:
                raise UnsafeUrl("Private or reserved network targets are not allowed")
        except ValueError as exc:
            raise UnsafeUrl("Invalid hostname address") from exc
    return url


def is_same_site(candidate: str, start_url: str) -> bool:
    """Compare hosts while treating www.example.com and example.com as equal."""
    candidate_host = (urlsplit(candidate).hostname or "").lower().removeprefix("www.")
    start_host = (urlsplit(start_url).hostname or "").lower().removeprefix("www.")
    return bool(candidate_host) and candidate_host == start_host
