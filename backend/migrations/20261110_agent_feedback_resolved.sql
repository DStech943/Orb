-- Give the admin feedback queue a final, explicit terminal state.
ALTER TABLE cx_copilot.orb_agent_feedback
  DROP CONSTRAINT IF EXISTS orb_agent_feedback_status_check;

ALTER TABLE cx_copilot.orb_agent_feedback
  ADD CONSTRAINT orb_agent_feedback_status_check
  CHECK (status IN ('open', 'updated_in_knowledge', 'retested', 'resolved'));
