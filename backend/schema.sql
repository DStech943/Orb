CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS crawl_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  start_url text NOT NULL,
  brand_id uuid,
  status text NOT NULL DEFAULT 'discovering' CHECK (status IN ('discovering', 'ready', 'running', 'paused', 'throttled', 'done', 'failed', 'cancelled')),
  error text,
  resume_at timestamptz,
  crawl_delay real,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  brand_id uuid,
  crawl_job_id uuid REFERENCES crawl_jobs(id) ON DELETE SET NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('crawl', 'paste', 'upload', 'shopify')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'throttled', 'review', 'published', 'failed', 'cancelled')),
  current_stage text NOT NULL DEFAULT 'crawl' CHECK (current_stage IN ('crawl', 'parse', 'generate', 'review', 'publish')),
  error text,
  resume_at timestamptz,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  pipeline_run_id uuid NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('crawl', 'parse', 'generate', 'review', 'publish')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'throttled', 'waiting_review', 'done', 'failed', 'cancelled')),
  error text,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  PRIMARY KEY (pipeline_run_id, stage)
);

CREATE TABLE IF NOT EXISTS source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  brand_id uuid,
  pipeline_run_id uuid REFERENCES pipeline_runs(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('paste', 'upload', 'shopify')),
  title text NOT NULL,
  source_url text,
  mime_type text,
  content text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS host_cooldowns (
  host text PRIMARY KEY,
  resume_at timestamptz NOT NULL,
  http_status integer,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discovery_cache (
  url text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('robots', 'sitemap')),
  status_code integer NOT NULL,
  body_gz bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Server-side Shopify credentials saved through the authenticated install
-- flow. Tokens are encrypted with pgcrypto using an application key that is
-- stored only in Railway's orb-api environment variables.
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
);

ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS brand_id uuid;
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS resume_at timestamptz;
CREATE INDEX IF NOT EXISTS crawl_jobs_brand_created_idx ON crawl_jobs (brand_id, created_at DESC) WHERE brand_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crawl_urls (
  job_id uuid NOT NULL REFERENCES crawl_jobs(id) ON DELETE CASCADE,
  url text NOT NULL,
  page_type text NOT NULL CHECK (page_type IN ('product', 'collection', 'blog', 'policy', 'page', 'other')),
  selected boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'render_pending', 'processing', 'done', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  throttled_count integer NOT NULL DEFAULT 0 CHECK (throttled_count <= 8),
  error text,
  http_status integer,
  last_modified text,
  locked_at timestamptz,
  retry_after timestamptz,
  PRIMARY KEY (job_id, url)
);

CREATE INDEX IF NOT EXISTS crawl_urls_selected_status_idx ON crawl_urls (job_id, status) WHERE selected;
CREATE INDEX IF NOT EXISTS crawl_jobs_org_created_idx ON crawl_jobs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_runs_org_created_idx ON pipeline_runs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_runs_crawl_job_idx ON pipeline_runs (crawl_job_id) WHERE crawl_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS host_cooldowns_resume_idx ON host_cooldowns (resume_at);

CREATE TABLE IF NOT EXISTS pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  url text NOT NULL,
  canonical_url text,
  title text,
  description text,
  text text,
  structured jsonb NOT NULL DEFAULT '{}'::jsonb,
  html_gz bytea,
  content_hash text,
  http_status integer,
  lang text,
  last_modified text,
  rendered_with text CHECK (rendered_with IN ('httpx', 'playwright', 'shopify_api')),
  needs_parse boolean NOT NULL DEFAULT true,
  last_job_id uuid REFERENCES crawl_jobs(id) ON DELETE SET NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, url)
);

ALTER TABLE crawl_urls ADD COLUMN IF NOT EXISTS throttled_count integer NOT NULL DEFAULT 0;
ALTER TABLE crawl_urls ADD COLUMN IF NOT EXISTS last_modified text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crawl_urls_throttled_count_max') THEN
    ALTER TABLE crawl_urls ADD CONSTRAINT crawl_urls_throttled_count_max CHECK (throttled_count <= 8);
  END IF;
END $$;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS canonical_url text;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS http_status integer;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS lang text;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS last_modified text;
CREATE UNIQUE INDEX IF NOT EXISTS pages_org_canonical_url_idx ON pages (org_id, canonical_url) WHERE canonical_url IS NOT NULL;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crawl_jobs_set_updated_at ON crawl_jobs;
CREATE TRIGGER crawl_jobs_set_updated_at BEFORE UPDATE ON crawl_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS pipeline_runs_set_updated_at ON pipeline_runs;
CREATE TRIGGER pipeline_runs_set_updated_at BEFORE UPDATE ON pipeline_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
