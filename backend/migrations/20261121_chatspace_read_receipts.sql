-- Per-person read positions for Instagram-style Chatspace receipts.
CREATE TABLE IF NOT EXISTS cx_copilot.orb_client_chat_read_receipts (
  brand_id uuid NULL REFERENCES cx_copilot.brands(id) ON DELETE CASCADE,
  brand_name text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reader_name text NOT NULL DEFAULT '',
  reader_avatar text NULL,
  last_read_message_id uuid NULL REFERENCES cx_copilot.orb_client_chat_messages(id) ON DELETE SET NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_name, user_id)
);

CREATE INDEX IF NOT EXISTS orb_client_chat_receipts_brand_read_idx
  ON cx_copilot.orb_client_chat_read_receipts (brand_name, read_at DESC);

GRANT SELECT, INSERT, UPDATE ON cx_copilot.orb_client_chat_read_receipts TO authenticated;
ALTER TABLE cx_copilot.orb_client_chat_read_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chatspace_receipts_read_brand" ON cx_copilot.orb_client_chat_read_receipts;
CREATE POLICY "chatspace_receipts_read_brand"
  ON cx_copilot.orb_client_chat_read_receipts FOR SELECT TO authenticated
  USING (
    cx_copilot.is_workspace_staff()
    OR cx_copilot.is_brand_assignment_member(brand_id)
  );

DROP POLICY IF EXISTS "chatspace_receipts_write_own" ON cx_copilot.orb_client_chat_read_receipts;
CREATE POLICY "chatspace_receipts_write_own"
  ON cx_copilot.orb_client_chat_read_receipts FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      cx_copilot.is_workspace_staff()
      OR cx_copilot.is_brand_assignment_member(brand_id)
    )
  );
