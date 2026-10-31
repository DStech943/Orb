"""Brand category, source-grounded generation, and Qdrant publishing APIs."""
from __future__ import annotations

import csv
from datetime import datetime, timezone
from io import StringIO
from typing import Any, Literal

import asyncpg
import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.auth import User, current_user
from app.db import decode_jsonb
from app.scraper.shopify import list_products
from app.services.llm import GenerationUnavailable, generate_json
from app.services.qdrant import (
    PublishUnavailable,
    publish_points,
    scroll_points,
)

router = APIRouter(prefix="/api", tags=["knowledge"])

CATEGORIES = {
    "fashion_apparel": "Fashion & Apparel",
    "footwear_accessories": "Footwear & Accessories",
    "beauty_personal_care": "Beauty & Personal Care",
    "health_supplements_nutrition": "Health, Supplements & Nutrition",
    "food_snacks": "Food & Snacks",
    "beverages": "Beverages",
    "fresh_perishable_foods": "Fresh & Perishable Foods",
    "home_living_furniture": "Home, Living & Furniture",
    "kitchen_household_essentials": "Kitchen & Household Essentials",
    "electronics_appliances": "Electronics & Appliances",
    "baby_kids_toys": "Baby, Kids & Toys",
    "pets": "Pets",
    "sports_fitness_outdoors": "Sports, Fitness & Outdoors",
    "jewellery_watches_eyewear": "Jewellery, Watches & Eyewear",
    "lifestyle_gifting_specialty": "Lifestyle, Gifting & Specialty Products",
}


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CategoryPatch(RequestModel):
    industry_category: Literal[
        "fashion_apparel", "footwear_accessories", "beauty_personal_care", "health_supplements_nutrition",
        "food_snacks", "beverages", "fresh_perishable_foods", "home_living_furniture",
        "kitchen_household_essentials", "electronics_appliances", "baby_kids_toys", "pets",
        "sports_fitness_outdoors", "jewellery_watches_eyewear", "lifestyle_gifting_specialty",
    ]


class BrandProfilePatch(RequestModel):
    website_url: str = Field(default="", max_length=2_000)
    support_email: str = Field(default="", max_length=320)
    description: str = Field(default="", max_length=4_000)


class BrandVoiceSourceCreate(RequestModel):
    kind: Literal["paste", "csv"] = "paste"
    label: str = Field(default="Voice onboarding", min_length=1, max_length=200)
    content: str = Field(min_length=10, max_length=100_000)


class BrandVoiceProfileApprove(RequestModel):
    profile: dict[str, Any]
    drafting_prompt: str = Field(min_length=40, max_length=20_000)


class TemplateCreate(RequestModel):
    category_code: str
    title: str = Field(min_length=3, max_length=200)
    template_json: dict[str, Any]
    version: int = Field(default=1, ge=1)
    active: bool = True


class GenerateRequest(RequestModel):
    brand_id: str
    outputs: list[Literal["sops", "faqs", "products"]] = Field(min_length=1)
    source_job_ids: list[str] = Field(default_factory=list)


class ContentStatusPatch(RequestModel):
    status: Literal["draft", "approved", "rejected"]


class ShopifySyncRequest(RequestModel):
    website_url: str
    maximum: int = Field(default=1_000, ge=1, le=10_000)


class PublishRequest(RequestModel):
    kinds: list[Literal["sop", "faq", "product"]] = Field(default_factory=lambda: ["sop", "faq", "product"])


class KnowledgePayload(RequestModel):
    brand_name: str = Field(min_length=1)
    payload: dict[str, Any]


class FlowPayload(RequestModel):
    brand_name: str = Field(min_length=1)
    payload: dict[str, Any]


class FlowAssistRequest(RequestModel):
    brand_name: str = Field(min_length=1)
    prompt: str = Field(min_length=8, max_length=5_000)


FLOW_ASSIST_COLUMNS = [
    "Lifecycle stage", "Flow title", "Query category", "Pre-requisites", "Systems used",
    "Checks", "Situation", "Actions", "Level", "Customer message (template)", "Escalate to",
]


def _flow_assist_text(value: Any, limit: int = 2_000) -> str:
    return " ".join(str(value or "").split()).strip()[:limit]


def _flow_assist_csv(generated: Any) -> tuple[str, str]:
    """Convert the model's constrained JSON into the flow importer's table format."""
    if not isinstance(generated, dict):
        raise ValueError("The model returned an unsupported flow format")
    title = _flow_assist_text(generated.get("title"), 300) or "Untitled flow"
    lifecycle = _flow_assist_text(generated.get("lifecycle_stage"), 300)
    query = _flow_assist_text(generated.get("query_category"), 500)
    rows = generated.get("branches")
    if not isinstance(rows, list):
        raise ValueError("The model did not provide flow branches")
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=FLOW_ASSIST_COLUMNS, lineterminator="\n")
    writer.writeheader()
    created = 0
    for branch in rows[:10]:
        if not isinstance(branch, dict):
            continue
        values = {
            "Lifecycle stage": lifecycle,
            "Flow title": title,
            "Query category": _flow_assist_text(branch.get("query_category")) or query,
            "Pre-requisites": _flow_assist_text(branch.get("pre_requisites")),
            "Systems used": _flow_assist_text(branch.get("systems_used")),
            "Checks": _flow_assist_text(branch.get("checks")),
            "Situation": _flow_assist_text(branch.get("situation")),
            "Actions": _flow_assist_text(branch.get("actions")),
            "Level": _flow_assist_text(branch.get("level")) or "AI autonomous",
            "Customer message (template)": _flow_assist_text(branch.get("customer_message")),
            "Escalate to": _flow_assist_text(branch.get("escalate_to")) or "None",
        }
        if all(values[name] for name in ("Query category", "Checks", "Situation", "Actions")):
            writer.writerow(values)
            created += 1
    if not created:
        raise ValueError("The model did not provide a complete flow branch")
    return title, output.getvalue()


async def _admin(request: Request, user: User = Depends(current_user)) -> User:
    if request.app.state.settings.auth_disabled:
        return user
    rows = await _supabase_rows(request, "orb_profiles", {"select": "role", "id": f"eq.{user.id}", "limit": "1"})
    if not rows or rows[0].get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access is required")
    return user


def _supabase_headers(request: Request, *, write: bool = False) -> dict[str, str]:
    settings = request.app.state.settings
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(status_code=503, detail="Supabase REST configuration is missing")
    headers = {
        "apikey": settings.supabase_publishable_key,
        "Authorization": request.headers.get("authorization", f"Bearer {settings.supabase_publishable_key}"),
        "Accept-Profile": "cx_copilot",
    }
    if write:
        headers.update({"Content-Profile": "cx_copilot", "Prefer": "return=representation"})
    return headers


async def _supabase_rows(request: Request, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    settings = request.app.state.settings
    headers = _supabase_headers(request)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}", params=params, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Supabase REST request failed") from exc
    if response.is_error:
        # Supabase's response identifies whether this is a missing migration,
        # schema-cache refresh, or an RLS policy issue. Keep it short enough
        # for the UI, but do not turn every configuration problem into an
        # indistinguishable "Failed to fetch".
        detail = response.text.strip().replace("\n", " ")[:400]
        raise HTTPException(
            status_code=503,
            detail=f"Supabase could not read {table} ({response.status_code}): {detail or 'request rejected'}",
        )
    data = response.json()
    return data if isinstance(data, list) else []


async def _supabase_private_rows(request: Request, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    """Read Brand Voice data through Orb's normal publishable-key API path."""
    settings = request.app.state.settings
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}",
                params=params,
                headers=_supabase_headers(request),
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Supabase Brand Voice request failed") from exc
    if response.is_error:
        detail = response.text.strip().replace("\n", " ")[:400]
        raise HTTPException(status_code=503, detail=f"Supabase could not read {table} ({response.status_code}): {detail or 'request rejected'}")
    data = response.json()
    return data if isinstance(data, list) else []


async def _supabase_write(
    request: Request, method: str, table: str, *, params: dict[str, str] | None = None, payload: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Write through Supabase REST so a separate Postgres URL is never required."""
    settings = request.app.state.settings
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.request(
                method,
                f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}",
                params=params,
                json=payload,
                headers=_supabase_headers(request, write=True),
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Supabase REST request failed") from exc
    if response.is_error:
        detail = response.text.strip().replace("\n", " ")[:400]
        raise HTTPException(
            status_code=503,
            detail=f"Supabase could not update {table} ({response.status_code}): {detail or 'request rejected'}",
        )
    if response.status_code == status.HTTP_204_NO_CONTENT or not response.content:
        return []
    data = response.json()
    return data if isinstance(data, list) else []


async def _supabase_private_write(
    request: Request, method: str, table: str, *, params: dict[str, str] | None = None, payload: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    settings = request.app.state.settings
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.request(
                method,
                f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}",
                params=params,
                json=payload,
                headers=_supabase_headers(request, write=True),
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Supabase Brand Voice update failed") from exc
    if response.is_error:
        detail = response.text.strip().replace("\n", " ")[:400]
        raise HTTPException(status_code=503, detail=f"Supabase could not update {table} ({response.status_code}): {detail or 'request rejected'}")
    if response.status_code == status.HTTP_204_NO_CONTENT or not response.content:
        return []
    data = response.json()
    return data if isinstance(data, list) else []


async def _remote_brand(request: Request, brand_id: str) -> dict[str, Any]:
    rows = await _supabase_rows(
        request,
        "brands",
        {"select": "id,name,description,industry_category,platform_config", "id": f"eq.{brand_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
    return rows[0]


async def _remote_brand_by_name(request: Request, brand_name: str) -> dict[str, Any]:
    rows = await _supabase_rows(
        request,
        "brands",
        {"select": "id,name", "name": f"ilike.{brand_name.strip()}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
    return rows[0]


async def _brand(pool: asyncpg.Pool, brand_id: str) -> asyncpg.Record:
    record = await pool.fetchrow(
        "SELECT id, name, description, industry_category, platform_config FROM cx_copilot.brands WHERE id=$1::uuid",
        brand_id,
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
    return record


async def _brand_by_name(pool: asyncpg.Pool, brand_name: str) -> asyncpg.Record:
    record = await pool.fetchrow(
        "SELECT id, name, description, industry_category, platform_config FROM cx_copilot.brands WHERE lower(name)=lower($1)",
        brand_name,
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
    return record


def _brand_out(record: asyncpg.Record) -> dict[str, Any]:
    value = dict(record)
    platform_config = decode_jsonb(value.get("platform_config"))
    platform_config = platform_config if isinstance(platform_config, dict) else {}
    return {
        "id": str(value["id"]), "name": value["name"], "description": value.get("description"),
        "industry_category": value.get("industry_category"),
        "industry_category_label": CATEGORIES.get(value.get("industry_category")),
        "profile": {
            "website_url": str(platform_config.get("website_url") or ""),
            "support_email": str(platform_config.get("support_email") or ""),
        },
    }


def _voice_source_out(record: asyncpg.Record, *, include_content: bool = True) -> dict[str, Any]:
    value = dict(record)
    result = {
        "id": str(value["id"]),
        "brand_id": str(value["brand_id"]),
        "kind": value["kind"],
        "label": value["label"],
        "created_at": value["created_at"],
        "characters": len(value["raw_content"]),
    }
    if include_content:
        result["content"] = value["raw_content"]
    return result


def _voice_profile_out(record: asyncpg.Record) -> dict[str, Any]:
    value = dict(record)
    return {
        "id": str(value["id"]),
        "brand_id": str(value["brand_id"]),
        "source_ids": [str(item) for item in (decode_jsonb(value["source_ids"]) or [])],
        "profile": decode_jsonb(value["profile"]),
        "drafting_prompt": value["drafting_prompt"],
        "status": value["status"],
        "created_at": value["created_at"],
        "updated_at": value["updated_at"],
    }


def _csv_to_voice_text(content: str) -> str:
    """Make a Google Form-style CSV understandable without a browser CSV dependency."""
    rows = list(csv.reader(StringIO(content)))
    if not rows:
        return ""
    headers = rows[0]
    parts: list[str] = []
    for row_number, row in enumerate(rows[1:] or rows, start=1):
        pairs = [f"{headers[index] if index < len(headers) else f'Field {index + 1}'}: {value.strip()}" for index, value in enumerate(row) if value.strip()]
        if pairs:
            parts.append(f"RESPONSE {row_number}\n" + "\n".join(pairs))
    return "\n\n".join(parts)


async def _approved_voice_prompt(pool: asyncpg.Pool, brand_id: str) -> str:
    prompt = await pool.fetchval(
        """SELECT drafting_prompt FROM cx_copilot.orb_brand_voice_profiles
           WHERE brand_id=$1::uuid AND status='approved'
           ORDER BY updated_at DESC LIMIT 1""",
        brand_id,
    )
    return str(prompt or "").strip()


def _content_out(record: asyncpg.Record) -> dict[str, Any]:
    value = dict(record)
    return {
        "id": str(value["id"]), "brand_id": str(value["brand_id"]), "kind": value["kind"],
        "status": value["status"], "payload": decode_jsonb(value["payload"]),
        "evidence": decode_jsonb(value["evidence"]), "template_id": str(value["template_id"]) if value.get("template_id") else None,
        "template_version": value.get("template_version"), "qdrant_published_at": value.get("qdrant_published_at"),
        "qdrant_error": value.get("qdrant_error"), "created_at": value["created_at"], "updated_at": value["updated_at"],
    }


async def _source_evidence(pool: asyncpg.Pool, brand_id: str, source_job_ids: list[str]) -> list[dict[str, str]]:
    query = """
      SELECT p.url, p.title, p.text FROM pages p
      JOIN crawl_jobs cj ON cj.id = p.last_job_id
      WHERE cj.brand_id=$1::uuid AND p.text IS NOT NULL AND length(p.text) >= 80
    """
    args: list[Any] = [brand_id]
    if source_job_ids:
        query += " AND p.last_job_id = ANY($2::uuid[])"
        args.append(source_job_ids)
    query += " ORDER BY p.fetched_at DESC LIMIT 50"
    rows = await pool.fetch(query, *args)
    return [{"url": row["url"], "title": row["title"] or "", "text": row["text"][:5_000]} for row in rows]


def _evidence_prompt(evidence: list[dict[str, str]]) -> str:
    return "\n\n".join(f"SOURCE: {item['url']}\nTITLE: {item['title']}\nTEXT:\n{item['text']}" for item in evidence)


async def _store_content(
    pool: asyncpg.Pool, job_id: str, brand_id: str, kind: str, payload: dict[str, Any], evidence: list[dict[str, str]],
    template_id: str | None = None, template_version: int | None = None,
) -> None:
    await pool.execute(
        """INSERT INTO cx_copilot.orb_generated_content
           (generation_job_id, brand_id, kind, template_id, template_version, payload, evidence)
           VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6::jsonb,$7::jsonb)""",
        job_id, brand_id, kind, template_id, template_version, payload,
        [{"url": item["url"], "title": item["title"]} for item in evidence],
    )


async def _sync_scraped_products(crawler_pool: asyncpg.Pool, knowledge_pool: asyncpg.Pool, brand_id: str, source_job_ids: list[str]) -> int:
    query = """
      SELECT p.url,p.canonical_url,p.title,p.description,p.text,p.structured
      FROM pages p JOIN crawl_jobs cj ON cj.id=p.last_job_id
      WHERE cj.brand_id=$1::uuid AND coalesce(p.structured->>'page_type','')='product'
    """
    args: list[Any] = [brand_id]
    if source_job_ids:
        query += " AND p.last_job_id=ANY($2::uuid[])"
        args.append(source_job_ids)
    query += " ORDER BY p.fetched_at DESC LIMIT 1_000"
    rows = await crawler_pool.fetch(query, *args)
    for row in rows:
        url = row["canonical_url"] or row["url"]
        structured = decode_jsonb(row["structured"])
        shopify_product = structured.get("shopify_admin", {}) if isinstance(structured, dict) else {}
        variants = shopify_product.get("variants", {}).get("nodes", []) if isinstance(shopify_product, dict) else []
        money = variants[0].get("price", {}) if variants and isinstance(variants[0], dict) else {}
        product = {
            "name": row["title"] or url.rsplit("/", 1)[-1], "description": row["description"] or "",
            "url": url, "text": row["text"] or "", "structured": structured,
        }
        if isinstance(money, dict) and money.get("amount"):
            product["price"] = str(money["amount"])
            product["currency"] = str(money.get("currencyCode") or "")
        await knowledge_pool.execute(
            """INSERT INTO cx_copilot.orb_products (brand_id,provider,external_id,payload,source_url)
               VALUES ($1::uuid,'website',$2,$3::jsonb,$4)
               ON CONFLICT (brand_id,provider,external_id) DO UPDATE SET payload=EXCLUDED.payload,source_url=EXCLUDED.source_url,synced_at=now(),status='active'""",
            brand_id, url, product, url,
        )
    return len(rows)


async def _run_generation(app, job_id: str, brand_id: str, outputs: list[str]) -> None:
    pool: asyncpg.Pool = app.state.supabase_db
    crawler_pool: asyncpg.Pool = app.state.db
    try:
        await pool.execute("UPDATE cx_copilot.orb_generation_jobs SET status='running', error=NULL WHERE id=$1::uuid", job_id)
        brand = await _brand(pool, brand_id)
        category = brand["industry_category"]
        if "sops" in outputs and not category:
            raise GenerationUnavailable("Choose a business category before generating SOPs")
        source_job_ids = await pool.fetchval("SELECT source_job_ids FROM cx_copilot.orb_generation_jobs WHERE id=$1::uuid", job_id)
        evidence = await _source_evidence(crawler_pool, brand_id, list(source_job_ids or []))
        if ("sops" in outputs or "faqs" in outputs) and not evidence:
            raise GenerationUnavailable("No completed scraped pages are linked to this brand")
        counts = {"sops": 0, "faqs": 0, "products": 0}
        source_context = _evidence_prompt(evidence)
        approved_voice = await _approved_voice_prompt(pool, brand_id)
        voice_instruction = f"\n\nAPPROVED BRAND VOICE:\n{approved_voice}" if approved_voice else ""
        if "sops" in outputs:
            templates = await pool.fetch(
                "SELECT id,title,template_json,version FROM cx_copilot.orb_sop_templates WHERE category_code=$1 AND active ORDER BY title, version DESC",
                category,
            )
            if not templates:
                raise GenerationUnavailable(f"No active SOP templates exist for {CATEGORIES[category]}")
            for template in templates:
                instruction = (
                    "You create a brand-specific SOP draft. Use only facts supported by SOURCE CONTENT. "
                    "Keep the template decision-flow structure. If a fact is absent, retain safe generic wording and set needs_review=true. "
                    "Return JSON object with title, situation, check_first, what_to_do, what_to_say, escalate_to, category, needs_review."
                    + voice_instruction
                )
                prompt = f"BRAND: {brand['name']}\nCATEGORY: {CATEGORIES[category]}\nTEMPLATE:\n{decode_jsonb(template['template_json'])}\n\nSOURCE CONTENT:\n{source_context}"
                generated = await generate_json(pool, app.state.settings, instruction, prompt)
                if not isinstance(generated, dict):
                    raise GenerationUnavailable("SOP generation returned an invalid response")
                generated.update({"status": "Draft", "category": generated.get("category") or CATEGORIES[category], "source": "Orb generation"})
                await _store_content(pool, job_id, brand_id, "sop", generated, evidence, str(template["id"]), template["version"])
                counts["sops"] += 1
        if "faqs" in outputs:
            instruction = (
                "Create only source-grounded customer FAQs. Do not infer policies, medical advice, prices, claims, or availability. "
                "Return a JSON object with an `faqs` array (maximum 20). Each item has question, answer, category, needs_review, source_urls."
                + voice_instruction
            )
            generated = await generate_json(pool, app.state.settings, instruction, f"BRAND: {brand['name']}\n\nSOURCE CONTENT:\n{source_context}")
            faq_rows = generated.get("faqs", []) if isinstance(generated, dict) else []
            if not isinstance(faq_rows, list):
                raise GenerationUnavailable("FAQ generation returned an invalid response")
            for faq in faq_rows[:20]:
                if not isinstance(faq, dict) or not str(faq.get("question", "")).strip() or not str(faq.get("answer", "")).strip():
                    continue
                faq.update({"status": "Draft", "source": "Orb generation"})
                await _store_content(pool, job_id, brand_id, "faq", faq, evidence)
                counts["faqs"] += 1
        if "products" in outputs:
            existing = await pool.fetchval("SELECT count(*) FROM cx_copilot.orb_products WHERE brand_id=$1::uuid AND status='active'", brand_id)
            counts["products"] = existing or await _sync_scraped_products(crawler_pool, pool, brand_id, list(source_job_ids or []))
        await pool.execute("UPDATE cx_copilot.orb_generation_jobs SET status='done', summary=$2::jsonb WHERE id=$1::uuid", job_id, counts)
    except Exception as exc:
        await pool.execute("UPDATE cx_copilot.orb_generation_jobs SET status='failed', error=$2 WHERE id=$1::uuid", job_id, str(exc)[:2000])


@router.get("/categories")
async def list_categories() -> dict[str, list[dict[str, str]]]:
    return {"categories": [{"code": code, "label": label} for code, label in CATEGORIES.items()]}


@router.get("/brands")
async def list_brands(request: Request, _: User = Depends(current_user)) -> dict[str, list[dict[str, Any]]]:
    rows = await _supabase_rows(
        request,
        "brands",
        {"select": "id,name,description,industry_category,platform_config", "order": "name.asc"},
    )
    return {"brands": [_brand_out(row) for row in rows]}


@router.patch("/brands/{brand_id}/category")
async def set_brand_category(brand_id: str, payload: CategoryPatch, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    settings = request.app.state.settings
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.patch(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/brands",
                params={"id": f"eq.{brand_id}", "select": "id,name,description,industry_category,platform_config"},
                json={"industry_category": payload.industry_category},
                headers=_supabase_headers(request, write=True),
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Supabase REST request failed") from exc
    if response.is_error:
        raise HTTPException(status_code=503, detail="Supabase category update was rejected by RLS or schema settings")
    rows = response.json()
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=404, detail="Brand not found")
    return {"brand": _brand_out(rows[0])}


@router.patch("/brands/{brand_id}/profile")
async def set_brand_profile(brand_id: str, payload: BrandProfilePatch, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    """Persist the few business details Orb actually uses as brand context."""
    existing = await _brand(request.app.state.supabase_db, brand_id)
    platform_config = decode_jsonb(existing["platform_config"])
    platform_config = dict(platform_config) if isinstance(platform_config, dict) else {}
    for key, value in {
        "website_url": payload.website_url.strip(),
        "support_email": payload.support_email.strip(),
    }.items():
        if value:
            platform_config[key] = value
        else:
            platform_config.pop(key, None)
    row = await request.app.state.supabase_db.fetchrow(
        """UPDATE cx_copilot.brands
           SET description=$2, platform_config=$3::jsonb
           WHERE id=$1::uuid
           RETURNING id,name,description,industry_category,platform_config""",
        brand_id,
        payload.description.strip() or None,
        platform_config,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
    return {"brand": _brand_out(row)}


@router.get("/brands/{brand_id}/voice")
async def get_brand_voice(brand_id: str, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    await _remote_brand(request, brand_id)
    sources = await _supabase_private_rows(request, "orb_brand_voice_sources", {"select": "*", "brand_id": f"eq.{brand_id}", "order": "created_at.desc"})
    profiles = await _supabase_private_rows(request, "orb_brand_voice_profiles", {"select": "*", "brand_id": f"eq.{brand_id}", "order": "created_at.desc"})
    return {
        "sources": [_voice_source_out(row) for row in sources],
        "profiles": [_voice_profile_out(row) for row in profiles],
    }


@router.post("/brands/{brand_id}/voice/sources", status_code=201)
async def create_brand_voice_source(brand_id: str, payload: BrandVoiceSourceCreate, request: Request, user: User = Depends(_admin)) -> dict[str, Any]:
    await _remote_brand(request, brand_id)
    content = _csv_to_voice_text(payload.content) if payload.kind == "csv" else payload.content.strip()
    if len(content) < 10:
        raise HTTPException(status_code=422, detail="The imported voice material did not contain enough text")
    rows = await _supabase_private_write(request, "POST", "orb_brand_voice_sources", params={"select": "*"}, payload={
        "brand_id": brand_id, "created_by": user.id, "kind": payload.kind, "label": payload.label.strip(), "raw_content": content,
    })
    return {"source": _voice_source_out(rows[0])}


@router.delete("/brands/{brand_id}/voice/sources/{source_id}", status_code=204, response_class=Response)
async def delete_brand_voice_source(brand_id: str, source_id: str, request: Request, _: User = Depends(_admin)) -> Response:
    rows = await _supabase_private_write(request, "DELETE", "orb_brand_voice_sources", params={"id": f"eq.{source_id}", "brand_id": f"eq.{brand_id}", "select": "id"})
    if not rows:
        raise HTTPException(status_code=404, detail="Voice source not found")
    return Response(status_code=204)


@router.post("/brands/{brand_id}/voice/generate", status_code=201)
async def generate_brand_voice(brand_id: str, request: Request, user: User = Depends(_admin)) -> dict[str, Any]:
    brand = await _remote_brand(request, brand_id)
    sources = await _supabase_private_rows(request, "orb_brand_voice_sources", {"select": "*", "brand_id": f"eq.{brand_id}", "order": "created_at.desc", "limit": "20"})
    if not sources:
        raise HTTPException(status_code=409, detail="Import or paste brand voice material before generating a profile")
    raw_material = "\n\n".join(f"SOURCE: {row['label']}\n{row['raw_content']}" for row in reversed(sources))
    instruction = (
        "Create a concise, reviewable brand-voice profile from onboarding material. "
        "Do not invent product claims, policies, medical/legal advice, refund rules, or commitments. "
        "Separate safety-critical or policy wording into guardrails marked needs_policy_review. "
        "Return JSON with: summary (string), tone_traits (array), style_rules (array), addressing (string), "
        "emoji_policy (string), response_length (string), preferred_phrases (array), avoid_phrases (array), "
        "emotional_guidance (array), formatting_rules (array), reusable_snippets (array of {label,when_to_use,text}), "
        "guardrails (array), drafting_prompt (string). The drafting_prompt must be under 1,800 characters."
    )
    prompt = f"BRAND: {brand['name']}\n\nONBOARDING MATERIAL:\n{raw_material[:90_000]}"
    try:
        generated = await generate_json(request.app.state.db, request.app.state.settings, instruction, prompt)
    except GenerationUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not isinstance(generated, dict) or not isinstance(generated.get("drafting_prompt"), str):
        raise HTTPException(status_code=502, detail="Voice profile generation returned an invalid result")
    rows = await _supabase_private_write(request, "POST", "orb_brand_voice_profiles", params={"select": "*"}, payload={
        "brand_id": brand_id,
        "created_by": user.id,
        "source_ids": [str(source["id"]) for source in sources],
        "profile": generated,
        "drafting_prompt": generated["drafting_prompt"].strip(),
        "status": "draft",
    })
    return {"profile": _voice_profile_out(rows[0])}


@router.patch("/brands/{brand_id}/voice/profiles/{profile_id}/approve")
async def approve_brand_voice(profile_id: str, brand_id: str, payload: BrandVoiceProfileApprove, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    existing = await _supabase_private_rows(request, "orb_brand_voice_profiles", {"select": "id", "id": f"eq.{profile_id}", "brand_id": f"eq.{brand_id}", "limit": "1"})
    if not existing:
        raise HTTPException(status_code=404, detail="Voice profile not found")
    updated_at = datetime.now(timezone.utc).isoformat()
    await _supabase_private_write(request, "PATCH", "orb_brand_voice_profiles", params={"brand_id": f"eq.{brand_id}", "status": "eq.approved"}, payload={"status": "archived", "updated_at": updated_at})
    rows = await _supabase_private_write(request, "PATCH", "orb_brand_voice_profiles", params={"id": f"eq.{profile_id}", "brand_id": f"eq.{brand_id}", "select": "*"}, payload={
        "profile": payload.profile, "drafting_prompt": payload.drafting_prompt.strip(), "status": "approved", "updated_at": updated_at,
    })
    return {"profile": _voice_profile_out(rows[0])}


@router.get("/sop-templates")
async def list_templates(request: Request, category_code: str = Query(...), _: User = Depends(current_user)) -> dict[str, list[dict[str, Any]]]:
    if category_code not in CATEGORIES:
        raise HTTPException(status_code=422, detail="Unknown category_code")
    rows = await request.app.state.supabase_db.fetch(
        "SELECT id,category_code,title,template_json,version,active,created_at,updated_at FROM cx_copilot.orb_sop_templates WHERE category_code=$1 ORDER BY title,version DESC",
        category_code,
    )
    return {"templates": [{**dict(row), "id": str(row["id"]), "template_json": decode_jsonb(row["template_json"])} for row in rows]}


@router.post("/sop-templates", status_code=201)
async def create_template(payload: TemplateCreate, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    if payload.category_code not in CATEGORIES:
        raise HTTPException(status_code=422, detail="Unknown category_code")
    row = await request.app.state.supabase_db.fetchrow(
        """INSERT INTO cx_copilot.orb_sop_templates (category_code,title,template_json,version,active)
           VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING id,category_code,title,template_json,version,active,created_at,updated_at""",
        payload.category_code, payload.title, payload.template_json, payload.version, payload.active,
    )
    return {"template": {**dict(row), "id": str(row["id"]), "template_json": decode_jsonb(row["template_json"])}}


@router.post("/generations", status_code=202)
async def create_generation(payload: GenerateRequest, background_tasks: BackgroundTasks, request: Request, user: User = Depends(_admin)) -> dict[str, Any]:
    outputs = list(dict.fromkeys(payload.outputs))
    brand = await _brand(request.app.state.supabase_db, payload.brand_id)
    if "sops" in outputs and not brand["industry_category"]:
        raise HTTPException(status_code=409, detail="Choose the brand category before generating SOPs")
    row = await request.app.state.supabase_db.fetchrow(
        """INSERT INTO cx_copilot.orb_generation_jobs (brand_id,created_by,requested_outputs,source_job_ids)
           VALUES ($1::uuid,$2::uuid,$3::text[],$4::uuid[]) RETURNING *""",
        payload.brand_id, user.id, outputs, payload.source_job_ids,
    )
    background_tasks.add_task(_run_generation, request.app, str(row["id"]), payload.brand_id, outputs)
    return {"job": {**dict(row), "id": str(row["id"]), "brand_id": str(row["brand_id"]), "summary": decode_jsonb(row["summary"])}}


@router.get("/generations/{job_id}")
async def get_generation(job_id: str, request: Request, _: User = Depends(current_user)) -> dict[str, Any]:
    row = await request.app.state.supabase_db.fetchrow("SELECT * FROM cx_copilot.orb_generation_jobs WHERE id=$1::uuid", job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Generation job not found")
    value = dict(row)
    value.update({"id": str(row["id"]), "brand_id": str(row["brand_id"]), "summary": decode_jsonb(row["summary"])})
    return {"job": value}


@router.get("/brands/{brand_id}/content")
async def list_content(brand_id: str, request: Request, kind: Literal["sop", "faq"] | None = None, status_value: str | None = Query(None, alias="status"), _: User = Depends(current_user)) -> dict[str, list[dict[str, Any]]]:
    await _brand(request.app.state.supabase_db, brand_id)
    rows = await request.app.state.supabase_db.fetch(
        "SELECT * FROM cx_copilot.orb_generated_content WHERE brand_id=$1::uuid AND ($2::text IS NULL OR kind=$2) AND ($3::text IS NULL OR status=$3) ORDER BY created_at DESC",
        brand_id, kind, status_value,
    )
    return {"items": [_content_out(row) for row in rows]}


@router.patch("/content/{content_id}")
async def set_content_status(content_id: str, payload: ContentStatusPatch, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    row = await request.app.state.supabase_db.fetchrow("UPDATE cx_copilot.orb_generated_content SET status=$2 WHERE id=$1::uuid RETURNING *", content_id, payload.status)
    if not row:
        raise HTTPException(status_code=404, detail="Generated content not found")
    return {"item": _content_out(row)}


@router.post("/brands/{brand_id}/products/shopify-sync")
async def sync_shopify_products(brand_id: str, payload: ShopifySyncRequest, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    await _brand(request.app.state.supabase_db, brand_id)
    products = await list_products(request.app.state.fetcher, payload.website_url, payload.maximum)
    for product in products:
        raw = product.structured.get("shopify_product", {})
        external_id = str(raw.get("id") or raw.get("handle") or product.url)
        stored = {"name": product.title, "description": product.description, "url": product.url, "text": product.text, "shopify_product": raw}
        await request.app.state.supabase_db.execute(
            """INSERT INTO cx_copilot.orb_products (brand_id,provider,external_id,payload,source_url)
               VALUES ($1::uuid,'shopify_public',$2,$3::jsonb,$4)
               ON CONFLICT (brand_id,provider,external_id) DO UPDATE SET payload=EXCLUDED.payload,source_url=EXCLUDED.source_url,synced_at=now(),status='active'""",
            brand_id, external_id, stored, product.url,
        )
    return {"provider": "shopify_public", "synced": len(products)}


@router.post("/brands/{brand_id}/publish")
async def publish_brand(brand_id: str, payload: PublishRequest, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    brand = await _brand(request.app.state.supabase_db, brand_id)
    published: dict[str, dict[str, Any]] = {}
    for kind in payload.kinds:
        if kind == "product":
            rows = await request.app.state.supabase_db.fetch("SELECT id,payload FROM cx_copilot.orb_products WHERE brand_id=$1::uuid AND status='active'", brand_id)
        else:
            rows = await request.app.state.supabase_db.fetch("SELECT id,payload FROM cx_copilot.orb_generated_content WHERE brand_id=$1::uuid AND kind=$2 AND status='approved'", brand_id, kind)
        items = [{"id": row["id"], "payload": decode_jsonb(row["payload"])} for row in rows]
        if not items:
            published[kind] = {"published": 0, "collection": None}
            continue
        try:
            collection = await publish_points(request.app.state.supabase_db, request.app.state.settings, brand["name"], kind, items)
            ids = [item["id"] for item in items]
            if kind == "product":
                await request.app.state.supabase_db.execute("UPDATE cx_copilot.orb_products SET qdrant_published_at=now(),qdrant_error=NULL WHERE id=ANY($1::uuid[])", ids)
            else:
                await request.app.state.supabase_db.execute("UPDATE cx_copilot.orb_generated_content SET status='published',qdrant_published_at=now(),qdrant_error=NULL WHERE id=ANY($1::uuid[])", ids)
            published[kind] = {"published": len(items), "collection": collection}
        except PublishUnavailable as exc:
            ids = [item["id"] for item in items]
            table = "cx_copilot.orb_products" if kind == "product" else "cx_copilot.orb_generated_content"
            await request.app.state.supabase_db.execute(f"UPDATE {table} SET qdrant_error=$2 WHERE id=ANY($1::uuid[])", ids, str(exc)[:2000])
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"published": published}


def _flow_values(payload: dict[str, Any]) -> tuple[str, str | None, str, list[Any], list[Any], dict[str, Any] | None]:
    """Normalize the editor document before storing it in Supabase JSONB."""
    title = str(payload.get("title") or "Untitled flow").strip()[:300] or "Untitled flow"
    lifecycle_stage = str(payload.get("lifecycle_stage") or "").strip()[:300] or None
    status_value = str(payload.get("status") or "draft").lower()
    status_value = status_value if status_value in {"draft", "published", "archived"} else "draft"
    nodes = payload.get("nodes") if isinstance(payload.get("nodes"), list) else []
    edges = payload.get("edges") if isinstance(payload.get("edges"), list) else []
    import_source = payload.get("import_source") if isinstance(payload.get("import_source"), dict) else None
    return title, lifecycle_stage, status_value, nodes, edges, import_source


def _flow_out(record: Any) -> dict[str, Any]:
    value = dict(record)
    created_at = value["created_at"]
    updated_at = value["updated_at"]
    payload = {
        "title": value["title"],
        "lifecycle_stage": value.get("lifecycle_stage") or "",
        "status": value["status"],
        "nodes": decode_jsonb(value["nodes"]) or [],
        "edges": decode_jsonb(value["edges"]) or [],
        "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
        "updated_at": updated_at.isoformat() if hasattr(updated_at, "isoformat") else str(updated_at),
    }
    import_source = decode_jsonb(value.get("import_source"))
    if isinstance(import_source, dict):
        payload["import_source"] = import_source
    return {"id": str(value["id"]), "payload": payload}


@router.post("/flows/assist")
async def assist_flow(payload: FlowAssistRequest, request: Request, _: User = Depends(_admin)) -> dict[str, str]:
    """Draft a flow-import table from a short natural-language workflow request."""
    await _remote_brand_by_name(request, payload.brand_name)
    system = """You turn a user's workflow request into an editable customer-support flow.
Return JSON only, exactly in this shape:
{
  "title": "short flow title",
  "lifecycle_stage": "Before the order|After the order|Other",
  "query_category": "short customer-intent category",
  "branches": [
    {
      "query_category": "optional override",
      "pre_requisites": "customer details to collect",
      "systems_used": "only systems explicitly named by the user; otherwise empty",
      "checks": "one specific check shared by related branches",
      "situation": "the outcome or route",
      "actions": "clear operator action",
      "level": "AI autonomous|AI drafts/human checks|Human handoff",
      "customer_message": "short customer-facing template, or empty",
      "escalate_to": "team name or None"
    }
  ]
}
Create between 2 and 8 distinct branches. Every branch needs query_category, checks, situation, and actions.
Use only facts in the user's request. Do not invent policies, systems, promises, prices, or teams. Keep fields concise and practical."""
    prompt = f"Brand: {payload.brand_name}\n\nWorkflow request:\n{payload.prompt.strip()}"
    try:
        generated = await generate_json(request.app.state.db, request.app.state.settings, system, prompt)
        title, table = _flow_assist_csv(generated)
    except GenerationUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"Orb could not create a complete flow: {exc}") from exc
    return {"title": title, "csv": table}


@router.get("/flows")
async def list_flows(brand_name: str, request: Request, _: User = Depends(current_user)) -> dict[str, Any]:
    """List visual workflows stored as structured Supabase records."""
    brand_name = brand_name.strip()
    if not brand_name:
        raise HTTPException(status_code=422, detail="brand_name is required")
    brand = await _remote_brand_by_name(request, brand_name)
    rows = await _supabase_rows(request, "orb_flows", {
        "select": "id,title,lifecycle_stage,status,nodes,edges,import_source,created_at,updated_at",
        "brand_id": f"eq.{brand['id']}",
        "order": "updated_at.desc",
    })
    return {"points": [_flow_out(row) for row in rows], "source": "supabase"}


@router.post("/flows", status_code=status.HTTP_201_CREATED)
async def create_flow(payload: FlowPayload, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    brand = await _remote_brand_by_name(request, payload.brand_name)
    values = _flow_values(payload.payload)
    rows = await _supabase_write(request, "POST", "orb_flows", params={
        "select": "id,title,lifecycle_stage,status,nodes,edges,import_source,created_at,updated_at",
    }, payload={
        "brand_id": brand["id"], "title": values[0], "lifecycle_stage": values[1], "status": values[2],
        "nodes": values[3], "edges": values[4], "import_source": values[5],
    })
    if not rows:
        raise HTTPException(status_code=503, detail="Supabase did not return the saved flow")
    return {"point": _flow_out(rows[0]), "source": "supabase"}


@router.put("/flows/{flow_id}")
async def update_flow(flow_id: str, payload: FlowPayload, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    brand = await _remote_brand_by_name(request, payload.brand_name)
    values = _flow_values(payload.payload)
    rows = await _supabase_write(request, "PATCH", "orb_flows", params={
        "id": f"eq.{flow_id}", "brand_id": f"eq.{brand['id']}",
        "select": "id,title,lifecycle_stage,status,nodes,edges,import_source,created_at,updated_at",
    }, payload={
        "title": values[0], "lifecycle_stage": values[1], "status": values[2],
        "nodes": values[3], "edges": values[4], "import_source": values[5],
    })
    if not rows:
        raise HTTPException(status_code=404, detail="Flow not found")
    return {"point": _flow_out(rows[0]), "source": "supabase"}


@router.delete("/flows/{flow_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_flow(flow_id: str, brand_name: str, request: Request, _: User = Depends(_admin)) -> Response:
    brand = await _remote_brand_by_name(request, brand_name)
    rows = await _supabase_write(request, "DELETE", "orb_flows", params={
        "id": f"eq.{flow_id}", "brand_id": f"eq.{brand['id']}", "select": "id",
    })
    if not rows:
        raise HTTPException(status_code=404, detail="Flow not found")
    return Response(status_code=204)


@router.get("/knowledge/{kind}")
async def list_knowledge(kind: Literal["sops", "faqs", "products"], brand_name: str, request: Request, _: User = Depends(current_user)) -> dict[str, Any]:
    brand_name = brand_name.strip()
    if not brand_name:
        raise HTTPException(status_code=422, detail="brand_name is required")
    qdrant_kind = {"sops": "sop", "faqs": "faq", "products": "product"}[kind]
    try:
        remote_points = await scroll_points(request.app.state.db, request.app.state.settings, brand_name, qdrant_kind)
    except PublishUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    points = []
    for point in remote_points:
        payload = dict(point["payload"])
        payload.setdefault("status", "Published")
        payload.setdefault("source", "Qdrant")
        points.append({"id": str(point["id"]), "payload": payload})
    return {"points": points, "source": "qdrant"}


@router.patch("/knowledge/{kind}/{item_id}")
async def update_knowledge(kind: Literal["sops", "faqs", "products"], item_id: str, payload: KnowledgePayload, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    brand = await _brand_by_name(request.app.state.supabase_db, payload.brand_name)
    if kind == "products":
        row = await request.app.state.supabase_db.fetchrow("UPDATE cx_copilot.orb_products SET payload=$3::jsonb,synced_at=now(),qdrant_published_at=NULL WHERE id=$1::uuid AND brand_id=$2::uuid RETURNING id,payload", item_id, brand["id"], payload.payload)
    else:
        content_kind = "sop" if kind == "sops" else "faq"
        row = await request.app.state.supabase_db.fetchrow("UPDATE cx_copilot.orb_generated_content SET payload=$4::jsonb,qdrant_published_at=NULL WHERE id=$1::uuid AND brand_id=$2::uuid AND kind=$3 RETURNING id,payload", item_id, brand["id"], content_kind, payload.payload)
    if not row:
        raise HTTPException(status_code=404, detail="Knowledge item not found")
    return {"point": {"id": str(row["id"]), "payload": decode_jsonb(row["payload"])}}


@router.delete("/knowledge/{kind}/{item_id}", status_code=204, response_class=Response)
async def delete_knowledge(kind: Literal["sops", "faqs", "products"], item_id: str, brand_name: str, request: Request, _: User = Depends(_admin)) -> Response:
    brand = await _brand_by_name(request.app.state.supabase_db, brand_name)
    if kind == "products":
        result = await request.app.state.supabase_db.execute("DELETE FROM cx_copilot.orb_products WHERE id=$1::uuid AND brand_id=$2::uuid", item_id, brand["id"])
    else:
        content_kind = "sop" if kind == "sops" else "faq"
        result = await request.app.state.supabase_db.execute("DELETE FROM cx_copilot.orb_generated_content WHERE id=$1::uuid AND brand_id=$2::uuid AND kind=$3", item_id, brand["id"], content_kind)
    if result.endswith("0"):
        raise HTTPException(status_code=404, detail="Knowledge item not found")
    return Response(status_code=204)
