-- Align per-brand assignments and Chatspace messages with the workspace roles.
-- `poc` was the previous client-side role and is now represented as `client`.
ALTER TABLE cx_copilot.brand_assignments
  DROP CONSTRAINT IF EXISTS brand_assignments_role_check;

UPDATE cx_copilot.brand_assignments
SET role = 'client'
WHERE role = 'poc';

ALTER TABLE cx_copilot.brand_assignments
  ADD CONSTRAINT brand_assignments_role_check
  CHECK (role IN ('admin', 'agent', 'pod_lead', 'client'));

-- Preserve existing internal accounts under the new role vocabulary.
UPDATE cx_copilot.orb_profiles
SET role = 'agent'
WHERE role = 'team';

ALTER TABLE cx_copilot.orb_client_chat_messages
  DROP CONSTRAINT IF EXISTS orb_client_chat_messages_sender_role_check;

UPDATE cx_copilot.orb_client_chat_messages
SET sender_role = 'agent'
WHERE sender_role = 'team';

ALTER TABLE cx_copilot.orb_client_chat_messages
  ADD CONSTRAINT orb_client_chat_messages_sender_role_check
  CHECK (sender_role IN ('admin', 'agent', 'pod_lead', 'client'));

-- Existing operational policies were authored when `admin` was the only
-- internal role. Expand those role checks in-place so agent and pod_lead
-- receive the same access without weakening client restrictions.
DO $$
DECLARE
  policy_row record;
  next_qual text;
  next_check text;
  staff_check constant text := 'profile.role IN (''admin''::text, ''agent''::text, ''pod_lead''::text)';
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'cx_copilot'
      AND (
        qual LIKE '%profile.role = ''admin''::text%'
        OR with_check LIKE '%profile.role = ''admin''::text%'
      )
  LOOP
    next_qual := replace(policy_row.qual, 'profile.role = ''admin''::text', staff_check);
    next_check := replace(policy_row.with_check, 'profile.role = ''admin''::text', staff_check);

    IF policy_row.qual IS NOT NULL AND policy_row.with_check IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',
        policy_row.policyname, policy_row.schemaname, policy_row.tablename, next_qual, next_check
      );
    ELSIF policy_row.qual IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (%s)',
        policy_row.policyname, policy_row.schemaname, policy_row.tablename, next_qual
      );
    ELSIF policy_row.with_check IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
        policy_row.policyname, policy_row.schemaname, policy_row.tablename, next_check
      );
    END IF;
  END LOOP;
END $$;
