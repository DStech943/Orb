-- Apply in the Supabase SQL editor after the existing Orb migrations.
-- Raw onboarding is retained for review; only an approved compact prompt is
-- included in future SOP and FAQ generation.

CREATE TABLE IF NOT EXISTS cx_copilot.orb_brand_voice_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES cx_copilot.brands(id) ON DELETE CASCADE,
  created_by uuid,
  kind text NOT NULL CHECK (kind IN ('paste', 'csv')),
  label text NOT NULL,
  raw_content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orb_brand_voice_sources_brand_created_idx
  ON cx_copilot.orb_brand_voice_sources (brand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cx_copilot.orb_brand_voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES cx_copilot.brands(id) ON DELETE CASCADE,
  created_by uuid,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  profile jsonb NOT NULL,
  drafting_prompt text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orb_brand_voice_profiles_brand_created_idx
  ON cx_copilot.orb_brand_voice_profiles (brand_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS orb_brand_voice_one_approved_idx
  ON cx_copilot.orb_brand_voice_profiles (brand_id)
  WHERE status = 'approved';

-- `updated_at` is maintained explicitly by Orb's update queries. This avoids
-- depending on a project-wide set_updated_at() trigger function.
