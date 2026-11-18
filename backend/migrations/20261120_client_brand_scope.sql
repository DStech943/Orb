-- Restrict direct browser reads of brands to the active user's assignments.
-- The Orb API also applies this same filter in GET /api/brands.
CREATE OR REPLACE FUNCTION cx_copilot.is_workspace_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = cx_copilot, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM cx_copilot.orb_profiles profile
    WHERE profile.id = auth.uid()
      AND profile.role IN ('admin', 'agent', 'pod_lead')
  ) OR EXISTS (
    SELECT 1
    FROM cx_copilot.brand_assignments assignment
    WHERE lower(assignment.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND assignment.role IN ('admin', 'agent', 'pod_lead')
  );
$$;

GRANT EXECUTE ON FUNCTION cx_copilot.is_workspace_staff() TO authenticated;

ALTER TABLE cx_copilot.brands ENABLE ROW LEVEL SECURITY;

-- Remove previous SELECT/ALL policies so an older permissive policy cannot
-- bypass the assignment rule. Brand writes stay server-side/service-role.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'cx_copilot'
      AND tablename = 'brands'
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON cx_copilot.brands', policy_row.policyname);
  END LOOP;
END $$;

CREATE POLICY "brands_read_assigned_or_staff"
  ON cx_copilot.brands FOR SELECT TO authenticated
  USING (
    cx_copilot.is_workspace_staff()
    OR cx_copilot.is_brand_assignment_member(id)
  );
