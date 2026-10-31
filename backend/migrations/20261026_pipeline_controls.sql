-- Apply after 20261026_pipeline_foundation.sql.
-- Adds user-controlled pause/resume/cancel states without discarding queued URLs.
ALTER TABLE crawl_jobs DROP CONSTRAINT IF EXISTS crawl_jobs_status_check;
ALTER TABLE crawl_jobs ADD CONSTRAINT crawl_jobs_status_check
  CHECK (status IN ('discovering', 'ready', 'running', 'paused', 'throttled', 'done', 'failed', 'cancelled'));

ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_status_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_status_check
  CHECK (status IN ('running', 'paused', 'throttled', 'review', 'published', 'failed', 'cancelled'));

ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_status_check;
ALTER TABLE pipeline_stages ADD CONSTRAINT pipeline_stages_status_check
  CHECK (status IN ('queued', 'running', 'paused', 'throttled', 'waiting_review', 'done', 'failed', 'cancelled'));
