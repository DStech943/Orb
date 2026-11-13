"""Authenticated, server-side Slack escalation endpoints."""
from __future__ import annotations

import html
import json
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field

from app.api.knowledge import _remote_brand_by_name, _supabase_rows, _supabase_service_rows
from app.auth import User, current_user
from app.api.shopify import _resolve_credentials
from app.scraper.shopify import ShopifyAdminUnavailable, _admin_query, admin_domain, list_admin_products


router = APIRouter(prefix="/api/escalations", tags=["escalations"])
_SLACK_API = "https://slack.com/api"
_MAX_ATTACHMENTS = 5


class DailySlackReportRequest(BaseModel):
    brand_name: str = Field(min_length=1, max_length=160)


def _platform_config(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return decoded if isinstance(decoded, dict) else {}
    return {}


def _slack_text(value: str) -> str:
    # Keep a user's angle brackets from becoming arbitrary Slack markup.
    return html.escape(value.strip())


async def _slack_json(
    client: httpx.AsyncClient, token: str, method: str, payload: dict[str, Any]
) -> dict[str, Any]:
    try:
        response = await client.post(
            f"{_SLACK_API}/{method}",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Slack could not be reached") from exc
    if not response.is_success or not body.get("ok"):
        # Do not return Slack's detailed response: it can contain workspace data.
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Slack rejected the escalation. Check the bot scopes and channel access.")
    return body


@router.post("/slack")
async def send_slack_escalation(
    request: Request,
    brand_name: str = Form(..., min_length=1, max_length=160),
    message: str = Form(..., min_length=1, max_length=8_000),
    files: list[UploadFile] = File(default=[]),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    """Send an Orb escalation and optional attachments to the brand Slack channel."""
    settings = request.app.state.settings
    if not settings.slack_bot_token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Slack escalation is not configured yet. Add SLACK_BOT_TOKEN in Railway.")
    if len(files) > _MAX_ATTACHMENTS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Attach at most {_MAX_ATTACHMENTS} files.")

    brand = await _remote_brand_by_name(request, brand_name)
    try:
        profile_rows = await _supabase_rows(
            request,
            "orb_profiles",
            {"select": "full_name", "id": f"eq.{user.id}", "limit": "1"},
        )
    except HTTPException:
        profile_rows = []
    submitted_by = str((profile_rows[0].get("full_name") if profile_rows else "") or "Workspace member").strip()
    configured_channel = _platform_config(brand.get("platform_config")).get("slack_channel_id")
    channel_id = str(configured_channel or settings.slack_channel_id or "").strip()
    if not channel_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No Slack channel is configured for this brand.")

    attachment_data: list[tuple[str, str, bytes]] = []
    for upload in files:
        filename = (upload.filename or "attachment").strip()[:255]
        content = await upload.read(settings.slack_max_file_bytes + 1)
        if len(content) > settings.slack_max_file_bytes:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"{filename} exceeds the attachment size limit.")
        attachment_data.append((filename, upload.content_type or "application/octet-stream", content))

    safe_message = _slack_text(message)
    headline = f"<!channel> *Orb escalation — {_slack_text(str(brand.get('name') or brand_name))}*"
    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": "Orb escalation"}},
        {"type": "section", "fields": [
            {"type": "mrkdwn", "text": f"*Brand*\n{_slack_text(str(brand.get('name') or brand_name))}"},
            {"type": "mrkdwn", "text": f"*Escalated by*\n{_slack_text(submitted_by)}"},
        ]},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"<!channel>\n{safe_message}"}},
    ]

    async with httpx.AsyncClient(timeout=30.0) as client:
        posted = await _slack_json(client, settings.slack_bot_token, "chat.postMessage", {
            "channel": channel_id,
            "text": f"{headline}\n{safe_message}",
            "blocks": blocks,
        })
        for filename, content_type, content in attachment_data:
            upload_url = await _slack_json(client, settings.slack_bot_token, "files.getUploadURLExternal", {
                "filename": filename,
                "length": len(content),
            })
            try:
                uploaded = await client.post(
                    str(upload_url["upload_url"]), content=content, headers={"Content-Type": content_type}
                )
                uploaded.raise_for_status()
            except httpx.HTTPError as exc:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Slack could not upload an attachment.") from exc
            await _slack_json(client, settings.slack_bot_token, "files.completeUploadExternal", {
                "files": [{"id": upload_url["file_id"], "title": filename}],
                "channel_id": channel_id,
                "initial_comment": f"Attachment for Orb escalation ({posted.get('ts', 'new message')}).",
            })

    return {"ok": True, "channel_id": channel_id, "attachments_uploaded": len(attachment_data)}


@router.post("/daily")
async def send_daily_slack_report(
    payload: DailySlackReportRequest, request: Request, user: User = Depends(current_user),
) -> dict[str, Any]:
    """Post a read-only daily brand snapshot to its configured Slack channel."""
    settings = request.app.state.settings
    if not settings.slack_bot_token:
        raise HTTPException(status_code=503, detail="Daily Slack reports are not configured yet. Add SLACK_BOT_TOKEN in Railway.")
    brand = await _remote_brand_by_name(request, payload.brand_name)
    configured_channel = _platform_config(brand.get("platform_config")).get("slack_channel_id")
    channel_id = str(configured_channel or settings.slack_channel_id or "").strip()
    if not channel_id:
        raise HTTPException(status_code=422, detail="No Slack channel is configured for this brand.")
    domain, access_token, _source = await _resolve_credentials(request, payload.brand_name, True, user)
    if not domain or not access_token:
        raise HTTPException(status_code=503, detail="Shopify is not connected for this brand.")
    try:
        products = await list_admin_products(settings, 250, domain=admin_domain(domain), access_token=access_token)
    except ShopifyAdminUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    out_of_stock, near_out = [], []
    for product in products:
        if str(product.get("status") or "ACTIVE").upper() != "ACTIVE":
            continue
        variants = ((product.get("variants") or {}).get("nodes") or []) if isinstance(product.get("variants"), dict) else (product.get("variants") or [])
        quantities = [int(variant.get("inventoryQuantity") or 0) for variant in variants if isinstance(variant, dict) and variant.get("inventoryQuantity") is not None]
        if not quantities:
            continue
        total = sum(quantities)
        name = str(product.get("title") or "Untitled product")
        if total <= 0: out_of_stock.append(name)
        elif total < 7: near_out.append(f"{name} — {total} left")

    operations = await _supabase_rows(request, "orb_operational_updates", {"select": "message,status", "brand_id": f"eq.{brand['id']}", "status": "in.(recorded,ready_for_review,applied)", "order": "created_at.desc", "limit": "5"})
    settings_rows = await _supabase_service_rows(request, "orb_overview_block_settings", {"select": "tracked_variant_metafield", "brand_id": f"eq.{brand['id']}", "limit": "1"})
    tracker = (settings_rows[0].get("tracked_variant_metafield") or {}) if settings_rows else {}
    tracker_lines: list[str] = []
    field = str(tracker.get("field") or "")
    if field and "." in field:
        namespace, key = field.split(".", 1)
        query = """query OrbDailyTrackedField($namespace: String!, $key: String!) { products(first: 250) { nodes { title variants(first: 100) { nodes { title metafield(namespace: $namespace, key: $key) { value } } } } } }"""
        try:
            tracked_data = await _admin_query(settings, query, {"namespace": namespace, "key": key}, domain=admin_domain(domain), access_token=access_token)
            for product in ((tracked_data.get("products") or {}).get("nodes") or []):
                for variant in ((product.get("variants") or {}).get("nodes") or []):
                    value = str(((variant.get("metafield") or {}).get("value") or "")).strip()
                    matches = bool(value) if tracker.get("mode") == "nonempty" else value.lower() in {"true", "1", "yes"}
                    if matches: tracker_lines.append(f"{product.get('title')} / {variant.get('title')} — {value}")
        except ShopifyAdminUnavailable:
            tracker_lines = []

    def section(title: str, values: list[str], empty: str) -> str:
        body = "\n".join(f"• {_slack_text(value)}" for value in values[:10]) if values else empty
        return f"*{title} ({len(values)})*\n{body}"
    name = _slack_text(str(brand.get("name") or payload.brand_name))
    parts = [f"*Orb daily status — {name}*", section("Out of stock", out_of_stock, "All active products have inventory."), section("Near out of stock (<7)", near_out, "No active products are below 7 items."), section("Active operations", [str(row.get("message") or "Operational update") for row in operations], "No active operations.")]
    if field: parts.append(section(f"Tracked variant metafield: {field}", tracker_lines, "No variants currently match this rule."))
    report = "\n\n".join(parts)
    async with httpx.AsyncClient(timeout=30.0) as client:
        await _slack_json(client, settings.slack_bot_token, "chat.postMessage", {"channel": channel_id, "text": report})
    return {"ok": True, "channel_id": channel_id, "report": report}
