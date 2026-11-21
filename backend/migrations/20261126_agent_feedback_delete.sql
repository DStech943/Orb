-- Let the backend delete feedback items and issue reports on behalf of an admin.
-- The API route (DELETE /api/brands/{brand_id}/agent-feedback/{feedback_id}) checks the
-- caller is an admin and then deletes with the service role. Browser-facing roles still
-- have no DELETE. The report snapshot is removed through ON DELETE CASCADE.
GRANT DELETE ON cx_copilot.orb_agent_feedback TO service_role;

NOTIFY pgrst, 'reload schema';
