-- Preserve an explicit audit timestamp for sender-authored Chatspace edits.
ALTER TABLE cx_copilot.orb_client_chat_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz NULL;
