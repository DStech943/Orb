-- Brand-scoped collaboration for visual flows. A flow is visible to every
-- member of its brand, rather than only to the user who created it.

CREATE TABLE IF NOT EXISTS cx_copilot.orb_brand_memberships (
  brand_id uuid NOT NULL REFERENCES cx_copilot.brands(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'manager')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, user_id)
);

CREATE INDEX IF NOT EXISTS orb_brand_memberships_user_idx
  ON cx_copilot.orb_brand_memberships (user_id, brand_id);

-- Preserve access for the people who created existing flows. Other people are
-- deliberately granted access per brand instead of receiving every brand.
INSERT INTO cx_copilot.orb_brand_memberships (brand_id, user_id, role)
SELECT DISTINCT flow.brand_id, flow.created_by, 'manager'
FROM cx_copilot.orb_flows AS flow
JOIN auth.users AS user_account ON user_account.id = flow.created_by
ON CONFLICT (brand_id, user_id) DO NOTHING;

ALTER TABLE cx_copilot.orb_brand_memberships ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA cx_copilot TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cx_copilot.orb_brand_memberships TO authenticated;

DROP POLICY IF EXISTS "orb_brand_memberships_select_own_or_admin" ON cx_copilot.orb_brand_memberships;
DROP POLICY IF EXISTS "orb_brand_memberships_manage_admin" ON cx_copilot.orb_brand_memberships;

CREATE POLICY "orb_brand_memberships_select_own_or_admin"
  ON cx_copilot.orb_brand_memberships FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid() AND profile.role = 'admin'
    )
  );

CREATE POLICY "orb_brand_memberships_manage_admin"
  ON cx_copilot.orb_brand_memberships FOR ALL TO authenticated
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

DROP POLICY IF EXISTS "orb_flows_select_own" ON cx_copilot.orb_flows;
DROP POLICY IF EXISTS "orb_flows_insert_own" ON cx_copilot.orb_flows;
DROP POLICY IF EXISTS "orb_flows_update_own" ON cx_copilot.orb_flows;
DROP POLICY IF EXISTS "orb_flows_delete_own" ON cx_copilot.orb_flows;
DROP POLICY IF EXISTS "orb_flows_select_brand_shared" ON cx_copilot.orb_flows;
DROP POLICY IF EXISTS "orb_flows_insert_admin" ON cx_copilot.orb_flows;
DROP POLICY IF EXISTS "orb_flows_update_admin" ON cx_copilot.orb_flows;
DROP POLICY IF EXISTS "orb_flows_delete_admin" ON cx_copilot.orb_flows;

CREATE POLICY "orb_flows_select_brand_shared"
  ON cx_copilot.orb_flows FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_brand_memberships membership
      WHERE membership.brand_id = orb_flows.brand_id
        AND membership.user_id = auth.uid()
    )
  );

CREATE POLICY "orb_flows_insert_admin"
  ON cx_copilot.orb_flows FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM cx_copilot.orb_brand_memberships membership
      WHERE membership.brand_id = orb_flows.brand_id
        AND membership.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid() AND profile.role = 'admin'
    )
  );

CREATE POLICY "orb_flows_update_admin"
  ON cx_copilot.orb_flows FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_brand_memberships membership
      WHERE membership.brand_id = orb_flows.brand_id
        AND membership.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid() AND profile.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_brand_memberships membership
      WHERE membership.brand_id = orb_flows.brand_id
        AND membership.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid() AND profile.role = 'admin'
    )
  );

CREATE POLICY "orb_flows_delete_admin"
  ON cx_copilot.orb_flows FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_brand_memberships membership
      WHERE membership.brand_id = orb_flows.brand_id
        AND membership.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid() AND profile.role = 'admin'
    )
  );
