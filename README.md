# Orb

Orb turns business sources into draft SOPs, FAQs, and product knowledge. The landing page stays at `/`; the protected app begins at `/app`.

## Run locally

```bash
npm install
npm run dev
npm run build
```

## App routes

- `/app` — onboarding generator or content overview
- `/app/sops` — generated SOPs and editor drawer
- `/app/faqs` — generated FAQs and editor drawer
- `/app/settings?tab=profile` — account and workspace setup

Old `/app/knowledge-packs` and `/app/templates` URLs redirect to `/app`.

## Mock login and generation

Authentication is local mock auth. Any valid email and a password with at least six characters work immediately. Sign-up keeps the entered display name in browser storage.

## Roles

The mock backend stores a `role` for every user: `admin` or `client`. The first local account is an admin and subsequent accounts begin as clients. Use the avatar menu’s **Demo role** controls to preview each dashboard role; assignments are persisted in `localStorage`. The future Supabase equivalent is in `supabase/migrations/20261022_add_orb_profile_roles.sql`.

The generation demo starts with no content. Add a source, select outputs, and choose **Generate**. The mock job moves from Queued to Running to Done in roughly eight seconds, then creates draft records. Data persists in browser local storage, including when you refresh or navigate away. Use **Settings → Sources → Load sample data** to seed the workspace.

To replace the mock generation backend, edit only [`src/services/generation.js`](src/services/generation.js). Its exported functions are the boundary for a real API. To replace authentication later, edit [`src/services/auth.js`](src/services/auth.js).

## Standalone crawling service

`backend/` is a self-contained Python 3.11+ crawling service. It uses FastAPI, asyncpg, and PostgreSQL 16; it has no Supabase dependency and never puts crawler or database credentials in Vite.

The service creates a discovery job, respects `robots.txt`, validates every outbound URL (including redirects and sitemap links), then lets an authenticated tenant choose the discovered URLs to crawl. A separate worker claims rows atomically with PostgreSQL `FOR UPDATE SKIP LOCKED`, extracts readable Markdown plus metadata, and stores a gzipped HTML snapshot.

### Local Docker setup

```powershell
cd backend
docker compose up --build
```

This starts PostgreSQL, the API on `http://localhost:8000`, and the worker. The compose setup deliberately has `AUTH_DISABLED=true` for local development only.

### Local Python setup

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
psql $env:DATABASE_URL -f schema.sql
uvicorn app.main:app --host 127.0.0.1 --port 8000 --env-file .env
```

Open a second terminal for the queue worker:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.worker
```

### API flow

All routes are under `/api/crawls`:

- `POST /api/crawls` creates a discovery job in the background.
- `GET /api/crawls/{job_id}/urls` lists safe and robots-filtered URLs.
- `PATCH /api/crawls/{job_id}/urls` selects or deselects discovered URLs.
- `POST /api/crawls/{job_id}/start` lets the worker crawl selected URLs.
- `POST /api/crawls/{job_id}/retry-failed` and `POST /api/crawls/{job_id}/cancel` manage a job.

In production set `ENV=production`, `AUTH_DISABLED=false`, a strong `JWT_SECRET`, a restrictive `CORS_ORIGINS`, and a server-only `DATABASE_URL`. The API expects an `Authorization: Bearer` token signed with HS256 containing `sub` and `org_id` UUID claims. It returns `404` for jobs from a different organization.

`ENABLE_JS_RENDER=true` enables the optional Playwright path for large JS shells with little extractable content. Install the browser package in the image or host before enabling it. It blocks image, font, and media requests and still checks every requested URL.

The default host limiter is one request per second and one in-flight request per host. `PER_HOST_CONCURRENCY` can be raised to `2`; `CRAWL_DELAY` and robots.txt `Crawl-delay` are capped at ten seconds. A 429 or 503 creates a host-wide cooldown (up to 120 seconds), so all worker tasks slow down together rather than retrying simultaneously. Environment changes are read at worker startup: after changing Compose variables run `docker compose up -d`, not only `docker compose restart`.

### Contract for the frontend

All endpoints require the normal bearer token in production. Request models reject unknown fields with `422`.

```http
POST /api/crawls
Content-Type: application/json

{"url":"https://example.com","max_pages":200,"catalog_source":"crawl"}
```

`start_url` is accepted as an alias for `url`. The `201` response is the job object, for example `{"id":"uuid","status":"discovering","options":{"max_pages":200,"catalog_source":"crawl"}}`. After discovery, `options.discovery` includes per-sitemap diagnostics, probe results, fallback state, and totals.

```http
GET /api/crawls/{id}
GET /api/crawls/{id}/urls?status=pending&page_type=policy&limit=100&offset=0
GET /api/crawls/{id}/pages?limit=100&offset=0
```

`GET /api/crawls` returns an array of job objects. The job-detail response additionally contains `progress` (`pending`, `processing`, `done`, `failed`, `skipped`, `throttled`) and `discovered_by_type`; the URLs and pages routes return `{"items":[...],"total":42}`. A page item contains `url`, `title`, `text_length`, `rendered_with`, `needs_parse`, and `fetched_at`.

```http
PATCH /api/crawls/{id}/urls
Content-Type: application/json

{"urls":["https://example.com/policies/returns"],"selected":true}

POST /api/crawls/{id}/start
Content-Type: application/json

{"page_types":["policy","page","blog"],"max_pages":45,"include":[],"exclude":["/track"]}

POST /api/crawls/{id}/start

POST /api/crawls/{id}/retry-failed
POST /api/crawls/{id}/cancel
```

`POST /start` without a body uses already selected URLs. If none are selected it selects up to 100 `policy`, `page`, and `blog` URLs. When `catalog_source` is `external`, products and collections are not selected by default. Each start/retry/cancel response is the updated job object. `PATCH /urls` returns `204 No Content`; invalid state transitions return `409`, unknown request fields return `422`, and another organization’s ID returns `404`.

`GET /healthz` is the preferred health endpoint; `/health` is retained as an alias. Both return `{"ok":true}`.

### Brand knowledge generation and Qdrant publishing

Run the Supabase migration [`20261024_orb_knowledge_generation.sql`](supabase/migrations/20261024_orb_knowledge_generation.sql) before enabling this flow. It adds `industry_category` to `cx_copilot.brands`, plus category SOP templates, generation jobs, generated drafts, and synced product records.

1. `GET /api/categories`, then `PATCH /api/brands/{brand_id}/category` with `{"industry_category":"beauty_personal_care"}`.
2. Create active category templates with `POST /api/sop-templates`. A template is JSON containing the reference flow: `situation`, `check_first`, `what_to_do`, `what_to_say`, and `escalate_to`.
3. Create a crawl with `brand_id`, complete it, then `POST /api/generations` with `{"brand_id":"uuid","outputs":["sops","faqs","products"],"source_job_ids":["crawl-job-uuid"]}`.
4. Poll `GET /api/generations/{id}`. SOPs use only templates for that brand's category. FAQs have no template and are generated solely from completed source pages. Products first use `POST /api/brands/{brand_id}/products/shopify-sync` and otherwise fall back to successfully scraped product pages.
5. Review entries from `GET /api/brands/{brand_id}/content`, set an item to `approved` with `PATCH /api/content/{id}`, then publish with `POST /api/brands/{brand_id}/publish`.

Generation and publishing are server-only. Put `QDRANT_URL`, `QDRANT_API_KEY`, and `ORB_LLM_API_KEY` in Supabase Vault. Set the non-secret model URLs and names in the Python environment. Qdrant publication creates brand-specific collections named `{BRAND}_GENIE_SOP`, `{BRAND}_GENIE_FAQ`, and `{BRAND}_GENIE_PRODUCT`; it embeds content with the configured 768-dimensional provider and records any error on the draft/product record.

### Manual verification checklist

1. Create a job with `POST /api/crawls` and a public site URL; its initial state is `discovering`.
2. Confirm it reaches `ready`, then inspect `GET /api/crawls/{job_id}/urls`. URLs blocked by `robots.txt` are visible as `skipped` and cannot be selected.
3. Select one or more rows with `PATCH /api/crawls/{job_id}/urls`, then call `POST /api/crawls/{job_id}/start`.
4. Confirm the worker moves selected rows through `processing` to `done`, and that a `pages` row contains extracted text, `html_gz`, a hash, and `rendered_with`.
5. Try another organization’s job token: each job route must return `404`, not leak job metadata.
