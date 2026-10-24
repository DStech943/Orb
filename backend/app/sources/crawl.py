from __future__ import annotations

from typing import Protocol


class CatalogSource(Protocol):
    """Extension point for later external product/catalog connectors."""

    async def list_products(self, org_id: str) -> list[dict[str, object]]: ...


class CrawlCatalogSource:
    """Marker provider: products are discovered and fetched through normal crawl URLs."""

    async def list_products(self, org_id: str) -> list[dict[str, object]]:
        del org_id
        return []
