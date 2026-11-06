-- Brand-scoped operational intake. Client submissions are classified by Orb
-- and retained as an auditable queue before any downstream system is changed.

CREATE TABLE IF NOT EXISTS cx_copilot.orb_operational_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES cx_copilot.brands(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 8 AND 10000),
  classification text NOT NULL CHECK (classification IN ('cs_update', 'product_update')),
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'ready_for_review', 'applied', 'dismissed')),
  action_plan jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(action_plan) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orb_operational_updates_brand_created_idx
  ON cx_copilot.orb_operational_updates (brand_id, created_at DESC);

GRANT USAGE ON SCHEMA cx_copilot TO authenticated;
GRANT SELECT, INSERT ON cx_copilot.orb_operational_updates TO authenticated;

ALTER TABLE cx_copilot.orb_operational_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orb_operational_updates_read_brand_shared" ON cx_copilot.orb_operational_updates;
CREATE POLICY "orb_operational_updates_read_brand_shared"
  ON cx_copilot.orb_operational_updates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_profiles profile
      WHERE profile.id = auth.uid() AND profile.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM cx_copilot.orb_brand_memberships membership
      WHERE membership.brand_id = orb_operational_updates.brand_id
        AND membership.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "orb_operational_updates_create_brand_shared" ON cx_copilot.orb_operational_updates;
CREATE POLICY "orb_operational_updates_create_brand_shared"
  ON cx_copilot.orb_operational_updates FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM cx_copilot.orb_profiles profile
        WHERE profile.id = auth.uid() AND profile.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM cx_copilot.orb_brand_memberships membership
        WHERE membership.brand_id = orb_operational_updates.brand_id
          AND membership.user_id = auth.uid()
      )
    )
  );
