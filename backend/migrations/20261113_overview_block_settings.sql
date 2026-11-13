-- Per-brand Overview layout. Only Orb admins can change the layout; brand
-- members can read it so everyone sees the same operational dashboard.
CREATE TABLE IF NOT EXISTS cx_copilot.orb_overview_block_settings (
  brand_id uuid PRIMARY KEY REFERENCES cx_copilot.brands(id) ON DELETE CASCADE,
  blocks jsonb NOT NULL DEFAULT '["flows", "out_of_stock", "near_out_of_stock", "operations"]'::jsonb
    CHECK (jsonb_typeof(blocks) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cx_copilot.orb_overview_block_settings
  ADD COLUMN IF NOT EXISTS tracked_variant_metafield jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS daily_slack_report jsonb NOT NULL DEFAULT '{"enabled":false,"hour":9,"timezone":"Asia/Kolkata"}'::jsonb;

GRANT USAGE ON SCHEMA cx_copilot TO authenticated;
GRANT SELECT, INSERT, UPDATE ON cx_copilot.orb_overview_block_settings TO authenticated;
ALTER TABLE cx_copilot.orb_overview_block_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orb_overview_blocks_read_brand" ON cx_copilot.orb_overview_block_settings;
CREATE POLICY "orb_overview_blocks_read_brand" ON cx_copilot.orb_overview_block_settings FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM cx_copilot.orb_profiles profile WHERE profile.id = auth.uid() AND profile.role = 'admin')
  OR EXISTS (SELECT 1 FROM cx_copilot.orb_brand_memberships membership WHERE membership.brand_id = orb_overview_block_settings.brand_id AND membership.user_id = auth.uid())
);

DROP POLICY IF EXISTS "orb_overview_blocks_manage_admin" ON cx_copilot.orb_overview_block_settings;
CREATE POLICY "orb_overview_blocks_manage_admin" ON cx_copilot.orb_overview_block_settings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM cx_copilot.orb_profiles profile WHERE profile.id = auth.uid() AND profile.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM cx_copilot.orb_profiles profile WHERE profile.id = auth.uid() AND profile.role = 'admin'));
