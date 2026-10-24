CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS crawl_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  start_url text NOT NULL,
  brand_id uuid,
  status text NOT NULL DEFAULT 'discovering' CHECK (status IN ('discovering', 'ready', 'running', 'done', 'failed', 'cancelled')),
  error text,
  crawl_delay real,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS brand_id uuid;
CREATE INDEX IF NOT EXISTS crawl_jobs_brand_created_idx ON crawl_jobs (brand_id, created_at DESC) WHERE brand_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crawl_urls (
  job_id uuid NOT NULL REFERENCES crawl_jobs(id) ON DELETE CASCADE,
  url text NOT NULL,
  page_type text NOT NULL CHECK (page_type IN ('product', 'collection', 'blog', 'policy', 'page', 'other')),
  selected boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped')),
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
