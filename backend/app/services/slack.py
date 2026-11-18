"""Shared Slack Web API helpers.

Both the manual escalation endpoint and the agent issue reports use these, so
there is one place that talks to Slack, escapes user text and uploads files.
The bot token never leaves the server.
"""
from __future__ import annotations

import html
import json
from typing import Any

import httpx
from fastapi import HTTPException, status

SLACK_API = "https://slack.com/api"


def platform_config(value: Any) -> dict[str, Any]:
    """Decode a brand's ``platform_config`` jsonb value, which may arrive as text."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return decoded if isinstance(decoded, dict) else {}
    return {}


def slack_text(value: str) -> str:
    # Keep a user's angle brackets from becoming arbitrary Slack markup.
    return html.escape(value.strip())


def resolve_channel_id(settings: Any, brand_platform_config: Any) -> str:
    """A brand's own channel wins over the workspace-wide default."""
    configured = platform_config(brand_platform_config).get("slack_channel_id")
    return str(configured or settings.slack_channel_id or "").strip()


class SlackError(HTTPException):
    """A failed Slack call.

    ``detail`` stays generic because it can reach a browser. ``method`` and ``code``
    (Slack's short error code, e.g. ``missing_scope`` or ``not_in_channel``) are for
    admins and logs; they never contain the token or any message content.
    """

    def __init__(self, detail: str, *, method: str = "", code: str = "") -> None:
        super().__init__(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)
        self.method = method
        self.code = code


async def _post_slack(client: httpx.AsyncClient, token: str, method: str, **request: Any) -> dict[str, Any]:
    try:
        response = await client.post(
            f"{SLACK_API}/{method}",
            headers={"Authorization": f"Bearer {token}"},
            **request,
        )
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise SlackError("Slack could not be reached", method=method, code="unreachable") from exc
    if not response.is_success or not body.get("ok"):
        # Do not return Slack's detailed response: it can contain workspace data.
        raise SlackError(
            "Slack rejected the escalation. Check the bot scopes and channel access.",
            method=method,
            code=str(body.get("error") or f"http_{response.status_code}"),
        )
    return body


async def slack_json(
    client: httpx.AsyncClient, token: str, method: str, payload: dict[str, Any]
) -> dict[str, Any]:
    return await _post_slack(client, token, method, json=payload)


async def slack_form(
    client: httpx.AsyncClient, token: str, method: str, fields: dict[str, Any]
) -> dict[str, Any]:
    """Methods such as files.getUploadURLExternal reject JSON bodies
    (``invalid_arguments``) and only accept form-encoded fields."""
    return await _post_slack(client, token, method, data=fields)


async def upload_file(
    client: httpx.AsyncClient,
    token: str,
    *,
    channel_id: str,
    filename: str,
    content: bytes,
    content_type: str,
    initial_comment: str | None = None,
    thread_ts: str | None = None,
) -> None:
    """Upload a file using Slack's three-step external upload flow.

    With ``thread_ts`` the file lands as a reply in that message's thread instead
    of as a separate channel message.
    """
    upload_url = await slack_form(client, token, "files.getUploadURLExternal", {
        "filename": filename,
        "length": len(content),
    })
    try:
        uploaded = await client.post(
            str(upload_url["upload_url"]), content=content, headers={"Content-Type": content_type}
        )
        uploaded.raise_for_status()
    except httpx.HTTPError as exc:
        raise SlackError("Slack could not upload an attachment.", method="upload", code="upload_failed") from exc
    complete: dict[str, Any] = {
        # Form-encoded, so the file list travels as a JSON string.
        "files": json.dumps([{"id": upload_url["file_id"], "title": filename}]),
        "channel_id": channel_id,
    }
    if initial_comment:
        complete["initial_comment"] = initial_comment
    if thread_ts:
        complete["thread_ts"] = thread_ts
    await slack_form(client, token, "files.completeUploadExternal", complete)
