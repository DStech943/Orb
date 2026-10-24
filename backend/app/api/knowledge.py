"""Brand category, source-grounded generation, and Qdrant publishing APIs."""
from __future__ import annotations

from typing import Any, Literal

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.auth import User, current_user
from app.db import decode_jsonb
from app.scraper.shopify import list_products
from app.services.llm import GenerationUnavailable, generate_json
from app.services.qdrant import PublishUnavailable, publish_points, scroll_points

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


async def _admin(request: Request, user: User = Depends(current_user)) -> User:
    if request.app.state.settings.auth_disabled:
        return user
    role = await request.app.state.supabase_db.fetchval("SELECT role FROM cx_copilot.orb_profiles WHERE id=$1::uuid", user.id)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access is required")
    return user


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
    return {
        "id": str(value["id"]), "name": value["name"], "description": value.get("description"),
        "industry_category": value.get("industry_category"),
        "industry_category_label": CATEGORIES.get(value.get("industry_category")),
    }


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
        product = {
            "name": row["title"] or url.rsplit("/", 1)[-1], "description": row["description"] or "",
            "url": url, "text": row["text"] or "", "structured": decode_jsonb(row["structured"]),
        }
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
    rows = await request.app.state.supabase_db.fetch("SELECT id,name,description,industry_category,platform_config FROM cx_copilot.brands ORDER BY name")
    return {"brands": [_brand_out(row) for row in rows]}


@router.patch("/brands/{brand_id}/category")
async def set_brand_category(brand_id: str, payload: CategoryPatch, request: Request, _: User = Depends(_admin)) -> dict[str, Any]:
    row = await request.app.state.supabase_db.fetchrow(
        "UPDATE cx_copilot.brands SET industry_category=$2 WHERE id=$1::uuid RETURNING id,name,description,industry_category,platform_config",
        brand_id, payload.industry_category,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Brand not found")
    return {"brand": _brand_out(row)}


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


@router.get("/knowledge/{kind}")
async def list_knowledge(kind: Literal["sops", "faqs", "products"], brand_name: str, request: Request, _: User = Depends(current_user)) -> dict[str, list[dict[str, Any]]]:
    brand = await _brand_by_name(request.app.state.supabase_db, brand_name)
    qdrant_kind = {"sops": "sop", "faqs": "faq", "products": "product"}[kind]
    try:
        remote_points = await scroll_points(request.app.state.supabase_db, request.app.state.settings, brand["name"], qdrant_kind)
    except PublishUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if remote_points:
        points = []
        for point in remote_points:
            payload = dict(point["payload"])
            payload.setdefault("status", "Published")
            payload.setdefault("source", "Qdrant")
            points.append({"id": str(point["id"]), "payload": payload})
        return {"points": points, "source": "qdrant"}
    if kind == "products":
        rows = await request.app.state.supabase_db.fetch("SELECT id,payload FROM cx_copilot.orb_products WHERE brand_id=$1::uuid AND status='active' ORDER BY synced_at DESC", brand["id"])
    else:
        content_kind = "sop" if kind == "sops" else "faq"
        rows = await request.app.state.supabase_db.fetch("SELECT id,payload FROM cx_copilot.orb_generated_content WHERE brand_id=$1::uuid AND kind=$2 AND status <> 'rejected' ORDER BY created_at DESC", brand["id"], content_kind)
    return {"points": [{"id": str(row["id"]), "payload": decode_jsonb(row["payload"])} for row in rows], "source": "database"}


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
