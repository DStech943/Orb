-- LOCAL DEVELOPMENT ONLY
--
-- This enables the REST-only source-to-draft pipeline while AUTH_DISABLED=true.
-- The Supabase anon key is public, so do not apply this policy set to a
-- production multi-tenant project. Use authenticated RLS or a server-only
-- credential there instead.

GRANT USAGE ON SCHEMA cx_copilot TO anon;

-- Required by source-to-draft: create/update its job, save drafts, and upsert
-- scraped products. No DELETE privilege is granted.
GRANT SELECT, INSERT, UPDATE ON TABLE cx_copilot.orb_generation_jobs TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE cx_copilot.orb_generated_content TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE cx_copilot.orb_products TO anon;

ALTER TABLE cx_copilot.orb_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cx_copilot.orb_generated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE cx_copilot.orb_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_local_generation_jobs" ON cx_copilot.orb_generation_jobs;
CREATE POLICY "anon_local_generation_jobs"
  ON cx_copilot.orb_generation_jobs
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_local_generated_content" ON cx_copilot.orb_generated_content;
CREATE POLICY "anon_local_generated_content"
  ON cx_copilot.orb_generated_content
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_local_products" ON cx_copilot.orb_products;
CREATE POLICY "anon_local_products"
  ON cx_copilot.orb_products
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
