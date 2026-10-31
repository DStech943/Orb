-- Visual Flows are structured editor documents. They intentionally live in
-- Supabase/Postgres, not Qdrant: creating or editing a diagram needs no
-- embeddings or semantic retrieval.

CREATE TABLE IF NOT EXISTS cx_copilot.orb_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES cx_copilot.brands(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL DEFAULT 'Untitled flow',
  lifecycle_stage text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(nodes) = 'array'),
  edges jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(edges) = 'array'),
  import_source jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orb_flows_brand_updated_idx
  ON cx_copilot.orb_flows (brand_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS orb_flows_brand_status_idx
  ON cx_copilot.orb_flows (brand_id, status);

CREATE INDEX IF NOT EXISTS orb_flows_creator_updated_idx
  ON cx_copilot.orb_flows (created_by, updated_at DESC);

ALTER TABLE cx_copilot.orb_flows
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- The API also sets updated_at on writes. Keeping this trigger local avoids
-- relying on a global set_updated_at() function that may not exist.
CREATE OR REPLACE FUNCTION cx_copilot.set_orb_flows_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orb_flows_set_updated_at ON cx_copilot.orb_flows;
CREATE TRIGGER orb_flows_set_updated_at
  BEFORE UPDATE ON cx_copilot.orb_flows
  FOR EACH ROW EXECUTE FUNCTION cx_copilot.set_orb_flows_updated_at();

-- The API forwards the signed-in user's Supabase JWT. Keep this table private
-- by default: each authenticated user can only read and change flows they
-- created. A future workspace-membership policy can replace these predicates
-- when flows need to be shared with other users in the same brand.
GRANT USAGE ON SCHEMA cx_copilot TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cx_copilot.orb_flows TO authenticated;

ALTER TABLE cx_copilot.orb_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orb_flows_select_own" ON cx_copilot.orb_flows;
CREATE POLICY "orb_flows_select_own"
  ON cx_copilot.orb_flows FOR SELECT TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "orb_flows_insert_own" ON cx_copilot.orb_flows;
CREATE POLICY "orb_flows_insert_own"
  ON cx_copilot.orb_flows FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "orb_flows_update_own" ON cx_copilot.orb_flows;
CREATE POLICY "orb_flows_update_own"
  ON cx_copilot.orb_flows FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "orb_flows_delete_own" ON cx_copilot.orb_flows;
CREATE POLICY "orb_flows_delete_own"
  ON cx_copilot.orb_flows FOR DELETE TO authenticated
  USING (created_by = auth.uid());
