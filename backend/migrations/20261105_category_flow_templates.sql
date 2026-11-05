-- Global, category-specific visual-flow templates. These are the canonical
-- defaults; a brand gets a private copy only after somebody saves a change.

CREATE TABLE IF NOT EXISTS cx_copilot.orb_flow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code text NOT NULL CHECK (category_code IN (
    'fashion_apparel', 'footwear_accessories', 'beauty_personal_care',
    'health_supplements_nutrition', 'food_snacks', 'beverages',
    'fresh_perishable_foods', 'home_living_furniture',
    'kitchen_household_essentials', 'electronics_appliances',
    'baby_kids_toys', 'pets', 'sports_fitness_outdoors',
    'jewellery_watches_eyewear', 'lifestyle_gifting_specialty'
  )),
  title text NOT NULL,
  lifecycle_stage text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(nodes) = 'array'),
  edges jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(edges) = 'array'),
  import_source jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orb_flow_templates_category_status_idx
  ON cx_copilot.orb_flow_templates (category_code, status, updated_at DESC);

ALTER TABLE cx_copilot.orb_flows
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES cx_copilot.orb_flow_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_version integer;

CREATE UNIQUE INDEX IF NOT EXISTS orb_flows_one_template_copy_per_brand_idx
  ON cx_copilot.orb_flows (brand_id, template_id)
  WHERE template_id IS NOT NULL;

CREATE OR REPLACE FUNCTION cx_copilot.set_orb_flow_templates_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orb_flow_templates_set_updated_at ON cx_copilot.orb_flow_templates;
CREATE TRIGGER orb_flow_templates_set_updated_at
  BEFORE UPDATE ON cx_copilot.orb_flow_templates
  FOR EACH ROW EXECUTE FUNCTION cx_copilot.set_orb_flow_templates_updated_at();

GRANT USAGE ON SCHEMA cx_copilot TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cx_copilot.orb_flow_templates TO authenticated;

ALTER TABLE cx_copilot.orb_flow_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orb_flow_templates_read_published" ON cx_copilot.orb_flow_templates;
CREATE POLICY "orb_flow_templates_read_published"
  ON cx_copilot.orb_flow_templates FOR SELECT TO authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "orb_flow_templates_admin_all" ON cx_copilot.orb_flow_templates;
CREATE POLICY "orb_flow_templates_admin_all"
  ON cx_copilot.orb_flow_templates FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM cx_copilot.orb_profiles profile
    WHERE profile.id = auth.uid() AND profile.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM cx_copilot.orb_profiles profile
    WHERE profile.id = auth.uid() AND profile.role = 'admin'
  ));
