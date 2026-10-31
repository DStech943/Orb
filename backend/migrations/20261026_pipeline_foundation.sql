-- Apply to an existing local Orb crawler database after the base schema.
ALTER TABLE crawl_jobs DROP CONSTRAINT IF EXISTS crawl_jobs_status_check;
ALTER TABLE crawl_jobs ADD CONSTRAINT crawl_jobs_status_check CHECK (status IN ('discovering', 'ready', 'running', 'throttled', 'done', 'failed', 'cancelled'));
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS resume_at timestamptz;
ALTER TABLE crawl_urls DROP CONSTRAINT IF EXISTS crawl_urls_status_check;
ALTER TABLE crawl_urls ADD CONSTRAINT crawl_urls_status_check CHECK (status IN ('pending', 'render_pending', 'processing', 'done', 'failed', 'skipped'));

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, brand_id uuid,
  crawl_job_id uuid REFERENCES crawl_jobs(id) ON DELETE SET NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('crawl', 'paste', 'upload', 'shopify')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'throttled', 'review', 'published', 'failed', 'cancelled')),
  current_stage text NOT NULL DEFAULT 'crawl' CHECK (current_stage IN ('crawl', 'parse', 'generate', 'review', 'publish')),
  error text, resume_at timestamptz, counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pipeline_stages (
  pipeline_run_id uuid NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('crawl', 'parse', 'generate', 'review', 'publish')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'throttled', 'waiting_review', 'done', 'failed')),
  error text, counts jsonb NOT NULL DEFAULT '{}'::jsonb, started_at timestamptz, finished_at timestamptz,
  PRIMARY KEY (pipeline_run_id, stage)
);
CREATE TABLE IF NOT EXISTS source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, brand_id uuid,
  pipeline_run_id uuid REFERENCES pipeline_runs(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('paste', 'upload', 'shopify')), title text NOT NULL,
  source_url text, mime_type text, content text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS host_cooldowns (host text PRIMARY KEY, resume_at timestamptz NOT NULL, http_status integer, reason text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS discovery_cache (url text PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('robots', 'sitemap')), status_code integer NOT NULL, body_gz bytea NOT NULL, expires_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS worker_heartbeats (worker_id text PRIMARY KEY, updated_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE INDEX IF NOT EXISTS pipeline_runs_org_created_idx ON pipeline_runs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_runs_crawl_job_idx ON pipeline_runs (crawl_job_id) WHERE crawl_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS host_cooldowns_resume_idx ON host_cooldowns (resume_at);
DROP TRIGGER IF EXISTS pipeline_runs_set_updated_at ON pipeline_runs;
CREATE TRIGGER pipeline_runs_set_updated_at BEFORE UPDATE ON pipeline_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
