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

-- Historical chat rows predate avatar_key persistence. Re-link them using the
-- existing people records, preferring a brand-specific assignment over an
-- otherwise matching admin. This is idempotent and repairs URLs created by an
-- earlier client build that assumed the wrong storage bucket.
UPDATE cx_copilot.orb_client_chat_messages AS message
SET sender_avatar = assignment.avatar_key
FROM (
  SELECT DISTINCT ON (brand_id, lower(btrim(name))) brand_id, lower(btrim(name)) AS name_key, avatar_key
  FROM cx_copilot.brand_assignments
  WHERE avatar_key IS NOT NULL AND btrim(avatar_key) <> '' AND name IS NOT NULL AND btrim(name) <> ''
  ORDER BY brand_id, lower(btrim(name)), is_online DESC, created_at DESC
) AS assignment
WHERE message.brand_id = assignment.brand_id
  AND lower(btrim(message.sender_name)) = assignment.name_key;

UPDATE cx_copilot.orb_client_chat_messages AS message
SET sender_avatar = admin.avatar_key
FROM (
  SELECT DISTINCT ON (lower(btrim(name))) lower(btrim(name)) AS name_key, avatar_key
  FROM cx_copilot.admins
  WHERE avatar_key IS NOT NULL AND btrim(avatar_key) <> '' AND name IS NOT NULL AND btrim(name) <> ''
  ORDER BY lower(btrim(name)), is_online DESC, created_at DESC
) AS admin
WHERE (message.sender_avatar IS NULL OR btrim(message.sender_avatar) = '')
  AND lower(btrim(message.sender_name)) = admin.name_key;
