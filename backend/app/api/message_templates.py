"""Brand WhatsApp/Zoko message templates and safe Zoko synchronization."""
from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.knowledge import (
    _admin,
    _remote_brand_by_name,
    _supabase_service_rows,
    _supabase_service_write,
)
from app.auth import User, current_user


router = APIRouter(prefix="/api/templates", tags=["message templates"])
_ZOKO_URL = "https://chat.zoko.io/v2/account/templates"


class TemplateSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    brand_name: str = Field(min_length=1, max_length=160)
    action: str = Field(default="sync", pattern="^(preview|sync)$")


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _slug(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", value.upper()).strip("_")


def _normalise(value: Any) -> str:
    return " ".join(str(value or "").split()).lower()


def _parse_description(value: Any) -> dict[str, Any]:
    """Mirror the established Zoko sync parser used by the Edge Function."""
    text = str(value or "").replace("\r\n", "\n")
    matches = list(re.finditer(r"^(Header|Body|Footer|Buttons):[ \t]?", text, re.MULTILINE))
    if not matches:
        return {"header": "", "body": text.strip(), "footer": "", "buttons": []}
    sections: dict[str, str] = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        sections[match.group(1)] = text[match.end():end].strip()
    return {
        "header": sections.get("Header", ""),
        "body": sections.get("Body", ""),
        "footer": sections.get("Footer", ""),
        "buttons": [label.strip() for label in re.findall(r"\[([^\]]+)\]", sections.get("Buttons", ""))],
    }


def _template_text(parsed: dict[str, Any]) -> str:
    output = ""
    if parsed["header"]:
        output += f"[HEADER]: {parsed['header']}\n\n"
    output += parsed["body"]
    if parsed["footer"]:
        output += f"\n\n[FOOTER]: {parsed['footer']}"
    if parsed["buttons"]:
        output += "\n\n[BUTTONS]:\n" + "\n".join(f"- {item}" for item in parsed["buttons"])
    return output


def _zoko_key(brand_name: str, config: dict[str, Any]) -> str:
    """Read only server-side config; client code never receives this value."""
    configured = [config.get("zoko_key"), config.get("zoko_api_key")]
    for value in configured:
        if not isinstance(value, str) or not value.strip():
            continue
        candidate = value.strip()
        # A brand can point at a Railway variable by name, e.g.
        # ZOKO_THE_DEARIST_KEY. This keeps individual tokens out of Supabase.
        if os.getenv(candidate):
            return os.getenv(candidate, "").strip()
        if candidate.startswith("x-") or candidate.startswith("zoko_"):
            return candidate
    return (
        os.getenv(f"ZOKO_{_slug(brand_name)}_KEY", "").strip()
        or os.getenv("ZOKO_API_KEY", "").strip()
    )


def _template_out(row: dict[str, Any]) -> dict[str, Any]:
    raw_type = str(row.get("template_type") or "")
    _, _, category = raw_type.partition(":")
    return {
        "id": str(row.get("id") or ""),
        "name": str(row.get("template_name") or ""),
        "language": str(row.get("language") or "en"),
        "content": str(row.get("template") or ""),
        "type": category.title() if category else "Other",
        "status": str(row.get("status") or ""),
    }


@router.get("")
async def list_message_templates(
    request: Request, brand_name: str, _: User = Depends(current_user)
) -> dict[str, Any]:
    brand = await _remote_brand_by_name(request, brand_name)
    rows = await _supabase_service_rows(
        request,
        "template_messages",
        {
            "select": "id,template_name,language,template,template_type,status",
            "brand_id": f"eq.{brand['id']}",
            "template_type": "like.zoko_sync*",
            "order": "template_name.asc",
            "limit": "500",
        },
    )
    return {"templates": [_template_out(row) for row in rows], "brand_id": str(brand["id"])}


@router.post("/sync")
async def sync_zoko_templates(
    payload: TemplateSyncRequest,
    request: Request,
    _: User = Depends(_admin),
) -> dict[str, Any]:
    """Preview or safely import Zoko templates without replacing existing rows."""
    brand = await _remote_brand_by_name(request, payload.brand_name)
    api_key = _zoko_key(str(brand.get("name") or payload.brand_name), _as_dict(brand.get("platform_config")))
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No Zoko key is configured. Add ZOKO_{_slug(str(brand.get('name') or payload.brand_name))}_KEY to Railway.",
        )
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(_ZOKO_URL, headers={"apikey": api_key, "Accept": "application/json"})
            response.raise_for_status()
            raw = response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Zoko returned {exc.response.status_code} while loading templates.") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Zoko could not be reached while loading templates.") from exc

    source = raw if isinstance(raw, list) else (raw.get("templates") or raw.get("data") or raw.get("value") or []) if isinstance(raw, dict) else []
    existing = await _supabase_service_rows(
        request, "template_messages", {"select": "id,template_name,language,template", "brand_id": f"eq.{brand['id']}", "template_type": "like.zoko_sync*", "limit": "1000"}
    )
    by_key = {f"{_normalise(row.get('template_name'))}|{_normalise(row.get('language'))}": row for row in existing}
    report: dict[str, list[str]] = {"new": [], "unchanged": [], "differs": [], "skipped_media_header": [], "skipped_inactive": [], "skipped_other": []}
    inserts: list[dict[str, Any]] = []
    for item in source if isinstance(source, list) else []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("templateId") or item.get("templateName") or "").strip()
        if not name:
            continue
        if item.get("channel") and "whatsapp" not in str(item["channel"]).lower():
            report["skipped_other"].append(f"{name} (channel: {item['channel']})")
            continue
        if item.get("active") is False:
            report["skipped_inactive"].append(name)
            continue
        parsed = _parse_description(item.get("templateDesc"))
        if not parsed["body"]:
            report["skipped_other"].append(f"{name} (empty body)")
            continue
        if parsed["header"]:
            report["skipped_media_header"].append(name)
            continue
        language = str(item.get("templateLanguage") or "en")
        found = by_key.get(f"{_normalise(name)}|{_normalise(language)}")
        if found:
            report["unchanged" if _normalise(parsed["body"]) in _normalise(found.get("template")) else "differs"].append(name)
            continue
        report["new"].append(name)
        raw_category = str(item.get("templateCategory") or item.get("templateType") or item.get("category") or "other").strip().lower()
        category = raw_category if raw_category in {"marketing", "utility", "authentication"} else "other"
        inserts.append({"brand_id": brand["id"], "template_name": name, "language": language, "status": "APPROVED", "template_type": f"zoko_sync:{category}", "template": _template_text(parsed)})
    if payload.action == "sync" and inserts:
        await _supabase_service_write(request, "POST", "template_messages", payload=inserts)
    return {"success": True, "dry_run": payload.action == "preview", "total_from_zoko": len(source) if isinstance(source, list) else 0, "inserted": len(inserts) if payload.action == "sync" else 0, "report": report}
