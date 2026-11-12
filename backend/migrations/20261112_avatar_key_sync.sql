-- Allow Orb to resolve only the signed-in user's avatar_key from the existing
-- team/member tables. The browser never receives another user's key directly.

GRANT USAGE ON SCHEMA cx_copilot TO authenticated;
GRANT SELECT ON cx_copilot.admins, cx_copilot.brand_assignments TO authenticated;

ALTER TABLE cx_copilot.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE cx_copilot.brand_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_own_avatar" ON cx_copilot.admins;
CREATE POLICY "admins_read_own_avatar"
  ON cx_copilot.admins FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

DROP POLICY IF EXISTS "brand_assignments_read_own_avatar" ON cx_copilot.brand_assignments;
CREATE POLICY "brand_assignments_read_own_avatar"
  ON cx_copilot.brand_assignments FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
