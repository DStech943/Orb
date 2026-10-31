"""Qdrant publishing for approved brand knowledge."""
from __future__ import annotations

import re
from uuid import UUID
from typing import Any

import asyncpg
import httpx

from app.config import Settings
from app.services.llm import GenerationUnavailable, embed_text
from app.services.vault import SecretUnavailable, vault_secret


class PublishUnavailable(RuntimeError):
    pass


def collection_name(prefix: str, brand_name: str, kind: str) -> str:
    brand = re.sub(r"[^A-Z0-9]+", "_", brand_name.upper()).strip("_")
    head = f"{prefix.strip('_').upper()}_" if prefix else ""
    collection_kind = "PRODUCTS" if kind == "product" else kind.upper()
    return f"{head}{brand}_GENIE_{collection_kind}"


def display_collection_name(prefix: str, brand_name: str) -> str:
    """Return the isolated visual-flow collection for a brand.

    Display flows are deliberately not knowledge documents: do not place them
    in the existing *_GENIE_SOP collections used by the generated SOP library.
    """
    brand = re.sub(r"[^A-Z0-9]+", "_", brand_name.upper()).strip("_")
    head = f"{prefix.strip('_').upper()}_" if prefix else ""
    return f"{head}{brand}_DISPLAY"


async def _client(pool: asyncpg.Pool) -> tuple[str, dict[str, str]]:
    try:
        url = await vault_secret(pool, "QDRANT_URL")
        key = await vault_secret(pool, "QDRANT_API_KEY")
    except SecretUnavailable as exc:
        raise PublishUnavailable(str(exc)) from exc
    return url.rstrip("/"), {"api-key": key, "Content-Type": "application/json"}


async def publish_points(pool: asyncpg.Pool, settings: Settings, brand_name: str, kind: str, items: list[dict[str, Any]]) -> str:
    if not items:
        raise PublishUnavailable("No approved items are available to publish")
    base_url, headers = await _client(pool)
    collection = collection_name(settings.qdrant_collection_prefix, brand_name, kind)
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            exists = await client.get(f"{base_url}/collections/{collection}", headers=headers)
            if exists.status_code == 404:
                created = await client.put(
                    f"{base_url}/collections/{collection}", headers=headers,
                    json={"vectors": {"size": settings.embedding_dimensions, "distance": "Cosine"}},
                )
                created.raise_for_status()
            else:
                exists.raise_for_status()
            points = []
            for item in items:
                payload = dict(item["payload"])
                payload.update({"brand_name": brand_name, "kind": kind, "orb_id": str(item["id"]), "status": "published"})
                source_text = "\n".join(str(value) for value in payload.values() if isinstance(value, str))
                points.append({"id": str(item["id"]), "vector": await embed_text(pool, settings, source_text), "payload": payload})
            result = await client.put(f"{base_url}/collections/{collection}/points?wait=true", headers=headers, json={"points": points})
            result.raise_for_status()
    except (httpx.HTTPError, PublishUnavailable, GenerationUnavailable) as exc:
        raise PublishUnavailable(f"Qdrant publish failed: {exc}") from exc
    return collection


async def scroll_points(
    pool: asyncpg.Pool,
    settings: Settings,
    brand_name: str,
    kind: str,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """Return payload-only points from one brand and knowledge-type collection."""
    base_url, headers = await _client(pool)
    collection = collection_name(settings.qdrant_collection_prefix, brand_name, kind)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{base_url}/collections/{collection}/points/scroll",
                headers=headers,
                json={"limit": limit, "with_payload": True, "with_vector": False},
            )
            if response.status_code == 404:
                return []
            response.raise_for_status()
            points = response.json().get("result", {}).get("points", [])
    except httpx.HTTPError as exc:
        raise PublishUnavailable(f"Qdrant read failed for {collection}: {exc}") from exc
    if not isinstance(points, list):
        raise PublishUnavailable(f"Qdrant returned an invalid point list for {collection}")
    return [point for point in points if isinstance(point, dict) and point.get("id") is not None and isinstance(point.get("payload"), dict)]


async def _ensure_display_collection(client: httpx.AsyncClient, base_url: str, headers: dict[str, str], settings: Settings, collection: str) -> None:
    exists = await client.get(f"{base_url}/collections/{collection}", headers=headers)
    if exists.status_code != 404:
        exists.raise_for_status()
        return
    created = await client.put(
        f"{base_url}/collections/{collection}",
        headers=headers,
        json={"vectors": {"size": settings.embedding_dimensions, "distance": "Cosine"}},
    )
    created.raise_for_status()


async def upsert_display_point(
    pool: asyncpg.Pool,
    settings: Settings,
    brand_name: str,
    flow_id: UUID | str,
    payload: dict[str, Any],
) -> str:
    """Create or update one visual flow in the brand's *_DISPLAY collection."""
    base_url, headers = await _client(pool)
    collection = display_collection_name(settings.qdrant_collection_prefix, brand_name)
    stored_payload = dict(payload)
    stored_payload.update({"brand_name": brand_name, "kind": "display_flow", "flow_id": str(flow_id)})
    node_text = []
    for node in stored_payload.get("nodes", []):
        if isinstance(node, dict):
            node_text.extend(str(node.get(key, "")) for key in ("type", "title", "body"))
    source_text = "\n".join([*(str(value) for value in stored_payload.values() if isinstance(value, str)), *node_text])
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            await _ensure_display_collection(client, base_url, headers, settings, collection)
            response = await client.put(
                f"{base_url}/collections/{collection}/points?wait=true",
                headers=headers,
                json={"points": [{"id": str(flow_id), "vector": await embed_text(pool, settings, source_text), "payload": stored_payload}]},
            )
            response.raise_for_status()
    except (httpx.HTTPError, GenerationUnavailable) as exc:
        raise PublishUnavailable(f"Qdrant display-flow write failed: {exc}") from exc
    return collection


async def scroll_display_points(pool: asyncpg.Pool, settings: Settings, brand_name: str, limit: int = 200) -> list[dict[str, Any]]:
    base_url, headers = await _client(pool)
    collection = display_collection_name(settings.qdrant_collection_prefix, brand_name)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{base_url}/collections/{collection}/points/scroll",
                headers=headers,
                json={"limit": limit, "with_payload": True, "with_vector": False},
            )
            if response.status_code == 404:
                return []
            response.raise_for_status()
            points = response.json().get("result", {}).get("points", [])
    except httpx.HTTPError as exc:
        raise PublishUnavailable(f"Qdrant display-flow read failed for {collection}: {exc}") from exc
    return [point for point in points if isinstance(point, dict) and point.get("id") is not None and isinstance(point.get("payload"), dict)] if isinstance(points, list) else []


async def delete_display_point(pool: asyncpg.Pool, settings: Settings, brand_name: str, flow_id: UUID | str) -> None:
    base_url, headers = await _client(pool)
    collection = display_collection_name(settings.qdrant_collection_prefix, brand_name)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.request(
                "DELETE",
                f"{base_url}/collections/{collection}/points?wait=true",
                headers=headers,
                json={"points": [str(flow_id)]},
            )
            if response.status_code == 404:
                return
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise PublishUnavailable(f"Qdrant display-flow delete failed for {collection}: {exc}") from exc
