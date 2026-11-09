-- Feedback collected while a workspace member tests a brand's deployed AI.
-- These records are intentionally separate from the agent's chat history so
-- product and support teams can triage them without replaying a conversation.

CREATE TABLE IF NOT EXISTS cx_copilot.orb_agent_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES cx_copilot.brands(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text NOT NULL CHECK (session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  scope text NOT NULL CHECK (scope IN ('reply', 'conversation')),
  message_id text,
  agent_reply text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tags) = 'array'),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 5000),
  ideal_reply text NOT NULL DEFAULT '' CHECK (char_length(ideal_reply) <= 5000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'updated_in_knowledge', 'retested')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orb_agent_feedback_brand_created_idx
  ON cx_copilot.orb_agent_feedback (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orb_agent_feedback_brand_session_idx
  ON cx_copilot.orb_agent_feedback (brand_id, session_id, created_at DESC);

GRANT USAGE ON SCHEMA cx_copilot TO authenticated;
GRANT SELECT, INSERT, UPDATE ON cx_copilot.orb_agent_feedback TO authenticated;

ALTER TABLE cx_copilot.orb_agent_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orb_agent_feedback_read_brand_shared" ON cx_copilot.orb_agent_feedback;
CREATE POLICY "orb_agent_feedback_read_brand_shared"
  ON cx_copilot.orb_agent_feedback FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM cx_copilot.orb_profiles profile WHERE profile.id = auth.uid() AND profile.role = 'admin')
    OR EXISTS (SELECT 1 FROM cx_copilot.orb_brand_memberships membership WHERE membership.brand_id = orb_agent_feedback.brand_id AND membership.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "orb_agent_feedback_create_brand_shared" ON cx_copilot.orb_agent_feedback;
CREATE POLICY "orb_agent_feedback_create_brand_shared"
  ON cx_copilot.orb_agent_feedback FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid() AND (
      EXISTS (SELECT 1 FROM cx_copilot.orb_profiles profile WHERE profile.id = auth.uid() AND profile.role = 'admin')
      OR EXISTS (SELECT 1 FROM cx_copilot.orb_brand_memberships membership WHERE membership.brand_id = orb_agent_feedback.brand_id AND membership.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "orb_agent_feedback_update_admin" ON cx_copilot.orb_agent_feedback;
CREATE POLICY "orb_agent_feedback_update_admin"
  ON cx_copilot.orb_agent_feedback FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM cx_copilot.orb_profiles profile WHERE profile.id = auth.uid() AND profile.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM cx_copilot.orb_profiles profile WHERE profile.id = auth.uid() AND profile.role = 'admin'));
