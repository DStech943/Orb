-- Feedback notes that a tester sends to the team on Slack also save a conversation
-- snapshot. Migration 20261117 only let the snapshot be attached to rows with
-- kind = 'issue_report'; a note is kind = 'feedback' with Slack delivery, so that extra
-- condition is dropped. Every other guard stays: only the person who filed the row can
-- attach its snapshot, only for that row's brand, and the snapshot is still insert-only
-- and immutable.
--
-- Safe to run more than once. Run it after 20261117_agent_feedback_reports.sql.

DROP POLICY IF EXISTS "orb_agent_feedback_snapshots_insert" ON cx_copilot.orb_agent_feedback_snapshots;
CREATE POLICY "orb_agent_feedback_snapshots_insert"
  ON cx_copilot.orb_agent_feedback_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_agent_feedback feedback
      WHERE feedback.id = orb_agent_feedback_snapshots.feedback_id
        AND feedback.brand_id = orb_agent_feedback_snapshots.brand_id
        AND feedback.submitted_by = auth.uid()
    )
  );
