"""Authenticated Shopify Admin imports for stores that block storefront crawlers."""
from __future__ import annotations

import hashlib
import os
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


async def _product_theme_templates(request: Request, brand_name: str, user: User) -> list[dict[str, str]]:
    """Return assignable product template suffixes from the live Shopify theme."""
    domain, access_token, _source = await _resolve_credentials(request, brand_name, True, user)
    if not domain or not access_token:
        raise HTTPException(status_code=503, detail="Shopify is not connected for this brand.")
    settings = request.app.state.settings
    try:
        themes = await _admin_query(settings, """
        query OrbMainTheme {
          themes(first: 1, roles: [MAIN]) { nodes { id name } }
        }
        """, {}, domain=domain, access_token=access_token)
        main_theme = ((themes.get("themes") or {}).get("nodes") or [None])[0]
        if not isinstance(main_theme, dict) or not main_theme.get("id"):
            raise HTTPException(status_code=404, detail="Shopify has no published theme to inspect.")
        filenames: list[str] = []
        cursor: str | None = None
        for _ in range(8):
            result = await _admin_query(settings, """
            query OrbThemeFiles($themeId: ID!, $after: String) {
              theme(id: $themeId) {
                files(first: 250, after: $after) {
                  nodes { filename }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
            """, {"themeId": main_theme["id"], "after": cursor}, domain=domain, access_token=access_token)
            files = ((result.get("theme") or {}).get("files") or {})
            filenames.extend(str(node.get("filename") or "") for node in (files.get("nodes") or []) if isinstance(node, dict))
            page = files.get("pageInfo") or {}
            if not page.get("hasNextPage") or not page.get("endCursor"):
                break
            cursor = str(page["endCursor"])
    except ShopifyAdminUnavailable as exc:
        raise HTTPException(status_code=502, detail=(
            "Orb could not load this store's theme templates. Ensure the Shopify token has read_themes, then reconnect Shopify."
        )) from exc
    suffixes: set[str] = set()
    for filename in filenames:
        match = re.fullmatch(r"templates/product\.([^.\/]+)\.(?:json|liquid)", filename)
        if match:
            suffixes.add(match.group(1))
    return [{"value": suffix, "label": suffix.replace("-", " ").replace("_", " ").title()} for suffix in sorted(suffixes)]


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
    """Map a brand name to its two standard server/Vault secret names."""
    key = re.sub(r"[^A-Z0-9]+", "_", brand_name.upper()).strip("_")
    if not key:
        raise ValueError("Brand name cannot be converted to a Shopify Vault key")
    return f"SHOPIFY_{key}_TOKEN", f"SHOPIFY_{key}_DOMAIN"


def _shopify_brand_key(brand_name: str) -> str:
    """Return the stable tenant-local key used by Railway Postgres."""
    token_name, _domain_name = _shopify_vault_names(brand_name)
    return token_name.removeprefix("SHOPIFY_").removesuffix("_TOKEN")


async def _ensure_railway_credential_store(request: Request) -> None:
    """Create the private credential table for existing Railway databases."""
    async with request.app.state.db.acquire() as connection:
        await connection.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        await connection.execute("""
            CREATE TABLE IF NOT EXISTS shopify_brand_credentials (
              org_id uuid NOT NULL,
              brand_key text NOT NULL,
              brand_name text NOT NULL,
              domain text NOT NULL,
              token_encrypted bytea NOT NULL,
              created_by uuid NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now(),
              PRIMARY KEY (org_id, brand_key)
            )
        """)


async def _railway_postgres_credentials(
    request: Request, brand_name: str | None, user: User | None,
) -> tuple[str | None, str | None, str]:
    """Decrypt credentials stored by a previous authenticated installation."""
    key = request.app.state.settings.shopify_credentials_encryption_key
    if not brand_name or user is None or not key:
        return None, None, "railway_postgres_unavailable"
    try:
        brand_key = _shopify_brand_key(brand_name)
        async with request.app.state.db.acquire() as connection:
            row = await connection.fetchrow("""
                SELECT domain, pgp_sym_decrypt(token_encrypted, $3)::text AS access_token
                FROM shopify_brand_credentials
                WHERE org_id=$1::uuid AND brand_key=$2
                LIMIT 1
            """, user.org_id, brand_key, key)
    except asyncpg.PostgresError:
        return None, None, "railway_postgres_unavailable"
    domain = str(row["domain"] or "").strip() if row else ""
    token = str(row["access_token"] or "").strip() if row else ""
    return (domain or None), (token or None), "railway_postgres" if domain and token else "missing"


async def _save_railway_postgres_credentials(
    request: Request, brand_name: str, domain: str, access_token: str, user: User,
) -> None:
    """Encrypt and upsert a manually installed Shopify credential pair."""
    key = request.app.state.settings.shopify_credentials_encryption_key
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Set SHOPIFY_CREDENTIALS_ENCRYPTION_KEY on the Railway orb-api service before saving Shopify credentials.",
        )
    try:
        await _ensure_railway_credential_store(request)
        brand_key = _shopify_brand_key(brand_name)
        async with request.app.state.db.acquire() as connection:
            await connection.execute("""
                INSERT INTO shopify_brand_credentials
                  (org_id, brand_key, brand_name, domain, token_encrypted, created_by)
                VALUES ($1::uuid, $2, $3, $4,
                  pgp_sym_encrypt($5, $6, 'cipher-algo=aes256, compress-algo=1'), $7::uuid)
                ON CONFLICT (org_id, brand_key) DO UPDATE SET
                  brand_name=EXCLUDED.brand_name,
                  domain=EXCLUDED.domain,
                  token_encrypted=EXCLUDED.token_encrypted,
                  created_by=EXCLUDED.created_by,
                  updated_at=now()
            """, user.org_id, brand_key, brand_name, domain, access_token, key, user.id)
    except (asyncpg.PostgresError, OSError) as exc:
        # Never leak database/crypto details or the submitted token. Returning
        # a handled response also preserves CORS headers for the browser.
        raise HTTPException(
            status_code=503,
            detail="Orb could not prepare secure Shopify credential storage in Railway Postgres. Ensure the Railway database is reachable and pgcrypto is enabled.",
        ) from exc


def _server_environment_credentials(brand_name: str | None) -> tuple[str | None, str | None, str]:
    """Read a complete brand-specific credential pair from server variables.

    Railway injects service variables into the API process, so this is the
    preferred path for installed brands.  The browser never receives either
    value.  We intentionally require both values: a partial configuration must
    not silently combine credentials from two separate sources.
    """
    if not brand_name:
        return None, None, "missing"
    try:
        token_name, domain_name = _shopify_vault_names(brand_name)
    except ValueError:
        return None, None, "missing"
    domain = os.getenv(domain_name, "").strip() or None
    token = os.getenv(token_name, "").strip() or None
    if domain and token:
        return domain, token, "server_environment"
    return None, None, "missing"


def _server_environment_status(brand_name: str | None) -> dict[str, str | bool | None]:
    """Return non-secret configuration diagnostics for an authenticated UI."""
    if not brand_name:
        return {
            "server_token_name": None,
            "server_domain_name": None,
            "server_token_configured": False,
            "server_domain_configured": False,
        }
    try:
        token_name, domain_name = _shopify_vault_names(brand_name)
    except ValueError:
        return {
            "server_token_name": None,
            "server_domain_name": None,
            "server_token_configured": False,
            "server_domain_configured": False,
        }
    return {
        "server_token_name": token_name,
        "server_domain_name": domain_name,
        "server_token_configured": bool(os.getenv(token_name, "").strip()),
        "server_domain_configured": bool(os.getenv(domain_name, "").strip()),
    }


async def _direct_vault_credentials(request: Request, brand_name: str) -> tuple[str | None, str | None, str]:
    """Read two explicitly named Vault secrets through the server-only DB URL.

    This path never exposes secrets to the browser and never scans Vault. The
    database role behind SUPABASE_DATABASE_URL must be permitted to read
    vault.decrypted_secrets (normally the project's postgres/service role).
    """
    database_url = request.app.state.settings.supabase_database_url
    if not database_url:
        return None, None, "direct_database_not_configured"
    token_name, domain_name = _shopify_vault_names(brand_name)
    connection = None
    try:
        connection = await asyncpg.connect(database_url, timeout=12)
        row = await connection.fetchrow(
            """
            SELECT
              (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=$1 LIMIT 1) AS shopify_token,
              (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=$2 LIMIT 1) AS shopify_domain
            """,
            token_name,
            domain_name,
        )
        token = str(row["shopify_token"] or "").strip() if row else ""
        domain = str(row["shopify_domain"] or "").strip() if row else ""
        return (domain or None), (token or None), "direct_vault" if domain and token else "missing"
    except (asyncpg.PostgresError, OSError, TimeoutError, ValueError):
        return None, None, "direct_database_unavailable"
    finally:
        if connection is not None:
            await connection.close()


async def _vault_credentials(request: Request, brand_name: str | None) -> tuple[str | None, str | None, str]:
    """Resolve Shopify credentials via a restricted server-only Vault RPC.

    The browser only receives a boolean status from the caller; the token is
    kept in this function and passed directly to Shopify's Admin API.
    """
    settings = request.app.state.settings
    if not brand_name:
        return None, None, "missing"
    direct_status = "direct_database_not_configured"
    if settings.supabase_database_url:
        domain, token, direct_status = await _direct_vault_credentials(request, brand_name)
        if domain and token:
            return domain, token, direct_status
        # A direct database connection is authoritative when the two secret
        # names simply do not exist. Do not hide that fact behind a REST error.
        if direct_status == "missing":
            return None, None, direct_status
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None, None, direct_status if direct_status != "direct_database_not_configured" else "server_configuration_missing"
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
            return None, None, direct_status if direct_status != "direct_database_not_configured" else "vault_rpc_unavailable"
        rows = response.json()
        row = rows[0] if isinstance(rows, list) and rows else {}
        domain = str(row.get("shopify_domain") or "").strip() or None
        token = str(row.get("shopify_token") or "").strip() or None
        return domain, token, "vault" if domain and token else "missing"
    except (httpx.HTTPError, TypeError, ValueError):
        # An unavailable RPC must not expose transport details or secrets.
        return None, None, direct_status if direct_status != "direct_database_not_configured" else "vault_connection_failed"


def _is_legacy_brand(brand_name: str | None) -> bool:
    """The old server variables are only valid for the original Dearist setup."""
    if not brand_name:
        return False
    try:
        token_name, _ = _shopify_vault_names(brand_name)
    except ValueError:
        return False
    return token_name == "SHOPIFY_THE_DEARIST_TOKEN"


async def _resolve_credentials(
    request: Request, brand_name: str | None, use_vault: bool, user: User | None = None,
) -> tuple[str | None, str | None, str]:
    """Resolve one brand's credentials without ever returning the token to a client."""
    # Credentials submitted through Install Shopify are tenant-scoped and
    # encrypted in Railway Postgres. They take precedence over shared service
    # variables so each workspace can connect its own store.
    domain, access_token, source = await _railway_postgres_credentials(request, brand_name, user)
    if not domain or not access_token:
        # Railway service variables remain a useful deploy-time fallback.
        domain, access_token, source = _server_environment_credentials(brand_name)
    if use_vault:
        if not domain or not access_token:
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
        if not payload.brand_name:
            raise HTTPException(status_code=422, detail="Choose a brand before saving Shopify credentials.")
        store_domain = admin_domain(domain)
        await _save_railway_postgres_credentials(request, payload.brand_name, store_domain, access_token, user)
        credential_source = "railway_postgres"
    else:
        domain, access_token, credential_source = await _resolve_credentials(request, payload.brand_name, payload.use_vault, user)
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
    request: Request, brand_name: str = Query(min_length=1, max_length=160), user: User = Depends(current_user),
) -> dict:
    """Return safe setup metadata only; the Shopify access token is never returned."""
    domain, token, source = await _resolve_credentials(request, brand_name, True, user)
    return {
        "brand_name": brand_name,
        "domain": domain,
        "token_available": bool(token),
        "source": source,
        **_server_environment_status(brand_name),
    }


@router.post("/products/sync")
async def sync_shopify_product_library(
    payload: ShopifyProductSync, request: Request, user: User = Depends(current_user),
) -> dict:
    """Refresh a connected brand's editable product library from Shopify.

    This is an import, not a write-back: edits made in Orb update the support
    knowledge copy and a later sync intentionally refreshes it from Shopify.
    """
    brand = await _remote_brand_by_name(request, payload.brand_name)
    domain, access_token, source = await _resolve_credentials(request, payload.brand_name, payload.use_vault, user)
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


@router.get("/products/theme-templates")
async def product_theme_templates(
    request: Request, brand_name: str = Query(min_length=1, max_length=160), user: User = Depends(current_user),
) -> dict:
    """List custom product templates from the store's published Shopify theme."""
    await _remote_brand_by_name(request, brand_name)
    templates = await _product_theme_templates(request, brand_name, user)
    return {"templates": templates}


@router.get("/products/{product_id}/variant-metafields")
async def product_variant_metafields(
    product_id: str, request: Request, brand_name: str = Query(min_length=1, max_length=160), user: User = Depends(current_user),
) -> dict:
    """Load a selected product's variant metafields on demand.

    Variant metafields are deliberately not part of the catalog-sync query:
    nesting them below every variant of every product exceeds Shopify's 1,000
    point GraphQL budget. This bounded request runs only when a user opens a
    product and asks to inspect its variants.
    """
    brand = await _remote_brand_by_name(request, brand_name)
    rows = await _supabase_rows(request, "orb_products", {
        "select": "external_id,provider",
        "id": f"eq.{product_id}",
        "brand_id": f"eq.{brand['id']}",
        "provider": "eq.shopify_admin",
        "limit": "1",
    })
    if not rows:
        raise HTTPException(status_code=404, detail="This Shopify product is no longer available in Orb. Sync Products and try again.")
    domain, access_token, _source = await _resolve_credentials(request, brand_name, True, user)
    if not domain or not access_token:
        raise HTTPException(status_code=503, detail="Shopify is not connected for this brand.")
    query = """
    query OrbVariantMetafields($id: ID!) {
      node(id: $id) {
        ... on Product {
          variants(first: 50) {
            nodes {
              id
              metafields(first: 10) {
                nodes {
                  id namespace key type value description
                  definition { name pinnedPosition }
                }
              }
            }
          }
        }
      }
    }
    """
    try:
        data = await _admin_query(
            request.app.state.settings, query, {"id": str(rows[0]["external_id"])},
            domain=admin_domain(domain), access_token=access_token,
        )
    except ShopifyAdminUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    node = (data.get("node") or {}) if isinstance(data, dict) else {}
    variants = []
    for variant in ((node.get("variants") or {}).get("nodes") or []):
        if not isinstance(variant, dict):
            continue
        fields = [
            field for field in ((variant.get("metafields") or {}).get("nodes") or [])
            if isinstance(field, dict) and isinstance(field.get("definition"), dict)
            and field["definition"].get("pinnedPosition") is not None
        ]
        variants.append({"id": variant.get("id"), "metafields": fields})
    return {"variants": variants}


@router.post("/products/metafields/save")
async def save_shopify_product_metafields(
    payload: ShopifyMetafieldSave, request: Request, user: User = Depends(current_user),
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

    domain, access_token, _source = await _resolve_credentials(request, payload.brand_name, payload.use_vault, user)
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
