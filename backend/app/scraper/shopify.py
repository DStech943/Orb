from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx
from selectolax.parser import HTMLParser

from app.config import Settings
from app.scraper.fetcher import FetchError, Fetcher


logger = logging.getLogger(__name__)


class ShopifyAdminUnavailable(RuntimeError):
    pass


@dataclass(slots=True)
class ShopifyProduct:
    url: str
    title: str
    description: str
    text: str
    structured: dict[str, Any]


@dataclass(slots=True)
class ShopifyResource:
    url: str
    title: str
    text: str
    page_type: str
    structured: dict[str, Any]


def admin_domain(value: str) -> str:
    parsed = urlsplit(value if "://" in value else f"https://{value}")
    host = (parsed.hostname or "").lower()
    if not host:
        raise ShopifyAdminUnavailable("SHOPIFY_THE_DEARIST_DOMAIN must be a valid Shopify admin domain")
    return host


def _plain_html(value: str | None) -> str:
    return HTMLParser(value or "").text(separator=" ", strip=True)


def _money(value: Any) -> tuple[str, str]:
    """Return a display-safe amount and ISO currency from Shopify MoneyV2 data."""
    # Some Admin API versions expose Money as a scalar instead of MoneyV2.
    # Preserve its amount even though that older shape does not include a
    # currency code alongside it.
    if isinstance(value, (str, int, float)):
        return str(value), ""
    if not isinstance(value, dict):
        return "", ""
    return str(value.get("amount") or ""), str(value.get("currencyCode") or "")


def _admin_credentials(settings: Settings, domain: str | None, access_token: str | None) -> tuple[str, str]:
    domain = domain or settings.shopify_the_dearist_domain
    access_token = access_token or settings.shopify_the_dearist_token
    if not domain or not access_token:
        raise ShopifyAdminUnavailable("Set SHOPIFY_THE_DEARIST_DOMAIN and SHOPIFY_THE_DEARIST_TOKEN in backend/.env")
    return admin_domain(domain), access_token


async def _admin_query(
    settings: Settings, query: str, variables: dict[str, Any], *, domain: str | None = None, access_token: str | None = None,
) -> dict[str, Any]:
    store_domain, token = _admin_credentials(settings, domain, access_token)
    endpoint = f"https://{store_domain}/admin/api/{settings.shopify_admin_api_version}/graphql.json"
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                endpoint,
                headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"},
                json={"query": query, "variables": variables},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as exc:
        raise ShopifyAdminUnavailable(f"Shopify Admin API request failed: {exc}") from exc
    if payload.get("errors"):
        raise ShopifyAdminUnavailable(f"Shopify Admin API rejected the request: {payload['errors']}")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise ShopifyAdminUnavailable("Shopify Admin API returned no data")
    return data


async def list_admin_products(
    settings: Settings, maximum: int = 250, *, domain: str | None = None, access_token: str | None = None,
) -> list[dict[str, Any]]:
    """Return the editable Shopify catalog fields used by Orb's product library.

    Credentials are supplied only by the server route and are never copied into
    the returned product records.  Shopify limits each nested connection to a
    page of 100 values, which comfortably covers normal variants/metafields.
    """
    first = max(1, min(maximum, 250))
    query = """
    query OrbProductLibrary($first: Int!) {
      shop { currencyCode }
      products(first: $first) {
        nodes {
          id handle title descriptionHtml status vendor productType tags templateSuffix createdAt updatedAt
          featuredImage { url altText }
          media(first: 100) {
            nodes {
              alt mediaContentType status
              preview { image { url altText width height } }
              ... on MediaImage { image { url altText width height } }
            }
          }
          seo { title description }
          options { name values }
          variants(first: 100) {
            nodes {
              id title sku barcode price compareAtPrice
              inventoryQuantity inventoryPolicy availableForSale selectedOptions { name value }
              image { url altText }
            }
          }
          metafields(first: 90) {
            nodes {
              id namespace key type value description
              definition { name pinnedPosition }
              reference {
                __typename
                ... on MediaImage { image { url altText width height } }
                ... on GenericFile { url alt mimeType }
                ... on Video { preview { image { url altText width height } } }
                ... on Product { id title handle featuredImage { url altText } }
                ... on Metaobject { id displayName handle type }
              }
              references(first: 20) {
                nodes {
                  __typename
                  ... on MediaImage { image { url altText width height } }
                  ... on GenericFile { url alt mimeType }
                  ... on Video { preview { image { url altText width height } } }
                  ... on Product { id title handle featuredImage { url altText } }
                  ... on Metaobject { id displayName handle type }
                }
              }
            }
          }
        }
      }
    }
    """
    try:
        data = await _admin_query(settings, query, {"first": first}, domain=domain, access_token=access_token)
    except ShopifyAdminUnavailable:
        # `inventoryQuantity` needs Shopify's optional read_inventory scope.
        # Do not make an otherwise valid read_products connection unusable just
        # because that extra scope has not been granted.
        data = await _admin_query(
            settings,
            query.replace("inventoryQuantity ", ""),
            {"first": first},
            domain=domain,
            access_token=access_token,
        )
    currency = str((data.get("shop") or {}).get("currencyCode") or "")
    nodes = data.get("products", {}).get("nodes", [])
    # Older Admin API versions expose variant prices as a Money scalar. Carry
    # the shop currency alongside each product so the UI can still format it.
    return [{**item, "_orb_currency": currency} for item in nodes if isinstance(item, dict) and item.get("id")]


async def list_admin_resources(
    settings: Settings, maximum: int = 250, *, domain: str | None = None, access_token: str | None = None,
) -> list[ShopifyResource]:
    """Read brand knowledge through the authenticated Admin API, never storefront HTML."""
    first = max(1, min(maximum, 250))
    products = await list_admin_products(settings, first, domain=domain, access_token=access_token)

    content_data: dict[str, Any] = {}
    try:
        content_data = await _admin_query(settings, """
        query ImportOrbContent($first: Int!) {
      pages(first: $first) { nodes { id handle title body updatedAt } }
      articles(first: $first) { nodes { id handle title body publishedAt blog { handle } } }
        }
        """, {"first": first}, domain=domain, access_token=access_token)
    except ShopifyAdminUnavailable as exc:
        logger.warning("Shopify content import skipped: %s", exc)

    policy_data: dict[str, Any] = {}
    try:
        policy_data = await _admin_query(settings, """
        query ImportOrbPolicies {
          shop { shopPolicies { id title body url type updatedAt } }
        }
        """, {}, domain=domain, access_token=access_token)
    except ShopifyAdminUnavailable as exc:
        logger.warning("Shopify policy import skipped: %s", exc)

    store_host, _ = _admin_credentials(settings, domain, access_token)
    storefront = f"https://{store_host}"
    resources: list[ShopifyResource] = []
    for product in products:
        handle = product.get("handle")
        if not handle:
            continue
        variants = product.get("variants", {}).get("nodes", []) or []
        variant_text = "\n".join(
            f"- {row.get('title') or 'Default'} | SKU: {row.get('sku') or ''} | Price: {' '.join(part for part in _money(row.get('price')) if part)} | Available: {bool(row.get('availableForSale'))}"
            for row in variants
        )
        description = _plain_html(product.get("descriptionHtml"))
        resources.append(ShopifyResource(
            url=f"{storefront}/products/{handle}",
            title=product.get("title") or handle,
            text=f"# {product.get('title') or handle}\n\n{description}\n\n## Variants\n{variant_text}",
            page_type="product", structured={"shopify_admin": product},
        ))
    for page in content_data.get("pages", {}).get("nodes", []):
        handle = page.get("handle")
        if handle:
            resources.append(ShopifyResource(
                url=f"{storefront}/pages/{handle}", title=page.get("title") or handle,
                text=f"# {page.get('title') or handle}\n\n{_plain_html(page.get('body'))}", page_type="page",
                structured={"shopify_admin": page},
            ))
    for article in content_data.get("articles", {}).get("nodes", []):
        handle, blog = article.get("handle"), (article.get("blog") or {}).get("handle")
        if handle and blog:
            resources.append(ShopifyResource(
                url=f"{storefront}/blogs/{blog}/{handle}", title=article.get("title") or handle,
                text=f"# {article.get('title') or handle}\n\n{_plain_html(article.get('body'))}", page_type="blog",
                structured={"shopify_admin": article},
            ))
    for policy in (policy_data.get("shop") or {}).get("shopPolicies", []) or []:
        if isinstance(policy, dict) and policy.get("body"):
            policy_name = policy.get("type") or "policy"
            resources.append(ShopifyResource(
                url=policy.get("url") or f"{storefront}/policies/{policy_name}", title=policy.get("title") or policy_name,
                text=f"# {policy.get('title') or policy_name}\n\n{_plain_html(policy.get('body'))}", page_type="policy",
                structured={"shopify_admin": policy, "policy_type": policy_name},
            ))
    return resources[:maximum]


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
