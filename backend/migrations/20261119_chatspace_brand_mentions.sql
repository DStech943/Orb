-- Allow the Chatspace mention picker to read only the assignment roster for
-- a brand to which the signed-in person belongs.
CREATE OR REPLACE FUNCTION cx_copilot.is_brand_assignment_member(target_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = cx_copilot, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM cx_copilot.brand_assignments assignment
    WHERE assignment.brand_id = target_brand_id
      AND lower(assignment.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

GRANT EXECUTE ON FUNCTION cx_copilot.is_brand_assignment_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "brand_assignments_read_own_avatar" ON cx_copilot.brand_assignments;
DROP POLICY IF EXISTS "brand_assignments_read_brand_members" ON cx_copilot.brand_assignments;
CREATE POLICY "brand_assignments_read_brand_members"
  ON cx_copilot.brand_assignments FOR SELECT TO authenticated
  USING (
    cx_copilot.is_brand_assignment_member(brand_id)
    OR EXISTS (
      SELECT 1
      FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid()
        AND profile.role IN ('admin', 'agent', 'pod_lead')
    )
  );
