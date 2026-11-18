"""Escalated agent issue reports.

A tester reports a problem with a brand's deployed AI agent. The report and an
immutable snapshot of the conversation are saved FIRST; the Slack notification
is a follow-up that can fail without losing anything and can be retried.

Reports build on ``cx_copilot.orb_agent_feedback`` (see migration
20261117_agent_feedback_reports.sql) so there is a single review queue.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import UUID

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, Response, status
from pydantic import Field, field_validator, model_validator

from app.api.knowledge import (
    RequestModel,
    _admin,
    _agent_feedback_out,
    _remote_brand,
    _supabase_rows,
    _supabase_service_rows,
    _supabase_service_write,
    _supabase_write,
)
from app.auth import User, current_user
from app.services import slack

logger = logging.getLogger("orb.feedback_reports")

router = APIRouter(prefix="/api", tags=["agent issue reports"])

CATEGORY_LABELS = {
    "incorrect_response": "Incorrect response",
    "hallucination": "Hallucination",
    "context_loss": "Context loss",
    "rag_retrieval_failure": "Knowledge retrieval failure",
    "tool_execution_failure": "Tool execution failure",
    "incorrect_behavior": "Incorrect behaviour",
    "other": "Other",
}
SEVERITY_MARKS = {"low": "🟢 Low", "medium": "🟡 Medium", "high": "🔴 High"}

MAX_MESSAGES = 200
MAX_MESSAGE_CHARS = 20_000
MAX_CONVERSATION_BYTES = 1_000_000
MAX_TAGGED_PEOPLE = 10

_REPORT_COLUMNS = (
    "id,brand_id,submitted_by,session_id,scope,message_id,agent_reply,tags,note,ideal_reply,status,"
    "created_at,kind,category,severity,agent_metadata,tagged_people,slack_delivery_status,"
    "slack_channel_id,slack_message_ts,slack_attempts,slack_last_error,slack_sent_at"
)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class TranscriptMessage(RequestModel):
    id: str = Field(min_length=1, max_length=160)
    role: Literal["user", "agent"]
    text: str = Field(max_length=MAX_MESSAGE_CHARS)
    created_at: datetime


class AgentIssueReport(RequestModel):
    """An issue report, or - when ``category`` is left out - a feedback note that the
    tester chose to send to the team on Slack. Both save the conversation and notify."""

    session_id: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    category: Literal[
        "incorrect_response",
        "hallucination",
        "context_loss",
        "rag_retrieval_failure",
        "tool_execution_failure",
        "incorrect_behavior",
        "other",
    ] | None = None
    severity: Literal["low", "medium", "high"] = "medium"
    description: str = Field(min_length=1, max_length=5_000)
    expected_behavior: str = Field(default="", max_length=5_000)
    message_id: str = Field(default="", max_length=160)
    tagged_people: list[UUID] = Field(default_factory=list, max_length=MAX_TAGGED_PEOPLE)
    transcript: list[TranscriptMessage] = Field(min_length=1, max_length=MAX_MESSAGES)
    # How many messages the tester's chat held, so a trimmed transcript is flagged.
    total_message_count: int | None = Field(default=None, ge=1, le=100_000)

    @field_validator("description", "expected_behavior", "message_id", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _limit_conversation_size(self) -> "AgentIssueReport":
        # A real report must explain itself; a short note ("great chat") may be brief.
        if self.category is not None and len(self.description) < 10:
            raise ValueError("Describe the problem in at least 10 characters.")
        size = sum(len(message.text.encode("utf-8")) for message in self.transcript)
        if size > MAX_CONVERSATION_BYTES:
            raise ValueError("The conversation is too large to attach.")
        return self


# ---------------------------------------------------------------------------
# PII redaction (Slack copy only; the stored snapshot stays complete)
# ---------------------------------------------------------------------------
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
_LONG_NUMBER = re.compile(r"(?<![\w])\+?\d(?:[\d \-().]){7,22}\d(?![\w])")
_DATE_LIKE = re.compile(r"^\d{4}-\d{1,2}-\d{1,2}|^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}$")


def _luhn_valid(digits: str) -> bool:
    total = 0
    for index, char in enumerate(reversed(digits)):
        value = int(char)
        if index % 2 == 1:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return total % 10 == 0


def redact_pii(text: str) -> str:
    """Mask emails, card numbers and phone-like numbers.

    Best effort, deliberately conservative: it favours masking over leaking, but
    it will not catch names, addresses or free-text identifiers.
    """
    text = _EMAIL.sub("[email]", text)

    def mask_number(match: re.Match[str]) -> str:
        value = match.group(0)
        if _DATE_LIKE.search(value.strip()):
            return value
        digits = re.sub(r"\D", "", value)
        if 13 <= len(digits) <= 19 and _luhn_valid(digits):
            return "[card]"
        if 10 <= len(digits) <= 15:
            return "[phone]"
        return value

    return _LONG_NUMBER.sub(mask_number, text)


# ---------------------------------------------------------------------------
# Snapshot
# ---------------------------------------------------------------------------
def _iso_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def build_snapshot(report: AgentIssueReport) -> dict[str, Any]:
    """Canonical, hashable copy of the conversation as submitted."""
    messages = [
        {"id": item.id, "role": item.role, "text": item.text, "created_at": _iso_utc(item.created_at)}
        for item in report.transcript
    ]
    canonical = json.dumps(messages, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return {
        "messages": messages,
        "message_count": len(messages),
        "truncated": bool(report.total_message_count and report.total_message_count > len(messages)),
        "snapshot_source": "client",
        "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


# ---------------------------------------------------------------------------
# Slack message and transcript formatting (pure functions)
# ---------------------------------------------------------------------------
def _clip(value: str, limit: int) -> str:
    value = value.strip()
    return value if len(value) <= limit else value[: limit - 1].rstrip() + "…"


def _fmt_ts(value: Any) -> str:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return str(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def report_link(settings: Any, brand_id: str, feedback_id: str) -> str:
    """Link to the report's own page in the Orb web app.

    The ids live in the path (not a query string) because the sign-in redirect
    only remembers a page's path. Whoever opens it signs in first if needed, and
    can then read the report only if Supabase RLS lets them (admins and members of
    the brand).
    """
    base = str(getattr(settings, "orb_app_url", "") or "").strip().rstrip("/")
    parsed = urlparse(base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return f"{base}/app/reports/{brand_id}/{feedback_id}"


def build_report_message(
    *,
    report: dict[str, Any],
    brand_name: str,
    agent_name: str,
    tester: str,
    mentions: list[str],
    link: str,
    message_count: int,
    truncated: bool,
) -> tuple[str, list[dict[str, Any]]]:
    """Return Slack's fallback ``text`` and Block Kit ``blocks`` for a report or note."""
    is_note = not report.get("category")
    category = CATEGORY_LABELS.get(str(report.get("category")), "Issue")
    # Notes have no severity, so they never raise an @channel.
    severity = "" if is_note else str(report.get("severity") or "medium")
    description = redact_pii(str(report.get("note") or ""))
    expected = redact_pii(str(report.get("ideal_reply") or ""))
    reported_reply = redact_pii(str(report.get("agent_reply") or ""))
    mention_text = " ".join(mentions)

    def field(label: str, value: str) -> dict[str, str]:
        return {"type": "mrkdwn", "text": f"*{label}*\n{slack.slack_text(_clip(value, 200)) or '—'}"}

    def section(text: str) -> dict[str, Any]:
        return {"type": "section", "text": {"type": "mrkdwn", "text": text}}

    title = "Agent feedback note" if is_note else f"Agent issue: {category}"
    blocks: list[dict[str, Any]] = [
        {"type": "header", "text": {"type": "plain_text", "text": _clip(title, 150)}},
    ]
    if severity == "high":
        blocks.append(section("<!channel> High-severity issue reported"))
    fields = [field("Brand", brand_name), field("Agent", agent_name or "Support agent")]
    if severity:
        fields.append(field("Severity", SEVERITY_MARKS.get(severity, severity)))
    fields += [
        field("Reported by" if not is_note else "From", tester),
        field("Session", str(report.get("session_id") or "")),
        field("Report ID", str(report.get("id") or "")),
    ]
    blocks.append({"type": "section", "fields": fields})
    blocks.append(section(f"*{'Note' if is_note else 'What happened'}*\n{slack.slack_text(_clip(description, 2000))}"))
    if expected.strip():
        blocks.append(section(f"*Expected behaviour*\n{slack.slack_text(_clip(expected, 2000))}"))
    if reported_reply.strip():
        quoted = slack.slack_text(_clip(reported_reply, 800)).replace("\n", "\n> ")
        blocks.append(section(f"*Reported reply*\n> {quoted}"))
    if mention_text:
        blocks.append(section(f"*Tagged:* {mention_text}"))
    context = f"Full conversation ({message_count} message{'s' if message_count != 1 else ''}" + (
        ", latest messages only" if truncated else ""
    ) + ") is attached in this thread."
    if link:
        context += f" <{link}|Open in Orb>"
    blocks.append({"type": "context", "elements": [{"type": "mrkdwn", "text": context}]})

    label = "Agent feedback note" if is_note else f"Agent issue ({category})"
    fallback = f"{label} on {slack.slack_text(brand_name)}: {slack.slack_text(_clip(description, 200))}"
    if mention_text:
        fallback = f"{fallback} {mention_text}"
    return fallback, blocks


def format_transcript(
    *,
    report: dict[str, Any],
    messages: list[dict[str, Any]],
    brand_name: str,
    agent_name: str,
    tester: str,
    max_bytes: int,
) -> bytes:
    """Readable, redacted transcript to upload as a text file."""
    agent_label = agent_name or "Agent"
    reported_id = str(report.get("message_id") or "")
    is_note = not report.get("category")
    header = [
        "ORB AGENT FEEDBACK NOTE" if is_note else "ORB AGENT ISSUE REPORT",
        f"Report ID: {report.get('id')}",
        f"Brand: {brand_name}",
        f"Agent: {agent_label}",
        f"Session: {report.get('session_id')}",
        f"Reported by: {tester}",
        *([] if is_note else [
            f"Category: {CATEGORY_LABELS.get(str(report.get('category')), 'Issue')}",
            f"Severity: {report.get('severity') or 'medium'}",
        ]),
        f"Reported at: {_fmt_ts(report.get('created_at'))}",
        "Personal data (emails, phone and card numbers) is masked in this copy.",
        "=" * 64,
        "",
    ]
    blocks: list[str] = []
    for message in messages:
        speaker = "Tester" if message.get("role") == "user" else agent_label
        marker = "   <<< REPORTED REPLY" if reported_id and str(message.get("id")) == reported_id else ""
        blocks.append(f"[{_fmt_ts(message.get('created_at'))}] {speaker}{marker}\n{redact_pii(str(message.get('text') or ''))}\n")

    def render(items: list[str], omitted: int) -> bytes:
        note = [f"[{omitted} older message(s) omitted to fit the file size limit]", ""] if omitted else []
        return "\n".join(header + note + items).encode("utf-8")

    omitted = 0
    content = render(blocks, omitted)
    while len(content) > max_bytes and len(blocks) > 1:
        blocks.pop(0)
        omitted += 1
        content = render(blocks, omitted)
    return content[:max_bytes]


# ---------------------------------------------------------------------------
# Data access. Reports are authorised with the tester's own token (RLS). Delivery
# bookkeeping runs after the response and must not depend on that token still
# being valid, so it prefers the server-side service role.
# ---------------------------------------------------------------------------
async def _read(request: Request, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    try:
        return await _supabase_service_rows(request, table, params)
    except HTTPException:
        return await _supabase_rows(request, table, params)


async def _record(request: Request, feedback_id: str, values: dict[str, Any]) -> None:
    """Best-effort update of delivery bookkeeping; never raises."""
    params = {"id": f"eq.{feedback_id}"}
    try:
        await _supabase_service_write(request, "PATCH", "orb_agent_feedback", params=params, payload=values)
        return
    except HTTPException as service_error:
        logger.warning("Service-role update of report %s failed: %s", feedback_id, service_error.detail)
    try:
        await _supabase_write(request, "PATCH", "orb_agent_feedback", params=params, payload=values)
    except HTTPException as user_error:
        logger.warning("Could not record delivery state for report %s: %s", feedback_id, user_error.detail)


async def _find_by_key(request: Request, user: User, key: str) -> dict[str, Any] | None:
    rows = await _supabase_rows(
        request,
        "orb_agent_feedback",
        {"select": _REPORT_COLUMNS, "submitted_by": f"eq.{user.id}", "idempotency_key": f"eq.{key}", "limit": "1"},
    )
    return rows[0] if rows else None


async def _snapshot_exists(request: Request, feedback_id: str) -> bool:
    rows = await _supabase_rows(
        request, "orb_agent_feedback_snapshots", {"select": "id", "feedback_id": f"eq.{feedback_id}", "limit": "1"}
    )
    return bool(rows)


async def _insert_snapshot(request: Request, feedback_id: str, brand_id: str, snapshot: dict[str, Any]) -> None:
    await _supabase_write(
        request,
        "POST",
        "orb_agent_feedback_snapshots",
        payload={"feedback_id": feedback_id, "brand_id": brand_id, **snapshot},
    )


async def _directory(request: Request, brand_id: str) -> list[dict[str, Any]]:
    """Teammates who can be tagged: Orb admins and this brand's team that also have a
    Slack user id on file. ``slack_user_id`` stays server-side."""
    slack_rows = await _supabase_service_rows(
        request, "orb_slack_users", {"select": "id,email,slack_user_id,display_name", "limit": "1000"}
    )
    by_email = {str(row.get("email") or "").strip().lower(): row for row in slack_rows if row.get("email")}
    if not by_email:
        return []

    people: dict[str, dict[str, Any]] = {}

    async def load(table: str, params: dict[str, str], role: str) -> None:
        try:
            rows = await _supabase_service_rows(request, table, params)
        except HTTPException as exc:
            logger.warning("Could not read %s for the Slack directory: %s", table, exc.detail)
            return
        for row in rows:
            email = str(row.get("email") or "").strip().lower()
            match = by_email.get(email)
            if not match or str(match["id"]) in people:
                continue
            people[str(match["id"])] = {
                "id": str(match["id"]),
                "name": str(row.get("name") or match.get("display_name") or email.split("@")[0]).strip(),
                "role": role,
                "avatar_key": str(row.get("avatar_key") or "").strip(),
                "slack_user_id": str(match["slack_user_id"]),
            }

    await load("brand_assignments", {"select": "name,email,avatar_key", "brand_id": f"eq.{brand_id}", "limit": "500"}, "Brand team")
    await load("admins", {"select": "name,email,avatar_key", "limit": "500"}, "Admin")
    return sorted(people.values(), key=lambda person: person["name"].lower())


async def _is_admin(request: Request, user: User) -> bool:
    try:
        await _admin(request, user)
    except HTTPException:
        return False
    return True


# ---------------------------------------------------------------------------
# Slack delivery
# ---------------------------------------------------------------------------
async def _deliver(request: Request, feedback_id: str) -> None:
    settings = request.app.state.settings
    rows = await _read(request, "orb_agent_feedback", {"select": _REPORT_COLUMNS, "id": f"eq.{feedback_id}", "limit": "1"})
    # Plain feedback that was never sent to the team has no Slack delivery to attempt.
    if not rows or rows[0].get("slack_delivery_status") == "not_applicable":
        logger.warning("Report %s not found or not meant for Slack delivery", feedback_id)
        return
    report = rows[0]
    attempts = int(report.get("slack_attempts") or 0) + 1

    async def fail(reason: str, **extra: Any) -> None:
        await _record(request, feedback_id, {
            "slack_delivery_status": "failed", "slack_attempts": attempts, "slack_last_error": reason[:500], **extra,
        })

    token = settings.slack_bot_token
    if not token:
        return await fail("Slack is not configured (SLACK_BOT_TOKEN is missing).")

    snapshot_rows = await _read(
        request, "orb_agent_feedback_snapshots", {"select": "messages,message_count,truncated", "feedback_id": f"eq.{feedback_id}", "limit": "1"}
    )
    if not snapshot_rows:
        return await fail("The conversation snapshot is missing.")
    snapshot = snapshot_rows[0]
    messages = snapshot.get("messages") if isinstance(snapshot.get("messages"), list) else []

    brand_rows = await _read(request, "brands", {"select": "name,platform_config", "id": f"eq.{report['brand_id']}", "limit": "1"})
    brand = brand_rows[0] if brand_rows else {}
    brand_name = str(brand.get("name") or "Brand")
    metadata = report.get("agent_metadata") if isinstance(report.get("agent_metadata"), dict) else {}
    agent_name = str(metadata.get("agent_name") or slack.platform_config(brand.get("platform_config")).get("ai_agent_name") or "").strip()

    channel_id = slack.resolve_channel_id(settings, brand.get("platform_config"))
    if not channel_id:
        return await fail("No Slack channel is configured for this brand.")

    profile_rows = await _read(request, "orb_profiles", {"select": "full_name", "id": f"eq.{report.get('submitted_by')}", "limit": "1"})
    tester = str((profile_rows[0].get("full_name") if profile_rows else "") or "Workspace member").strip()

    tagged = report.get("tagged_people") if isinstance(report.get("tagged_people"), list) else []
    tagged_ids = [str(item.get("id")) for item in tagged if isinstance(item, dict) and item.get("id")]
    mentions: list[str] = []
    if tagged_ids:
        people = await _read(request, "orb_slack_users", {"select": "slack_user_id", "id": f"in.({','.join(tagged_ids)})"})
        mentions = [f"<@{row['slack_user_id']}>" for row in people if row.get("slack_user_id")]

    message_ts = str(report.get("slack_message_ts") or "")
    thread_channel = str(report.get("slack_channel_id") or channel_id)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if not message_ts:
                text, blocks = build_report_message(
                    report=report, brand_name=brand_name, agent_name=agent_name, tester=tester, mentions=mentions,
                    link=report_link(settings, str(report["brand_id"]), feedback_id), message_count=len(messages), truncated=bool(snapshot.get("truncated")),
                )
                posted = await slack.slack_json(client, token, "chat.postMessage", {
                    "channel": channel_id, "text": text, "blocks": blocks, "unfurl_links": False, "unfurl_media": False,
                })
                message_ts = str(posted.get("ts") or "")
                thread_channel = channel_id
                # Persist progress now: if the upload below fails, a retry must reuse
                # this message rather than post a duplicate.
                await _record(request, feedback_id, {"slack_channel_id": channel_id, "slack_message_ts": message_ts})
            content = format_transcript(
                report=report, messages=messages, brand_name=brand_name, agent_name=agent_name, tester=tester,
                max_bytes=settings.slack_max_file_bytes,
            )
            await slack.upload_file(
                client, token, channel_id=thread_channel, filename=f"conversation-{str(feedback_id)[:8]}.txt",
                content=content, content_type="text/plain", thread_ts=message_ts or None,
            )
    except HTTPException as exc:
        if isinstance(exc, slack.SlackError) and exc.code:
            # Slack's short error code (for example "not_in_channel") tells an admin what to fix.
            return await fail(f"Slack {exc.method} failed: {exc.code}")
        return await fail(str(exc.detail))
    await _record(request, feedback_id, {
        "slack_delivery_status": "sent", "slack_attempts": attempts, "slack_last_error": None,
        "slack_sent_at": datetime.now(timezone.utc).isoformat(),
    })


async def deliver_report_to_slack(request: Request, feedback_id: str) -> None:
    """Background entry point. Whatever happens, the saved report is untouched."""
    try:
        await _deliver(request, feedback_id)
    except Exception:  # noqa: BLE001 - a background task must never raise
        logger.exception("Unexpected error delivering report %s to Slack", feedback_id)
        await _record(request, feedback_id, {
            "slack_delivery_status": "failed", "slack_last_error": "Unexpected error while sending to Slack.",
        })


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/brands/{brand_id}/slack-people")
async def list_slack_people(
    brand_id: str, request: Request, _: User = Depends(current_user)
) -> dict[str, list[dict[str, str]]]:
    """Teammates a tester can tag on a report. Slack ids are never returned."""
    brand = await _remote_brand(request, brand_id)
    people = await _directory(request, str(brand["id"]))
    return {"people": [{key: person[key] for key in ("id", "name", "role", "avatar_key")} for person in people]}


@router.post("/brands/{brand_id}/agent-feedback/report", status_code=status.HTTP_201_CREATED)
async def create_agent_issue_report(
    brand_id: str,
    payload: AgentIssueReport,
    request: Request,
    background_tasks: BackgroundTasks,
    response: Response,
    user: User = Depends(current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", min_length=8, max_length=120, pattern=r"^[A-Za-z0-9._:-]+$"),
) -> dict[str, Any]:
    brand = await _remote_brand(request, brand_id)
    brand_uuid = str(brand["id"])
    snapshot = build_snapshot(payload)

    if idempotency_key:
        existing = await _find_by_key(request, user, idempotency_key)
        if existing:
            # A retried submit. If the first attempt saved the report but not its
            # conversation, finish that now; otherwise just return what exists.
            if not await _snapshot_exists(request, str(existing["id"])):
                await _insert_snapshot(request, str(existing["id"]), brand_uuid, snapshot)
                background_tasks.add_task(deliver_report_to_slack, request, str(existing["id"]))
            response.status_code = status.HTTP_200_OK
            return {"feedback": _agent_feedback_out(existing)}

    reply_text = ""
    if payload.message_id:
        target = next((item for item in payload.transcript if item.id == payload.message_id), None)
        if target is None or target.role != "agent":
            raise HTTPException(status_code=422, detail="The reported reply is not part of the attached conversation.")
        reply_text = target.text[:10_000]

    tagged: list[dict[str, str]] = []
    if payload.tagged_people:
        directory = {person["id"]: person for person in await _directory(request, brand_uuid)}
        unknown = [str(person_id) for person_id in payload.tagged_people if str(person_id) not in directory]
        if unknown:
            raise HTTPException(status_code=422, detail="One or more tagged teammates are not available for this brand.")
        tagged = [{"id": str(pid), "name": directory[str(pid)]["name"]} for pid in dict.fromkeys(payload.tagged_people)]

    config = slack.platform_config(brand.get("platform_config"))
    metadata = {
        "brand_name": str(brand.get("name") or ""),
        "agent_name": str(config.get("ai_agent_name") or "").strip(),
        "agent_host": urlparse(str(config.get("ai_support_agent_url") or "")).hostname or "",
        "environment": request.app.state.settings.env,
        "snapshot_source": snapshot["snapshot_source"],
    }
    row = {
        "brand_id": brand_uuid,
        "submitted_by": str(user.id),
        "session_id": payload.session_id,
        "scope": "reply" if payload.message_id else "conversation",
        "message_id": payload.message_id or None,
        "agent_reply": reply_text,
        "tags": [],
        "note": payload.description,
        "ideal_reply": payload.expected_behavior,
        # No category means a feedback note the tester chose to send to the team.
        "kind": "issue_report" if payload.category else "feedback",
        "category": payload.category,
        "severity": payload.severity if payload.category else None,
        "agent_metadata": metadata,
        "tagged_people": tagged,
        "idempotency_key": idempotency_key,
        "slack_delivery_status": "pending",
    }
    try:
        rows = await _supabase_write(request, "POST", "orb_agent_feedback", payload=row)
    except HTTPException:
        # Two identical submits racing: the unique index rejects the second.
        if idempotency_key:
            existing = await _find_by_key(request, user, idempotency_key)
            if existing:
                response.status_code = status.HTTP_200_OK
                return {"feedback": _agent_feedback_out(existing)}
        raise
    if not rows:
        raise HTTPException(status_code=503, detail="Supabase did not return the saved report.")
    saved = rows[0]

    try:
        await _insert_snapshot(request, str(saved["id"]), brand_uuid, snapshot)
    except HTTPException as exc:
        await _record(request, str(saved["id"]), {"slack_delivery_status": "failed", "slack_last_error": "The conversation snapshot could not be saved."})
        raise HTTPException(status_code=503, detail="The report was saved but its conversation could not be attached. Send it again to finish.") from exc

    background_tasks.add_task(deliver_report_to_slack, request, str(saved["id"]))
    return {"feedback": _agent_feedback_out(saved)}


@router.get("/brands/{brand_id}/agent-feedback/{feedback_id}")
async def get_agent_issue_report(
    brand_id: str, feedback_id: UUID, request: Request, user: User = Depends(current_user)
) -> dict[str, Any]:
    """One report with its saved conversation. Authorised by Supabase RLS: admins and
    members of the brand can read it, nobody else."""
    brand = await _remote_brand(request, brand_id)
    rows = await _supabase_rows(
        request,
        "orb_agent_feedback",
        {"select": _REPORT_COLUMNS, "id": f"eq.{feedback_id}", "brand_id": f"eq.{brand['id']}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Report not found.")
    snapshot_rows = await _supabase_rows(
        request,
        "orb_agent_feedback_snapshots",
        {"select": "messages,message_count,truncated,snapshot_source,sha256,created_at", "feedback_id": f"eq.{feedback_id}", "limit": "1"},
    )
    report = _agent_feedback_out(rows[0])
    report["agent_metadata"] = rows[0].get("agent_metadata") if isinstance(rows[0].get("agent_metadata"), dict) else {}
    if await _is_admin(request, user):
        report["slack_last_error"] = rows[0].get("slack_last_error")
        report["slack_attempts"] = rows[0].get("slack_attempts")
    return {"feedback": report, "snapshot": snapshot_rows[0] if snapshot_rows else None}


@router.post("/brands/{brand_id}/agent-feedback/{feedback_id}/slack-resend")
async def resend_agent_issue_report(
    brand_id: str,
    feedback_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    _: User = Depends(_admin),
) -> dict[str, Any]:
    """Retry a report whose Slack delivery failed. Safe to repeat: a message already
    posted is reused and only the transcript upload is retried."""
    brand = await _remote_brand(request, brand_id)
    rows = await _supabase_rows(
        request,
        "orb_agent_feedback",
        {"select": _REPORT_COLUMNS, "id": f"eq.{feedback_id}", "brand_id": f"eq.{brand['id']}", "slack_delivery_status": "neq.not_applicable", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Report not found.")
    report = rows[0]
    if report.get("slack_delivery_status") == "sent":
        raise HTTPException(status_code=409, detail="This report was already sent to Slack.")
    await _record(request, str(feedback_id), {"slack_delivery_status": "pending"})
    background_tasks.add_task(deliver_report_to_slack, request, str(feedback_id))
    report["slack_delivery_status"] = "pending"
    return {"feedback": _agent_feedback_out(report)}
