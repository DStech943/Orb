-- Category-level SOP reference templates used during generation.
-- Apply this to the same Supabase database that contains cx_copilot.brands.

CREATE TABLE IF NOT EXISTS cx_copilot.orb_sop_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code text NOT NULL,
  title text NOT NULL,
  template_json jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_code, title, version)
);

CREATE INDEX IF NOT EXISTS orb_sop_templates_active_category_idx
  ON cx_copilot.orb_sop_templates (category_code, active, title, version DESC);

COMMENT ON TABLE cx_copilot.orb_sop_templates IS
  'Reusable category-specific SOP reference templates for Orb generation.';
