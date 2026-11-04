-- Existing installations may already have applied the brand-membership
-- migration. Admins must be able to audit every brand's flows without needing
-- an individual membership record.

DROP POLICY IF EXISTS "orb_flows_select_brand_shared" ON cx_copilot.orb_flows;

CREATE POLICY "orb_flows_select_brand_shared"
  ON cx_copilot.orb_flows FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid() AND profile.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM cx_copilot.orb_brand_memberships membership
      WHERE membership.brand_id = orb_flows.brand_id
        AND membership.user_id = auth.uid()
    )
  );
