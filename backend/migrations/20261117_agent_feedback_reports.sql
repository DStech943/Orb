-- Escalated agent issue reports: a feedback row plus an immutable conversation
-- snapshot, optional Slack tagging, and Slack delivery tracking.
--
-- This builds on cx_copilot.orb_agent_feedback (20261109). Existing rows keep
-- working: they stay kind = 'feedback' with no category and no Slack delivery.
-- Apply this migration BEFORE deploying the API change that reads these columns.

-- 1. Issue-report columns on the existing feedback table -------------------------------
ALTER TABLE cx_copilot.orb_agent_feedback
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'feedback',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS agent_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tagged_people jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS slack_delivery_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS slack_channel_id text,
  ADD COLUMN IF NOT EXISTS slack_message_ts text,
  ADD COLUMN IF NOT EXISTS slack_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slack_last_error text,
  ADD COLUMN IF NOT EXISTS slack_sent_at timestamptz;

ALTER TABLE cx_copilot.orb_agent_feedback DROP CONSTRAINT IF EXISTS orb_agent_feedback_kind_check;
ALTER TABLE cx_copilot.orb_agent_feedback ADD CONSTRAINT orb_agent_feedback_kind_check
  CHECK (kind IN ('feedback', 'issue_report'));

ALTER TABLE cx_copilot.orb_agent_feedback DROP CONSTRAINT IF EXISTS orb_agent_feedback_category_check;
ALTER TABLE cx_copilot.orb_agent_feedback ADD CONSTRAINT orb_agent_feedback_category_check
  CHECK (category IS NULL OR category IN (
    'incorrect_response', 'hallucination', 'context_loss', 'rag_retrieval_failure',
    'tool_execution_failure', 'incorrect_behavior', 'other'
  ));

ALTER TABLE cx_copilot.orb_agent_feedback DROP CONSTRAINT IF EXISTS orb_agent_feedback_severity_check;
ALTER TABLE cx_copilot.orb_agent_feedback ADD CONSTRAINT orb_agent_feedback_severity_check
  CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high'));

ALTER TABLE cx_copilot.orb_agent_feedback DROP CONSTRAINT IF EXISTS orb_agent_feedback_slack_status_check;
ALTER TABLE cx_copilot.orb_agent_feedback ADD CONSTRAINT orb_agent_feedback_slack_status_check
  CHECK (slack_delivery_status IN ('not_applicable', 'pending', 'sent', 'failed'));

ALTER TABLE cx_copilot.orb_agent_feedback DROP CONSTRAINT IF EXISTS orb_agent_feedback_tagged_people_check;
ALTER TABLE cx_copilot.orb_agent_feedback ADD CONSTRAINT orb_agent_feedback_tagged_people_check
  CHECK (jsonb_typeof(tagged_people) = 'array');

-- An issue report must be categorised; plain feedback never is.
ALTER TABLE cx_copilot.orb_agent_feedback DROP CONSTRAINT IF EXISTS orb_agent_feedback_report_shape_check;
ALTER TABLE cx_copilot.orb_agent_feedback ADD CONSTRAINT orb_agent_feedback_report_shape_check
  CHECK ((kind = 'issue_report') = (category IS NOT NULL));

-- A retried submit with the same key must resolve to the same report.
CREATE UNIQUE INDEX IF NOT EXISTS orb_agent_feedback_idempotency_idx
  ON cx_copilot.orb_agent_feedback (submitted_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Lets an admin (or a future sweeper) find reports that still need delivering.
CREATE INDEX IF NOT EXISTS orb_agent_feedback_slack_pending_idx
  ON cx_copilot.orb_agent_feedback (created_at)
  WHERE slack_delivery_status IN ('pending', 'failed');

-- 2. Immutable conversation snapshots --------------------------------------------------
-- Kept out of orb_agent_feedback so list queries never drag large JSON along and so
-- the evidence can be protected from edits independently of the review workflow.
CREATE TABLE IF NOT EXISTS cx_copilot.orb_agent_feedback_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL UNIQUE REFERENCES cx_copilot.orb_agent_feedback(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES cx_copilot.brands(id) ON DELETE CASCADE,
  messages jsonb NOT NULL CHECK (jsonb_typeof(messages) = 'array'),
  message_count integer NOT NULL CHECK (message_count >= 0),
  truncated boolean NOT NULL DEFAULT false,
  snapshot_source text NOT NULL DEFAULT 'client' CHECK (snapshot_source IN ('client', 'agent_history')),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orb_agent_feedback_snapshots_brand_idx
  ON cx_copilot.orb_agent_feedback_snapshots (brand_id, created_at DESC);

GRANT USAGE ON SCHEMA cx_copilot TO authenticated;
-- No UPDATE or DELETE grant: authenticated users can only add and read snapshots.
GRANT SELECT, INSERT ON cx_copilot.orb_agent_feedback_snapshots TO authenticated;

ALTER TABLE cx_copilot.orb_agent_feedback_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orb_agent_feedback_snapshots_read" ON cx_copilot.orb_agent_feedback_snapshots;
CREATE POLICY "orb_agent_feedback_snapshots_read"
  ON cx_copilot.orb_agent_feedback_snapshots FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM cx_copilot.orb_profiles profile WHERE profile.id = auth.uid() AND profile.role = 'admin')
    OR EXISTS (SELECT 1 FROM cx_copilot.orb_brand_memberships membership WHERE membership.brand_id = orb_agent_feedback_snapshots.brand_id AND membership.user_id = auth.uid())
  );

-- Only the person who filed the report may attach its snapshot, and only for the
-- brand the report belongs to.
DROP POLICY IF EXISTS "orb_agent_feedback_snapshots_insert" ON cx_copilot.orb_agent_feedback_snapshots;
CREATE POLICY "orb_agent_feedback_snapshots_insert"
  ON cx_copilot.orb_agent_feedback_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_agent_feedback feedback
      WHERE feedback.id = orb_agent_feedback_snapshots.feedback_id
        AND feedback.brand_id = orb_agent_feedback_snapshots.brand_id
        AND feedback.submitted_by = auth.uid()
        AND feedback.kind = 'issue_report'
    )
  );

-- RLS does not bind the service role, so a trigger guarantees a snapshot is never
-- edited once written. Deletion only happens through ON DELETE CASCADE or a
-- retention job; neither role of the app has a DELETE policy.
CREATE OR REPLACE FUNCTION cx_copilot.orb_agent_feedback_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'orb_agent_feedback_snapshots rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS orb_agent_feedback_snapshots_no_update ON cx_copilot.orb_agent_feedback_snapshots;
CREATE TRIGGER orb_agent_feedback_snapshots_no_update
  BEFORE UPDATE ON cx_copilot.orb_agent_feedback_snapshots
  FOR EACH ROW EXECUTE FUNCTION cx_copilot.orb_agent_feedback_snapshots_immutable();

-- 3. Slack directory ----------------------------------------------------------------------
-- Maps an Orb teammate (by email) to a Slack user id so reports can @mention them.
-- Server-only: no grants and no policies for anon/authenticated. The API reads it with
-- the service role and never returns the Slack ids to the browser.
CREATE TABLE IF NOT EXISTS cx_copilot.orb_slack_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  slack_user_id text NOT NULL CHECK (slack_user_id ~ '^[UW][A-Z0-9]{6,20}$'),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS orb_slack_users_email_idx
  ON cx_copilot.orb_slack_users (lower(email));

ALTER TABLE cx_copilot.orb_slack_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cx_copilot.orb_slack_users FROM anon, authenticated;

-- 4. Server-side (service role) access ------------------------------------------------------
-- The API delivers reports to Slack after the tester's request has finished, so it reads
-- and updates them with the service role rather than the tester's token. The service role
-- bypasses RLS but still needs table privileges, which earlier migrations never granted on
-- individual tables. These grants are additive and safe to repeat.
GRANT USAGE ON SCHEMA cx_copilot TO service_role;
GRANT SELECT, UPDATE ON cx_copilot.orb_agent_feedback TO service_role;
GRANT SELECT ON cx_copilot.orb_agent_feedback_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON cx_copilot.orb_slack_users TO service_role;
-- Read-only access used to build the "tag a teammate" list and the Slack message.
GRANT SELECT ON cx_copilot.brands, cx_copilot.orb_profiles, cx_copilot.admins, cx_copilot.brand_assignments TO service_role;

-- Seed example (run by an admin in the Supabase SQL editor):
--   INSERT INTO cx_copilot.orb_slack_users (email, slack_user_id, display_name)
--   VALUES ('person@example.com', 'U0123ABCDEF', 'Person Name');
