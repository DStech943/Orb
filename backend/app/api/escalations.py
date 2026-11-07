"""Authenticated, server-side Slack escalation endpoints."""
from __future__ import annotations

import html
import json
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from app.api.knowledge import _remote_brand_by_name
from app.auth import User, current_user


router = APIRouter(prefix="/api/escalations", tags=["escalations"])
_SLACK_API = "https://slack.com/api"
_MAX_ATTACHMENTS = 5


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
    _: User = Depends(current_user),
) -> dict[str, Any]:
    """Send an Orb escalation and optional attachments to the brand Slack channel."""
    settings = request.app.state.settings
    if not settings.slack_bot_token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Slack escalation is not configured yet. Add SLACK_BOT_TOKEN in Railway.")
    if len(files) > _MAX_ATTACHMENTS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Attach at most {_MAX_ATTACHMENTS} files.")

    brand = await _remote_brand_by_name(request, brand_name)
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
            {"type": "mrkdwn", "text": "*Priority*\nChannel-wide escalation"},
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
