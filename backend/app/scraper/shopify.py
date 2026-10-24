from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin

from app.scraper.fetcher import FetchError, Fetcher


@dataclass(slots=True)
class ShopifyProduct:
    url: str
    title: str
    description: str
    text: str
    structured: dict[str, Any]


async def is_shopify_store(fetcher: Fetcher, start_url: str) -> bool:
    try:
        response = await fetcher.fetch(urljoin(start_url, "/products.json?limit=1"), attempts=1)
        return 200 <= response.status_code < 300 and "products" in response.text
    except FetchError:
        return False


def product_to_page(start_url: str, product: dict[str, Any]) -> ShopifyProduct | None:
    handle = product.get("handle")
    if not handle:
        return None
    variants = product.get("variants") or []
    rows = ["| Variant | SKU | Price | Available |", "| --- | --- | --- | --- |"]
    for variant in variants:
        rows.append(
            "| {title} | {sku} | {price} | {available} |".format(
                title=variant.get("title") or "Default",
                sku=variant.get("sku") or "",
                price=variant.get("price") or "",
                available="yes" if variant.get("available") else "no",
            )
        )
    description = product.get("body_html") or ""
    title = product.get("title") or handle
    text = f"# {title}\n\n{description}\n\n## Variants\n" + "\n".join(rows)
    return ShopifyProduct(
        url=urljoin(start_url, f"/products/{handle}"),
        title=title,
        description=description,
        text=text,
        structured={"shopify_product": product},
    )


async def list_products(fetcher: Fetcher, start_url: str, maximum: int = 10_000) -> list[ShopifyProduct]:
    products: list[ShopifyProduct] = []
    page = 1
    while len(products) < maximum and page <= 40:
        try:
            response = await fetcher.fetch(urljoin(start_url, f"/products.json?limit=250&page={page}"), attempts=1)
        except FetchError:
            break
        if not 200 <= response.status_code < 300:
            break
        try:
            payload = response.body and json.loads(response.body)
        except (TypeError, ValueError):
            break
        batch = payload.get("products") or []
        for product in batch:
            item = product_to_page(start_url, product)
            if item:
                products.append(item)
                if len(products) >= maximum:
                    break
        if len(batch) < 250:
            break
        page += 1
    return products
