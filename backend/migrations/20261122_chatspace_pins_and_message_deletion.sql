-- Expiring, room-wide Chatspace pins. A pin is active only until its expiry.
ALTER TABLE cx_copilot.orb_client_chat_messages
  ADD COLUMN IF NOT EXISTS pinned_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pinned_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_by_name text NULL;

CREATE INDEX IF NOT EXISTS orb_client_chat_messages_active_pins_idx
  ON cx_copilot.orb_client_chat_messages (brand_name, pinned_until DESC)
  WHERE pinned_until IS NOT NULL;

-- A sender may permanently remove only their own message. The cascades and
-- SET NULL foreign keys already on replies/read receipts clean up references.
DROP POLICY IF EXISTS "orb_client_chat_delete_own" ON cx_copilot.orb_client_chat_messages;
CREATE POLICY "orb_client_chat_delete_own"
  ON cx_copilot.orb_client_chat_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());
