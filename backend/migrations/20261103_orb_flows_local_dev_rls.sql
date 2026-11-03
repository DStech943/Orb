-- Local development only: the API runs with AUTH_DISABLED=true and therefore
-- reaches PostgREST with the project's publishable/anon key. Limit that role
-- to the synthetic user used by app.auth.current_user; do not use this policy
-- in production, where requests must carry a real Supabase user JWT.

GRANT USAGE ON SCHEMA cx_copilot TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON cx_copilot.orb_flows TO anon;

DROP POLICY IF EXISTS "orb_flows_local_dev_owner" ON cx_copilot.orb_flows;
CREATE POLICY "orb_flows_local_dev_owner"
  ON cx_copilot.orb_flows
  FOR ALL
  TO anon
  USING (created_by = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (created_by = '00000000-0000-0000-0000-000000000001'::uuid);
