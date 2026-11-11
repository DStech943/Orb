-- Client-to-Team Chatspace Messages Table
-- Stores real-time communications between clients and the Orb operations/engineering team.

CREATE TABLE IF NOT EXISTS cx_copilot.orb_client_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES cx_copilot.brands(id) ON DELETE CASCADE,
  brand_name text NOT NULL,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name text NOT NULL,
  sender_role text NOT NULL DEFAULT 'client' CHECK (sender_role IN ('client', 'team', 'admin')),
  sender_avatar text,
  content text NOT NULL CHECK (char_length(content) > 0),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'read', 'failed')),
  reply_to_id uuid REFERENCES cx_copilot.orb_client_chat_messages(id) ON DELETE SET NULL,
  reply_to_snippet text,
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  update_proposal jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orb_client_chat_brand_name_idx
  ON cx_copilot.orb_client_chat_messages (brand_name, created_at ASC);

GRANT USAGE ON SCHEMA cx_copilot TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cx_copilot.orb_client_chat_messages TO authenticated;

ALTER TABLE cx_copilot.orb_client_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orb_client_chat_read_brand" ON cx_copilot.orb_client_chat_messages;
CREATE POLICY "orb_client_chat_read_brand"
  ON cx_copilot.orb_client_chat_messages FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "orb_client_chat_insert_brand" ON cx_copilot.orb_client_chat_messages;
CREATE POLICY "orb_client_chat_insert_brand"
  ON cx_copilot.orb_client_chat_messages FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "orb_client_chat_update_brand" ON cx_copilot.orb_client_chat_messages;
CREATE POLICY "orb_client_chat_update_brand"
  ON cx_copilot.orb_client_chat_messages FOR UPDATE TO authenticated
  USING (true);

