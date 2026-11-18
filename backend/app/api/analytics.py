"""Real, brand-scoped analytics and conversations for the client dashboard.

Everything here is read from the live conversation tables (chat_threads, chat_messages,
ai_escalations, reply_feedback, reply_diagnostics). Nothing is simulated: where no real
source exists (customer satisfaction ratings, revenue) the response says so in
``availability`` and the numbers are simply absent. Replies are split by who sent them (see
``classify_sender``).

Access: an admin, a member of the brand (``orb_brand_memberships``) or someone assigned to
it (``brand_assignments``, matched on email). Data is read with the service role only after
that check, and every query is filtered by ``brand_id``.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import date, datetime, time as dtime, timedelta, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.api.feedback_reports import _is_admin
from app.api.knowledge import _supabase_service_headers, _supabase_service_rows
from app.auth import User, current_user

logger = logging.getLogger("orb.analytics")

router = APIRouter(prefix="/api", tags=["brand analytics"])

RangeId = Literal["today", "yesterday", "7d", "15d", "30d", "custom"]
# "Last N days" is N calendar days ending today (today included, so far).
ROLLING_DAYS = {"7d": 7, "15d": 15, "30d": 30}
MAX_CUSTOM_DAYS = 180
# Orb's default workspace timezone (see overview block settings); used for day and hour buckets.
ANALYTICS_TIMEZONE = "Asia/Kolkata"
_CACHE_SECONDS = 60
_cache: dict[tuple[str, str], tuple[float, dict[str, Any]]] = {}
_support_cache: dict[tuple[str, str, str, str], tuple[float, dict[str, Any]]] = {}
# A successful access check is remembered briefly: each dashboard load makes several calls and
# every one would otherwise repeat 3 to 5 database reads. Only grants are cached, never refusals,
# and access removed from someone stops working within AUTH_CACHE_SECONDS.
AUTH_CACHE_SECONDS = 120
_auth_cache: dict[tuple[str, str], float] = {}

UNAVAILABLE = {
    "customer_satisfaction": {
        "available": False,
        "reason": "Customer satisfaction ratings are not collected yet, so no score can be shown.",
    },
    "revenue_attribution": {
        "available": False,
        "reason": "Orders and AI-attributed revenue are not connected yet.",
    },
}


# ---------------------------------------------------------------------------
# Date ranges
# ---------------------------------------------------------------------------
def _analytics_tz():
    """The workspace timezone. India has no daylight saving, so a fixed offset is an exact
    fallback where the system has no timezone database."""
    try:
        return ZoneInfo(ANALYTICS_TIMEZONE)
    except ZoneInfoNotFoundError:
        return timezone(timedelta(hours=5, minutes=30))


def resolve_window(range_id: str, from_date: date | None = None, to_date: date | None = None, now: datetime | None = None) -> dict[str, datetime]:
    """Turn a range choice into exact UTC instants, aligned to calendar days in the workspace
    timezone, plus the equally long window just before it for the comparison.

    today / yesterday / last N days / a custom from-to (both days inclusive). A window that
    reaches today ends at the current moment, and its comparison window ends at the same time of
    day earlier, so a half-finished day is never compared against a whole one.
    """
    now = now or datetime.now(timezone.utc)
    tz = _analytics_tz()
    today = now.astimezone(tz).date()

    def midnight(day: date) -> datetime:
        return datetime.combine(day, dtime.min, tzinfo=tz).astimezone(timezone.utc)

    if range_id == "today":
        first = last = today
    elif range_id == "yesterday":
        first = last = today - timedelta(days=1)
    elif range_id in ROLLING_DAYS:
        first, last = today - timedelta(days=ROLLING_DAYS[range_id] - 1), today
    elif range_id == "custom":
        if from_date is None or to_date is None:
            raise HTTPException(status_code=422, detail="Choose both a start date and an end date.")
        if from_date > to_date:
            raise HTTPException(status_code=422, detail="The start date must be on or before the end date.")
        if from_date > today:
            raise HTTPException(status_code=422, detail="The start date cannot be in the future.")
        first, last = from_date, min(to_date, today)
        if (last - first).days + 1 > MAX_CUSTOM_DAYS:
            raise HTTPException(status_code=422, detail=f"Choose a range of at most {MAX_CUSTOM_DAYS} days.")
    else:
        raise HTTPException(status_code=422, detail="Unknown date range.")

    days = (last - first).days + 1
    start = midnight(first)
    end = min(midnight(last + timedelta(days=1)), now)
    shift = timedelta(days=days)
    return {"start": start, "end": end, "previous_start": start - shift, "previous_end": end - shift, "days": days}


# ---------------------------------------------------------------------------
# Who sent a reply
# ---------------------------------------------------------------------------
SENDERS = ("ai", "team", "automated", "other")


def classify_sender(role: Any, provider_source: Any = None, ai_confirmed: Any = None, agent: Any = None, app_type: Any = None) -> str:
    """Put one message in exactly one group. Must stay identical to the CASE in
    20261124_brand_analytics_reply_senders.sql so a conversation reads the same as the totals.

    ai         the AI agent confirmed it sent the message (``meta_data.ai_confirmed`` is true)
    team       a person sent it (dashboard, or the message names the team member who did)
    automated  a Zoko flow / automation
    other      sent outside Orb, or by the API without an AI confirmation
    """
    if role != "agent":
        return "customer"
    if ai_confirmed is True:
        return "ai"
    if provider_source in ("dashboard", "webhook_linked") or str(agent or "").strip():
        return "team"
    if app_type == "flow":
        return "automated"
    return "other"


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------
async def _read_access_row(request: Request, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    """Read one of the tables the access check depends on.

    A failure here is a server problem, not something a customer should see: the details
    (table names, database messages) go to the log and the page gets a plain message.
    """
    try:
        return await _supabase_service_rows(request, table, params)
    except HTTPException as exc:
        logger.error("Access check could not read %s: %s", table, exc.detail)
        raise HTTPException(status_code=503, detail="Access to this brand could not be checked right now. Please try again shortly.") from exc


def _remember_access(user: User, brand_id: UUID) -> None:
    if len(_auth_cache) > 500:
        _auth_cache.clear()
    _auth_cache[(str(user.id), str(brand_id))] = time.monotonic() + AUTH_CACHE_SECONDS


async def _authorize_brand(request: Request, user: User, brand_id: UUID) -> dict[str, Any]:
    """Return the brand row, or raise 404 / 403."""
    granted_until = _auth_cache.get((str(user.id), str(brand_id)))
    if granted_until and granted_until > time.monotonic():
        return {"id": str(brand_id)}

    brands = await _read_access_row(request, "brands", {"select": "id,name", "id": f"eq.{brand_id}", "limit": "1"})
    if not brands:
        raise HTTPException(status_code=404, detail="Brand not found.")
    if request.app.state.settings.auth_disabled or await _is_admin(request, user):
        _remember_access(user, brand_id)
        return brands[0]

    members = await _read_access_row(
        request,
        "orb_brand_memberships",
        {"select": "brand_id", "brand_id": f"eq.{brand_id}", "user_id": f"eq.{user.id}", "limit": "1"},
    )
    if members:
        _remember_access(user, brand_id)
        return brands[0]

    # Brand team assignments are keyed by email. Compare in Python so a character such as
    # "_" in an address is never treated as a wildcard by a LIKE filter.
    profile = await _read_access_row(request, "orb_profiles", {"select": "email", "id": f"eq.{user.id}", "limit": "1"})
    email = str((profile[0].get("email") if profile else "") or "").strip().lower()
    if email:
        assigned = await _read_access_row(
            request, "brand_assignments", {"select": "email", "brand_id": f"eq.{brand_id}", "limit": "1000"}
        )
        if any(str(row.get("email") or "").strip().lower() == email for row in assigned):
            _remember_access(user, brand_id)
            return brands[0]
    raise HTTPException(status_code=403, detail="You don't have access to this brand's analytics.")


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
async def _rpc_analytics(request: Request, brand_id: UUID, start: datetime, end: datetime) -> dict[str, Any]:
    settings = request.app.state.settings
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/orb_brand_analytics",
                headers=_supabase_service_headers(request, write=True, prefer="return=representation"),
                json={"p_brand_id": str(brand_id), "p_from": start.isoformat(), "p_to": end.isoformat(), "p_tz": ANALYTICS_TIMEZONE},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Analytics could not be reached.") from exc
    if response.status_code == 404:
        raise HTTPException(status_code=503, detail="Analytics is not set up yet. Run migration 20261119_brand_analytics.sql.")
    if response.is_error:
        logger.warning("orb_brand_analytics failed (%s): %s", response.status_code, response.text[:300])
        raise HTTPException(status_code=503, detail="Analytics could not be calculated right now.")
    data = response.json()
    return data if isinstance(data, dict) else {}


def _pct(part: float, whole: float) -> float | None:
    return round(part / whole * 100, 1) if whole else None


def _change(current: float | None, previous: float | None) -> dict[str, Any]:
    """Percent change against the previous period; absent when there is nothing to compare."""
    if current is None or not previous:
        return {"previous": previous, "change_pct": None}
    return {"previous": previous, "change_pct": round((current - previous) / previous * 100, 1)}


def _points(current: float | None, previous: float | None) -> dict[str, Any]:
    if current is None or previous is None:
        return {"previous": previous, "change_points": None}
    return {"previous": previous, "change_points": round(current - previous, 1)}


def _summary(raw: dict[str, Any]) -> dict[str, Any]:
    conv = raw.get("conversations") or {}
    msgs = raw.get("messages") or {}
    esc = raw.get("escalations") or {}
    first = raw.get("first_reply") or {}
    started = int(conv.get("started") or 0)
    active = int(conv.get("active") or 0)
    answered = int(first.get("answered_conversations") or 0)
    # Older versions of the database function have no per-sender numbers; say so rather than
    # showing zeros that look like real counts.
    by_sender = msgs.get("by_sender")
    split_available = isinstance(by_sender, dict)
    by_sender = by_sender if split_available else {}
    handling = conv.get("handling") if isinstance(conv.get("handling"), dict) else {}
    ai_only = int(handling.get("ai_only") or 0)
    ai_and_team = int(handling.get("ai_and_team") or 0)
    # The first reply is measured for conversations that started in the period; an older database
    # function measured every active conversation, so fall back to that denominator.
    eligible = int(first["eligible_conversations"]) if "eligible_conversations" in first else active
    return {
        "conversations_started": started,
        "active_conversations": active,
        "customer_messages": int(msgs.get("customer") or 0),
        "replies_sent": int(msgs.get("replies") or 0),
        "replies_from_dashboard": int(msgs.get("sent_from_dashboard") or 0),
        "reply_split_available": split_available,
        "replies": {**{key: int(by_sender.get(key) or 0) for key in SENDERS}, "total": int(msgs.get("replies") or 0)},
        "handling": {
            "ai_only": ai_only,
            "ai_and_team": ai_and_team,
            "team_only": int(handling.get("team_only") or 0),
            "other_only": int(handling.get("other_only") or 0),
            "unanswered": int(handling.get("unanswered") or 0),
            "ai_involved_rate": _pct(ai_only + ai_and_team, active),
            "ai_only_rate": _pct(ai_only, active),
        },
        "resolved_conversations": int(conv.get("resolved") or 0),
        "resolution_rate": _pct(int(conv.get("resolved") or 0), started),
        "median_hours_to_resolve": conv.get("median_hours_to_resolve"),
        "escalated_conversations": int(esc.get("conversations_in_active") or 0),
        "escalation_rate": _pct(int(esc.get("conversations_in_active") or 0), active),
        "escalation_records": int(esc.get("records") or 0),
        "first_reply": {
            "answered_conversations": answered,
            "eligible_conversations": eligible,
            "answered_share": _pct(answered, eligible),
            "median_seconds": first.get("median_seconds"),
            "p90_seconds": first.get("p90_seconds"),
            "by_sender": [
                {
                    "sender": str(item.get("sender")),
                    "conversations": int(item.get("conversations") or 0),
                    "median_seconds": item.get("median_seconds"),
                    "p90_seconds": item.get("p90_seconds"),
                }
                for item in (first.get("by_sender") or [])
                if isinstance(item, dict) and item.get("sender") in SENDERS
            ],
        },
    }


def shape_analytics(brand_id: UUID, range_id: str, current: dict[str, Any], previous: dict[str, Any]) -> dict[str, Any]:
    """Turn the database's raw aggregates into the response the dashboard reads."""
    now = _summary(current)
    before = _summary(previous)
    topics = current.get("topics") or {}
    started = now["conversations_started"]
    tagged = int(topics.get("tagged_conversations") or 0)
    reviews = current.get("reviews") or {}
    return {
        "brand_id": str(brand_id),
        "range": range_id,
        "timezone": ANALYTICS_TIMEZONE,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": {"from": (current.get("range") or {}).get("from"), "to": (current.get("range") or {}).get("to")},
        "previous_period": {"from": (previous.get("range") or {}).get("from"), "to": (previous.get("range") or {}).get("to")},
        "summary": now,
        "comparison": {
            "conversations_started": _change(now["conversations_started"], before["conversations_started"]),
            "customer_messages": _change(now["customer_messages"], before["customer_messages"]),
            "replies_sent": _change(now["replies_sent"], before["replies_sent"]),
            "ai_replies": _change(now["replies"]["ai"], before["replies"]["ai"]),
            "team_replies": _change(now["replies"]["team"], before["replies"]["team"]),
            "escalated_conversations": _change(now["escalated_conversations"], before["escalated_conversations"]),
            "resolution_rate": _points(now["resolution_rate"], before["resolution_rate"]),
            "escalation_rate": _points(now["escalation_rate"], before["escalation_rate"]),
        },
        "trends": [
            {
                "date": str(day.get("day")),
                "conversations": int(day.get("conversations") or 0),
                "customer_messages": int(day.get("customer_messages") or 0),
                "replies": int(day.get("replies") or 0),
                "ai_replies": int(day.get("ai_replies") or 0),
                "team_replies": int(day.get("team_replies") or 0),
                "automated_replies": int(day.get("automated_replies") or 0),
                "other_replies": int(day.get("other_replies") or 0),
            }
            for day in (current.get("daily") or [])
        ],
        "hourly": [
            {"hour": int(item.get("hour") or 0), "customer_messages": int(item.get("customer_messages") or 0)}
            for item in (current.get("hourly") or [])
        ],
        "platforms": (current.get("conversations") or {}).get("by_platform") or [],
        "topics": {
            "items": topics.get("items") or [],
            "tagged_conversations": tagged,
            "total_conversations": started,
            "coverage_pct": _pct(tagged, started),
        },
        "products": current.get("products") or [],
        "team_reviews": {
            "up": int(reviews.get("up") or 0),
            "down": int(reviews.get("down") or 0),
            "other": int(reviews.get("other") or 0),
            "failure_categories": reviews.get("failure_categories") or [],
        },
        "availability": UNAVAILABLE,
    }


@router.get("/brands/{brand_id}/analytics")
async def brand_analytics(
    brand_id: UUID,
    request: Request,
    range: RangeId = Query(default="30d"),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    await _authorize_brand(request, user, brand_id)
    window = resolve_window(range, from_date, to_date)
    key = (str(brand_id), range, str(from_date) if range == "custom" else "", str(to_date) if range == "custom" else "")
    cached = _cache.get(key)
    if cached and time.monotonic() - cached[0] < _CACHE_SECONDS:
        return cached[1]
    current, previous = await asyncio.gather(
        _rpc_analytics(request, brand_id, window["start"], window["end"]),
        _rpc_analytics(request, brand_id, window["previous_start"], window["previous_end"]),
    )
    result = shape_analytics(brand_id, range, current, previous)
    if len(_cache) > 300:
        _cache.clear()
    _cache[key] = (time.monotonic(), result)
    return result


# ---------------------------------------------------------------------------
# Support performance (the numbers on the Pixie agent dashboard)
# ---------------------------------------------------------------------------
# Pixie's agent dashboard reads these KPIs from the database function ``get_agent_chat_stats``.
# Calling the same function here means Orb and Pixie always agree on them. The function is built
# around human support work: "incoming chats" are customers who wrote in, "handled chats" are
# conversations a person replied in or resolved, replies exclude template and failed messages,
# and response times are averages adjusted to the brand's support hours.
async def _rpc_support_stats(request: Request, brand_id: UUID, start: datetime, end: datetime) -> dict[str, Any]:
    settings = request.app.state.settings
    tz = _analytics_tz()
    last_moment = end - timedelta(milliseconds=1)          # Pixie's ranges are inclusive, ending at 23:59:59.999
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/get_agent_chat_stats",
                headers=_supabase_service_headers(request, write=True, prefer="return=representation"),
                json={
                    "p_agent_email": None,                  # every agent: a client never sees one person's numbers
                    "p_brand_id": str(brand_id),
                    "p_from": start.isoformat(),
                    "p_to": last_moment.isoformat(),
                    "p_from_date": start.astimezone(tz).date().isoformat(),
                    "p_to_date": last_moment.astimezone(tz).date().isoformat(),
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Support performance could not be reached.") from exc
    if response.status_code == 404:
        raise HTTPException(status_code=503, detail="Support performance is not available on this database.")
    if response.is_error:
        logger.warning("get_agent_chat_stats failed (%s): %s", response.status_code, response.text[:300])
        raise HTTPException(status_code=503, detail="Support performance could not be calculated right now.")
    data = response.json()
    return data if isinstance(data, dict) else {}


def _count(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _seconds(value: Any) -> int | None:
    try:
        return None if value is None else int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _support_numbers(raw: dict[str, Any]) -> dict[str, Any]:
    handled = _count(raw.get("total_chats"))
    resolved = _count(raw.get("resolved_chats"))
    channels = raw.get("channel_distribution") if isinstance(raw.get("channel_distribution"), dict) else {}
    return {
        "incoming_chats": _count(raw.get("incoming_chats")),
        "handled_chats": handled,
        "resolved_chats": resolved,
        "resolved_share": _pct(resolved, handled),
        "replies_sent": _count(raw.get("replies_sent")),
        "first_response_seconds": _seconds(raw.get("frt_seconds")),
        "average_handle_seconds": _seconds(raw.get("aht_seconds")),
        "channels": sorted(
            ({"channel": str(name), "chats": _count(count)} for name, count in channels.items()),
            key=lambda item: (-item["chats"], item["channel"]),
        ),
    }


def shape_support_kpis(brand_id: UUID, range_id: str, current: dict[str, Any], previous: dict[str, Any], window: dict[str, Any]) -> dict[str, Any]:
    now = _support_numbers(current)
    before = _support_numbers(previous)
    return {
        "brand_id": str(brand_id),
        "range": range_id,
        "timezone": ANALYTICS_TIMEZONE,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": {"from": window["start"].isoformat(), "to": window["end"].isoformat()},
        "previous_period": {"from": window["previous_start"].isoformat(), "to": window["previous_end"].isoformat()},
        "source": "pixie",
        "summary": now,
        "comparison": {
            key: _change(now[key], before[key])
            for key in ("incoming_chats", "handled_chats", "resolved_chats", "replies_sent", "first_response_seconds", "average_handle_seconds")
        },
    }


@router.get("/brands/{brand_id}/support-kpis")
async def brand_support_kpis(
    brand_id: UUID,
    request: Request,
    range: RangeId = Query(default="30d"),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    await _authorize_brand(request, user, brand_id)
    window = resolve_window(range, from_date, to_date)
    key = (str(brand_id), range, str(from_date) if range == "custom" else "", str(to_date) if range == "custom" else "")
    cached = _support_cache.get(key)
    if cached and time.monotonic() - cached[0] < _CACHE_SECONDS:
        return cached[1]
    current, previous = await asyncio.gather(
        _rpc_support_stats(request, brand_id, window["start"], window["end"]),
        _rpc_support_stats(request, brand_id, window["previous_start"], window["previous_end"]),
    )
    result = shape_support_kpis(brand_id, range, current, previous, window)
    if len(_support_cache) > 300:
        _support_cache.clear()
    _support_cache[key] = (time.monotonic(), result)
    return result


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------
_SEARCH_UNSAFE = re.compile(r"[*,()%_\\\"'\[\]{}:;]")


def clean_search(term: str | None) -> str:
    """Make a free-text term safe inside a PostgREST filter (no wildcards or syntax)."""
    return re.sub(r"\s+", " ", _SEARCH_UNSAFE.sub(" ", term or "")).strip()[:60]


def mask_contact(value: Any) -> str:
    """Show only the last four digits of a phone-like id, never the full number."""
    digits = re.sub(r"\D", "", str(value or ""))
    return f"••••{digits[-4:]}" if len(digits) >= 4 else ""


def _clip(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


async def _service_get(request: Request, table: str, params: dict[str, str], *, count: bool = False) -> tuple[list[dict[str, Any]], int | None]:
    settings = request.app.state.settings
    headers = _supabase_service_headers(request)
    if count:
        headers["Prefer"] = "count=exact"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}", params=params, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Conversations could not be reached.") from exc
    if response.is_error:
        logger.warning("Reading %s failed (%s): %s", table, response.status_code, response.text[:300])
        raise HTTPException(status_code=503, detail="Conversations could not be loaded right now.")
    total = None
    content_range = response.headers.get("content-range", "")
    if "/" in content_range and content_range.rsplit("/", 1)[1].isdigit():
        total = int(content_range.rsplit("/", 1)[1])
    data = response.json()
    return (data if isinstance(data, list) else []), total


def _conversation_out(row: dict[str, Any]) -> dict[str, Any]:
    details = row.get("customer_details") if isinstance(row.get("customer_details"), dict) else {}
    tags = row.get("tags") if isinstance(row.get("tags"), list) else []
    return {
        "id": str(row.get("id") or ""),
        "platform": str(row.get("platform") or "unknown"),
        "customer_name": _clip(details.get("senderName"), 80) or "Customer",
        "contact": mask_contact(details.get("waId")),
        "preview": _clip(row.get("last_message_preview"), 160),
        "last_direction": str(row.get("latest_message_direction") or ""),
        "status": "resolved" if str(row.get("workflow_status") or "").lower() == "resolved" else "open",
        "started_at": row.get("created_at"),
        "last_activity_at": row.get("last_activity_at") or row.get("created_at"),
        "resolved_at": row.get("resolved_at"),
        "topics": [_clip(tag, 60) for tag in tags[:5] if str(tag).strip()],
        "summary": _clip(row.get("summary"), 300),
    }


@router.get("/brands/{brand_id}/conversations")
async def list_conversations(
    brand_id: UUID,
    request: Request,
    range: RangeId = Query(default="30d"),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    status: Literal["all", "open", "resolved"] = Query(default="all"),
    platform: str | None = Query(default=None, max_length=40, pattern=r"^[A-Za-z0-9_-]+$"),
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=100_000),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    await _authorize_brand(request, user, brand_id)
    window = resolve_window(range, from_date, to_date)
    start, end = window["start"].isoformat(), window["end"].isoformat()
    params = {
        "select": "id,platform,customer_details,last_message_preview,latest_message_direction,workflow_status,created_at,resolved_at,last_activity_at,tags:meta_data->genie_auto_tags,summary:meta_data->>genie_auto_summary",
        "brand_id": f"eq.{brand_id}",
        "order": "last_activity_at.desc.nullslast",
        "limit": str(limit),
        "offset": str(offset),
    }
    if status == "resolved":
        params["workflow_status"] = "eq.resolved"
    elif status == "open":
        params["workflow_status"] = "neq.resolved"
    if platform:
        params["platform"] = f"eq.{platform}"
    # A conversation belongs to the period if it started in it OR its latest message was in it, so
    # a chat that began yesterday and continued today still shows under "Yesterday".
    in_period = f"or(and(last_activity_at.gte.{start},last_activity_at.lt.{end}),and(created_at.gte.{start},created_at.lt.{end}))"
    term = clean_search(search)
    if len(term) >= 2:
        params["and"] = f"({in_period},or(last_message_preview.ilike.*{term}*,customer_details->>senderName.ilike.*{term}*))"
    else:
        params["and"] = f"({in_period})"
    rows, total = await _service_get(request, "chat_threads", params, count=True)
    return {
        "items": [_conversation_out(row) for row in rows],
        "total": total if total is not None else len(rows) + offset,
        "limit": limit,
        "offset": offset,
    }


@router.get("/brands/{brand_id}/conversations/{thread_id}/messages")
async def conversation_messages(
    brand_id: UUID, thread_id: UUID, request: Request, user: User = Depends(current_user)
) -> dict[str, Any]:
    await _authorize_brand(request, user, brand_id)
    threads, _ = await _service_get(
        request, "chat_threads",
        {"select": "id,conversation_id,platform,customer_details,workflow_status,created_at,resolved_at", "id": f"eq.{thread_id}", "brand_id": f"eq.{brand_id}", "limit": "1"},
    )
    if not threads or not threads[0].get("conversation_id"):
        raise HTTPException(status_code=404, detail="Conversation not found.")
    thread = threads[0]
    rows, _ = await _service_get(
        request, "chat_messages",
        {
            "select": "id,role,content,media_type,media_url,message_status,provider_source,timestamp,ai:meta_data->ai_confirmed,agent:meta_data->>agent,app_type:meta_data->raw->>appType",
            "brand_id": f"eq.{brand_id}",
            "conversation_id": f"eq.{thread['conversation_id']}",
            "role": "in.(customer,agent)",
            "order": "timestamp.asc",
            "limit": "300",
        },
    )
    details = thread.get("customer_details") if isinstance(thread.get("customer_details"), dict) else {}
    return {
        "conversation": {
            "id": str(thread["id"]),
            "platform": str(thread.get("platform") or "unknown"),
            "customer_name": _clip(details.get("senderName"), 80) or "Customer",
            "contact": mask_contact(details.get("waId")),
            "status": "resolved" if str(thread.get("workflow_status") or "").lower() == "resolved" else "open",
            "started_at": thread.get("created_at"),
            "resolved_at": thread.get("resolved_at"),
        },
        "messages": [
            {
                "id": str(row.get("id") or ""),
                # customer | ai | team | automated | other. Which team member sent a reply is never
                # included: the client sees "team", not a person's address.
                "sender": classify_sender(row.get("role"), row.get("provider_source"), row.get("ai"), row.get("agent"), row.get("app_type")),
                "sent_from_dashboard": row.get("provider_source") == "dashboard",
                "text": _clip(row.get("content"), 6000),
                "media_type": row.get("media_type"),
                "media_url": row.get("media_url") if str(row.get("media_url") or "").startswith(("http://", "https://")) else None,
                "status": row.get("message_status"),
                "timestamp": row.get("timestamp"),
            }
            for row in rows
        ],
    }


# ---------------------------------------------------------------------------
# Catalog summary
# ---------------------------------------------------------------------------
_catalog_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _variant_list(value: Any) -> list[dict[str, Any]]:
    """Variants arrive as a list, as {"nodes": [...]} or as {"edges": [{"node": ...}]}."""
    if isinstance(value, dict):
        if isinstance(value.get("nodes"), list):
            value = value["nodes"]
        elif isinstance(value.get("edges"), list):
            value = [edge.get("node") for edge in value["edges"] if isinstance(edge, dict)]
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _truthy(value: Any) -> bool:
    return str(value or "").strip().lower() in {"true", "1", "yes"}


def catalog_product(row: dict[str, Any]) -> dict[str, Any] | None:
    """Reduce one stored product record to what the dashboard shows, or None if it is not for sale.

    Mirrors the rules the browser used on the full record: only active or published products
    count, and stock comes from the variants' inventory. With no inventory figures at all a
    product is not reported as out of stock (unknown is not zero).
    """
    status = str(row.get("pstatus") or row.get("sstatus") or row.get("astatus") or "").strip().lower()
    if status and status not in {"active", "published"}:
        return None
    variants = next((v for v in (_variant_list(row.get(key)) for key in ("v1", "v2", "v3", "v4")) if v), [])
    quantities: list[float] = []
    for variant in variants:
        raw = variant.get("inventoryQuantity", variant.get("inventory_quantity"))
        try:
            quantities.append(float(raw))
        except (TypeError, ValueError):
            continue
    if quantities:
        out_of_stock = sum(quantities) <= 0
    else:
        out_of_stock = _truthy(row.get("flag")) or _truthy(row.get("sflag")) or _truthy(row.get("aflag"))
    name = next((str(row.get(key)).strip() for key in ("title", "name", "stitle", "atitle") if str(row.get(key) or "").strip()), "Untitled product")
    handle = next((str(row.get(key)).strip() for key in ("handle", "shandle", "ahandle") if str(row.get(key) or "").strip()), "")
    return {"id": str(row.get("id") or ""), "name": name, "handle": handle, "out_of_stock": out_of_stock}


_CATALOG_SELECT = (
    "id,status,"
    "pstatus:payload->>status,sstatus:payload->shopify->>status,astatus:payload->shopify_admin->>status,"
    "title:payload->>title,name:payload->>name,stitle:payload->shopify->>title,atitle:payload->shopify_admin->>title,"
    "handle:payload->>handle,shandle:payload->shopify->>handle,ahandle:payload->shopify_admin->>handle,"
    "flag:payload->>out_of_stock,sflag:payload->shopify->>out_of_stock,aflag:payload->shopify_admin->>out_of_stock,"
    "v1:payload->variants,v2:payload->shopify->variants,v3:payload->shopify_admin->variants,v4:payload->structured->shopify_admin->variants"
)


@router.get("/brands/{brand_id}/catalog-summary")
async def catalog_summary(brand_id: UUID, request: Request, user: User = Depends(current_user)) -> dict[str, Any]:
    """A light view of the synced Shopify catalog: name, handle and stock per product.

    The full product records (media, variants, metafields) run to megabytes; the dashboard
    only needs these few fields. ``source`` is ``"none"`` when the brand has no Shopify-synced
    products, so the caller can fall back to the full listing.
    """
    await _authorize_brand(request, user, brand_id)
    cached = _catalog_cache.get(str(brand_id))
    if cached and time.monotonic() - cached[0] < _CACHE_SECONDS:
        return cached[1]
    rows, _ = await _service_get(
        request,
        "orb_products",
        {"select": _CATALOG_SELECT, "brand_id": f"eq.{brand_id}", "status": "eq.active", "provider": "eq.shopify_admin", "order": "synced_at.desc", "limit": "1000"},
    )
    if not rows:
        result: dict[str, Any] = {"source": "none", "count": 0, "out_of_stock_count": 0, "products": []}
    else:
        products = [item for item in (catalog_product(row) for row in rows) if item]
        result = {
            "source": "shopify",
            "count": len(products),
            "out_of_stock_count": sum(1 for item in products if item["out_of_stock"]),
            "products": products,
        }
    if len(_catalog_cache) > 200:
        _catalog_cache.clear()
    _catalog_cache[str(brand_id)] = (time.monotonic(), result)
    return result
