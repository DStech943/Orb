-- Admins manage flows for every brand. Membership controls non-admin reads;
-- it must not block an administrator from correcting, saving, or deleting a
-- shared flow created by another account.

DROP POLICY IF EXISTS "orb_flows_insert_admin" ON cx_copilot.orb_flows;
DROP POLICY IF EXISTS "orb_flows_update_admin" ON cx_copilot.orb_flows;
DROP POLICY IF EXISTS "orb_flows_delete_admin" ON cx_copilot.orb_flows;

CREATE POLICY "orb_flows_insert_admin"
  ON cx_copilot.orb_flows FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid() AND profile.role = 'admin'
    )
  );

CREATE POLICY "orb_flows_update_admin"
  ON cx_copilot.orb_flows FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid() AND profile.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid() AND profile.role = 'admin'
    )
  );

CREATE POLICY "orb_flows_delete_admin"
  ON cx_copilot.orb_flows FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid() AND profile.role = 'admin'
    )
  );
