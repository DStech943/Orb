"""Authenticated Shopify Admin imports for stores that block storefront crawlers."""
from __future__ import annotations

import hashlib
import re

import asyncpg
import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, model_validator

from app.api.knowledge import _remote_brand_by_name, _supabase_rows, _supabase_write
from app.auth import User, current_user
from app.pipeline import advance_completed_crawl, create_crawl_pipeline
from app.scraper.shopify import ShopifyAdminUnavailable, _admin_query, _plain_html, admin_domain, list_admin_products, list_admin_resources

router = APIRouter(prefix="/api/shopify", tags=["shopify"])


class ShopifyImport(BaseModel):
    brand_id: str | None = None
    brand_name: str | None = Field(default=None, max_length=160)
    use_vault: bool = True
    maximum: int = Field(default=250, ge=1, le=250)
    domain: str | None = Field(default=None, max_length=255)
    access_token: str | None = Field(default=None, min_length=1, max_length=512)
    outputs: list[str] = Field(default_factory=lambda: ["sops", "faqs", "products"])

    @model_validator(mode="after")
    def credentials_are_complete(self) -> "ShopifyImport":
        if bool(self.domain) != bool(self.access_token):
            raise ValueError("Provide both Shopify domain and access token, or leave both empty to use server credentials")
        if self.domain:
            admin_domain(self.domain)
        return self


class ShopifyProductSync(BaseModel):
    brand_name: str = Field(min_length=1, max_length=160)
    use_vault: bool = True
    maximum: int = Field(default=250, ge=1, le=250)


class ShopifyMetafieldValue(BaseModel):
    namespace: str = Field(min_length=1, max_length=255)
    key: str = Field(min_length=1, max_length=255)
    type: str = Field(min_length=1, max_length=255)
    value: str


class ShopifyMetafieldSave(BaseModel):
    brand_name: str = Field(min_length=1, max_length=160)
    product_id: str = Field(min_length=1, max_length=160)
    metafields: list[ShopifyMetafieldValue] = Field(default_factory=list, max_length=100)
    deleted_metafield_ids: list[str] = Field(default_factory=list, max_length=100)
    use_vault: bool = True


def _shopify_vault_names(brand_name: str) -> tuple[str, str]:
    """Map a brand name to its two standard Vault secret names."""
    key = re.sub(r"[^A-Z0-9]+", "_", brand_name.upper()).strip("_")
    if not key:
        raise ValueError("Brand name cannot be converted to a Shopify Vault key")
    return f"SHOPIFY_{key}_TOKEN", f"SHOPIFY_{key}_DOMAIN"


async def _vault_credentials(request: Request, brand_name: str | None) -> tuple[str | None, str | None, str]:
    """Resolve Shopify credentials via a restricted server-only Vault RPC.

    The browser only receives a boolean status from the caller; the token is
    kept in this function and passed directly to Shopify's Admin API.
    """
    settings = request.app.state.settings
    if not brand_name or not settings.supabase_url or not settings.supabase_service_role_key:
        return None, None, "unavailable"
    try:
        headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Accept-Profile": "cx_copilot",
            "Content-Profile": "cx_copilot",
        }
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(
                f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/orb_shopify_vault_credentials",
                headers=headers,
                json={"p_brand_name": brand_name},
            )
        if response.is_error:
            return None, None, "unavailable"
        rows = response.json()
        row = rows[0] if isinstance(rows, list) and rows else {}
        domain = str(row.get("shopify_domain") or "").strip() or None
        token = str(row.get("shopify_token") or "").strip() or None
        return domain, token, "vault" if domain and token else "missing"
    except (httpx.HTTPError, TypeError, ValueError):
        # An unavailable RPC must not expose transport details or secrets.
        return None, None, "unavailable"


def _is_legacy_brand(brand_name: str | None) -> bool:
    """The old server variables are only valid for the original Dearist setup."""
    if not brand_name:
        return False
    try:
        token_name, _ = _shopify_vault_names(brand_name)
    except ValueError:
        return False
    return token_name == "SHOPIFY_THE_DEARIST_TOKEN"


async def _resolve_credentials(request: Request, brand_name: str | None, use_vault: bool) -> tuple[str | None, str | None, str]:
    """Resolve one brand's credentials without ever returning the token to a client."""
    domain, access_token, source = None, None, "manual"
    if use_vault:
        domain, access_token, source = await _vault_credentials(request, brand_name)
    # Do not accidentally use The Dearist's legacy token for another brand.
    if (not domain or not access_token) and _is_legacy_brand(brand_name):
        settings = request.app.state.settings
        domain = domain or settings.shopify_the_dearist_domain
        access_token = access_token or settings.shopify_the_dearist_token
        if domain and access_token:
            source = "legacy_server_config"
    return domain, access_token, source


def _product_payload(product: dict, store_domain: str) -> dict:
    """Normalize a Shopify product for the editable Orb library."""
    default_currency = str(product.get("_orb_currency") or "")

    def money(value):
        if isinstance(value, dict):
            return {**value, "currencyCode": value.get("currencyCode") or default_currency}
        return {"amount": str(value or ""), "currencyCode": default_currency}

    variants = [
        {
            **variant,
            "price": money(variant.get("price")),
            "compareAtPrice": money(variant.get("compareAtPrice")),
        }
        for variant in ((product.get("variants") or {}).get("nodes", []) or [])
        if isinstance(variant, dict)
    ]
    # Shopify returns every attached value here: merchant-facing fields as well
    # as technical values owned by review, recommendation, analytics, and theme
    # apps.  The product editor should mirror Shopify's product page, which
    # surfaces only the metafield definitions pinned for that resource.
    metafields = [
        field
        for field in ((product.get("metafields") or {}).get("nodes", []) or [])
        if isinstance(field, dict)
        and isinstance(field.get("definition"), dict)
        and field["definition"].get("pinnedPosition") is not None
    ]
    primary_variant = variants[0] if variants else {}
    primary_price = primary_variant.get("price") if isinstance(primary_variant, dict) else {}
    return {
        "name": product.get("title") or product.get("handle") or "Untitled product",
        "title": product.get("title") or product.get("handle") or "Untitled product",
        "description": _plain_html(product.get("descriptionHtml")),
        "url": f"https://{store_domain}/products/{product.get('handle')}" if product.get("handle") else f"https://{store_domain}",
        "product_url": f"https://{store_domain}/products/{product.get('handle')}" if product.get("handle") else f"https://{store_domain}",
        "price": str((primary_price or {}).get("amount") or ""),
        "currency": str((primary_price or {}).get("currencyCode") or default_currency),
        "handle": product.get("handle") or "",
        "status": product.get("status") or "",
        "vendor": product.get("vendor") or "",
        "product_type": product.get("productType") or "",
        "tags": product.get("tags") if isinstance(product.get("tags"), list) else [],
        "template_suffix": product.get("templateSuffix") or "",
        "seo": product.get("seo") if isinstance(product.get("seo"), dict) else {},
        "featured_image": product.get("featuredImage") if isinstance(product.get("featuredImage"), dict) else {},
        "media": (product.get("media") or {}).get("nodes", []) if isinstance(product.get("media"), dict) else [],
        "options": product.get("options") if isinstance(product.get("options"), list) else [],
        "variants": variants,
        "metafields": metafields,
        # Retain the source response for future fields without exposing the
        # credentials that were used to retrieve it.
        "shopify": product,
    }


async def _run_import(app, job_id: str, org_id: str, maximum: int, domain: str | None, access_token: str | None) -> None:
    pool: asyncpg.Pool = app.state.db
    try:
        resources = await list_admin_resources(app.state.settings, maximum, domain=domain, access_token=access_token)
        async with pool.acquire() as connection:
            async with connection.transaction():
                job = await connection.fetchrow("SELECT brand_id,start_url,status FROM crawl_jobs WHERE id=$1::uuid FOR UPDATE", job_id)
                if not job or job["status"] != "running":
                    return
                source = await connection.fetchrow(
                    """INSERT INTO source_records (org_id,brand_id,pipeline_run_id,kind,title,source_url)
                       SELECT org_id,brand_id,id,'shopify','Shopify Admin API import',$2 FROM pipeline_runs
                       WHERE crawl_job_id=$1::uuid RETURNING id::text""",
                    job_id, job["start_url"],
                )
                await connection.executemany(
                    """INSERT INTO pages (org_id,url,canonical_url,title,text,structured,content_hash,http_status,rendered_with,needs_parse,last_job_id,fetched_at)
                       VALUES ($1::uuid,$2,$2,$3,$4,$5::jsonb,$6,200,'shopify_api',false,$7::uuid,now())
                       ON CONFLICT (org_id,url) DO UPDATE SET canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,
                         text=EXCLUDED.text,structured=EXCLUDED.structured,content_hash=EXCLUDED.content_hash,http_status=200,
                         rendered_with='shopify_api',needs_parse=false,last_job_id=EXCLUDED.last_job_id,fetched_at=now()""",
                    [
                        (org_id, item.url, item.title, item.text, {**item.structured, "page_type": item.page_type, "source_record_id": source["id"]},
                         hashlib.sha256(item.text.encode("utf-8")).hexdigest(), job_id)
                        for item in resources
                    ],
                )
                await connection.execute("UPDATE crawl_jobs SET status='done',error=NULL,resume_at=NULL WHERE id=$1::uuid", job_id)
                await advance_completed_crawl(connection, job_id)
    except Exception as exc:
        async with pool.acquire() as connection:
            await connection.execute("UPDATE crawl_jobs SET status='failed',error=$2 WHERE id=$1::uuid", job_id, str(exc)[:2000])
            await connection.execute("UPDATE pipeline_runs SET status='failed',error=$2 WHERE crawl_job_id=$1::uuid", job_id, str(exc)[:2000])
            await connection.execute(
                """UPDATE pipeline_stages SET status='failed',error=$2 WHERE pipeline_run_id IN
                   (SELECT id FROM pipeline_runs WHERE crawl_job_id=$1::uuid) AND stage='crawl'""",
                job_id, str(exc)[:2000],
            )


async def _enqueue_import(
    payload: ShopifyImport, background_tasks: BackgroundTasks, request: Request, user: User,
) -> dict:
    domain, access_token, credential_source = None, None, "manual"
    if payload.domain and payload.access_token:
        domain, access_token = payload.domain, payload.access_token
    else:
        domain, access_token, credential_source = await _resolve_credentials(request, payload.brand_name, payload.use_vault)
    if not domain or not access_token:
        raise HTTPException(status_code=503, detail="Shopify Admin credentials are not configured on the server")
    store_domain = admin_domain(domain)
    outputs = [item for item in dict.fromkeys(payload.outputs) if item in {"sops", "faqs", "products"}]
    if not outputs:
        raise HTTPException(status_code=422, detail="Select at least one output")
    options = {"catalog_source": "shopify_admin", "maximum": payload.maximum, "outputs": outputs}
    async with request.app.state.db.acquire() as connection:
        job = await connection.fetchrow(
            """INSERT INTO crawl_jobs (org_id,start_url,brand_id,status,options)
               VALUES ($1::uuid,$2,$3::uuid,'running',$4::jsonb) RETURNING *""",
            user.org_id, f"https://{store_domain}", payload.brand_id, options,
        )
        pipeline_id = await create_crawl_pipeline(
            connection, org_id=str(user.org_id), brand_id=payload.brand_id, crawl_job_id=str(job["id"]),
            options=options, source_kind="shopify",
        )
        await connection.execute("UPDATE crawl_jobs SET options=$2::jsonb WHERE id=$1::uuid", job["id"], {**options, "pipeline_id": pipeline_id})
    # The token is kept only in this in-memory background task; it is never stored in Postgres or returned to the client.
    background_tasks.add_task(_run_import, request.app, str(job["id"]), str(user.org_id), payload.maximum, store_domain, access_token)
    return {"crawl_job_id": str(job["id"]), "pipeline_id": pipeline_id, "source": "shopify_admin", "credential_source": credential_source, "domain": store_domain}


@router.get("/credentials")
async def shopify_credentials(
    request: Request, brand_name: str = Query(min_length=1, max_length=160), _: User = Depends(current_user),
) -> dict:
    """Return safe setup metadata only; the Shopify access token is never returned."""
    domain, token, source = await _resolve_credentials(request, brand_name, True)
    return {
        "brand_name": brand_name,
        "domain": domain,
        "token_available": bool(token),
        "source": source,
    }


@router.post("/products/sync")
async def sync_shopify_product_library(
    payload: ShopifyProductSync, request: Request, _: User = Depends(current_user),
) -> dict:
    """Refresh a connected brand's editable product library from Shopify.

    This is an import, not a write-back: edits made in Orb update the support
    knowledge copy and a later sync intentionally refreshes it from Shopify.
    """
    brand = await _remote_brand_by_name(request, payload.brand_name)
    domain, access_token, source = await _resolve_credentials(request, payload.brand_name, payload.use_vault)
    if not domain or not access_token:
        raise HTTPException(status_code=503, detail="Shopify is not connected for this brand. Install Shopify or add its Vault credentials first.")
    try:
        store_domain = admin_domain(domain)
        products = await list_admin_products(request.app.state.settings, payload.maximum, domain=store_domain, access_token=access_token)
    except ShopifyAdminUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    records = [
        {
            "brand_id": brand["id"], "provider": "shopify_admin", "external_id": str(product["id"]),
            "payload": _product_payload(product, store_domain), "source_url": f"https://{store_domain}/products/{product.get('handle') or product['id']}",
            "status": "active",
        }
        for product in products
    ]
    if records:
        await _supabase_write(
            request, "POST", "orb_products", params={"on_conflict": "brand_id,provider,external_id", "select": "id"}, payload=records,
            prefer="resolution=merge-duplicates,return=representation",
        )
    return {"synced": len(records), "domain": store_domain, "credential_source": source}


@router.post("/products/metafields/save")
async def save_shopify_product_metafields(
    payload: ShopifyMetafieldSave, request: Request, _: User = Depends(current_user),
) -> dict:
    """Write existing product metafields to Shopify, then persist the accepted values in Orb."""
    brand = await _remote_brand_by_name(request, payload.brand_name)
    rows = await _supabase_rows(request, "orb_products", {
        "select": "id,external_id,payload,provider",
        "id": f"eq.{payload.product_id}",
        "brand_id": f"eq.{brand['id']}",
        "provider": "eq.shopify_admin",
        "limit": "1",
    })
    if not rows:
        raise HTTPException(status_code=404, detail="This Shopify product is no longer available in Orb. Sync Products and try again.")
    row = rows[0]
    product_payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    stored_fields = product_payload.get("metafields") if isinstance(product_payload.get("metafields"), list) else []
    stored_by_key = {
        (str(field.get("namespace") or ""), str(field.get("key") or "")): field
        for field in stored_fields if isinstance(field, dict)
    }
    requested: list[dict] = []
    for field in payload.metafields:
        stored = stored_by_key.get((field.namespace, field.key))
        if stored and str(stored.get("type") or "") != field.type:
            raise HTTPException(status_code=422, detail=f"The type for {field.namespace}.{field.key} cannot be changed from Orb.")
        requested.append({
            "ownerId": str(row["external_id"]), "namespace": field.namespace, "key": field.key,
            "type": field.type, "value": field.value,
        })

    deleted_ids = {str(value) for value in payload.deleted_metafield_ids if str(value)}
    stored_by_id = {str(field.get("id") or ""): field for field in stored_fields if isinstance(field, dict) and field.get("id")}
    unknown_deletions = deleted_ids - set(stored_by_id)
    if unknown_deletions:
        raise HTTPException(status_code=422, detail="A metafield selected for deletion is no longer available. Sync Products and try again.")

    domain, access_token, _source = await _resolve_credentials(request, payload.brand_name, payload.use_vault)
    if not domain or not access_token:
        raise HTTPException(status_code=503, detail="Shopify is not connected for this brand. Install Shopify or add its Vault credentials first.")
    set_mutation = """
    mutation OrbSaveProductMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key type value }
        userErrors { field message code }
      }
    }
    """
    delete_mutation = """
    mutation OrbDeleteProductMetafields($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        deletedMetafields { ownerId namespace key }
        userErrors { field message code }
      }
    }
    """
    accepted: dict[tuple[str, str], dict] = {}
    deleted_keys: set[tuple[str, str]] = set()
    try:
        for start in range(0, len(requested), 25):
            data = await _admin_query(
                request.app.state.settings, set_mutation, {"metafields": requested[start:start + 25]},
                domain=admin_domain(domain), access_token=access_token,
            )
            result = (data.get("metafieldsSet") or {}) if isinstance(data, dict) else {}
            errors = result.get("userErrors") or []
            if errors:
                message = "; ".join(str(error.get("message") or "Shopify rejected a metafield") for error in errors if isinstance(error, dict))
                raise HTTPException(status_code=422, detail=message or "Shopify rejected one or more metafields.")
            for field in result.get("metafields") or []:
                if isinstance(field, dict):
                    accepted[(str(field.get("namespace") or ""), str(field.get("key") or ""))] = field
        if deleted_ids:
            delete_input = [
                {"ownerId": str(row["external_id"]), "namespace": field.get("namespace"), "key": field.get("key")}
                for field_id, field in stored_by_id.items() if field_id in deleted_ids
            ]
            for start in range(0, len(delete_input), 25):
                data = await _admin_query(
                    request.app.state.settings, delete_mutation, {"metafields": delete_input[start:start + 25]},
                    domain=admin_domain(domain), access_token=access_token,
                )
                result = (data.get("metafieldsDelete") or {}) if isinstance(data, dict) else {}
                errors = result.get("userErrors") or []
                if errors:
                    message = "; ".join(str(error.get("message") or "Shopify rejected a metafield deletion") for error in errors if isinstance(error, dict))
                    raise HTTPException(status_code=422, detail=message or "Shopify rejected one or more metafield deletions.")
                for field in result.get("deletedMetafields") or []:
                    if isinstance(field, dict):
                        deleted_keys.add((str(field.get("namespace") or ""), str(field.get("key") or "")))
    except ShopifyAdminUnavailable as exc:
        if "ACCESS_DENIED" in str(exc) and ("metafieldsSet" in str(exc) or "metafieldsDelete" in str(exc)):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Shopify rejected this write because the token currently used by Orb does not include write_products. "
                    "After adding that scope, reinstall or regenerate the app token and update the token stored for this brand."
                ),
            ) from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    def merge_fields(fields: list) -> list:
        merged = [
            {**field, **accepted.get((str(field.get("namespace") or ""), str(field.get("key") or "")), {})}
            for field in fields
            if isinstance(field, dict) and (str(field.get("namespace") or ""), str(field.get("key") or "")) not in deleted_keys
        ]
        existing_keys = {(str(field.get("namespace") or ""), str(field.get("key") or "")) for field in merged}
        merged.extend(field for key, field in accepted.items() if key not in existing_keys)
        return merged

    product_payload = {**product_payload, "metafields": merge_fields(stored_fields)}
    shopify_payload = product_payload.get("shopify")
    if isinstance(shopify_payload, dict) and isinstance(shopify_payload.get("metafields"), dict):
        product_payload["shopify"] = {
            **shopify_payload,
            "metafields": {**shopify_payload["metafields"], "nodes": merge_fields(shopify_payload["metafields"].get("nodes") or [])},
        }
    await _supabase_write(
        request, "PATCH", "orb_products",
        params={"id": f"eq.{row['id']}", "brand_id": f"eq.{brand['id']}", "select": "id"},
        payload={"payload": product_payload},
    )
    return {"saved": len(accepted), "deleted": len(deleted_keys), "product_id": str(row["id"])}


@router.post("/import", status_code=status.HTTP_202_ACCEPTED)
async def import_shopify(
    payload: ShopifyImport, background_tasks: BackgroundTasks, request: Request, user: User = Depends(current_user),
) -> dict:
    return await _enqueue_import(payload, background_tasks, request, user)


@router.post("/the-dearist/import", status_code=status.HTTP_202_ACCEPTED)
async def import_the_dearist(
    payload: ShopifyImport, background_tasks: BackgroundTasks, request: Request, user: User = Depends(current_user),
) -> dict:
    """Backwards-compatible route for the preconfigured The Dearist integration."""
    return await _enqueue_import(payload, background_tasks, request, user)
