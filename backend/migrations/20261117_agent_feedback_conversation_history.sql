-- Preserve the exact tester-chat context attached to an overall feedback note.
-- Reply-level feedback remains lightweight and stores an empty array.
ALTER TABLE cx_copilot.orb_agent_feedback
  ADD COLUMN IF NOT EXISTS conversation_history jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE cx_copilot.orb_agent_feedback
  DROP CONSTRAINT IF EXISTS orb_agent_feedback_conversation_history_array;

ALTER TABLE cx_copilot.orb_agent_feedback
  ADD CONSTRAINT orb_agent_feedback_conversation_history_array
  CHECK (jsonb_typeof(conversation_history) = 'array');
