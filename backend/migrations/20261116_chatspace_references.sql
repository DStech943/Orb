-- Rich, clickable references attached to Chatspace messages.
ALTER TABLE cx_copilot.orb_client_chat_messages
  ADD COLUMN IF NOT EXISTS message_references jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE cx_copilot.orb_client_chat_messages
  DROP CONSTRAINT IF EXISTS orb_client_chat_messages_content_check;

ALTER TABLE cx_copilot.orb_client_chat_messages
  DROP CONSTRAINT IF EXISTS orb_client_chat_messages_content_or_reference;

ALTER TABLE cx_copilot.orb_client_chat_messagesQ
  ADD CONSTRAINT orb_client_chat_messages_content_or_reference
  CHECK (char_length(trim(content)) > 0 OR jsonb_array_length(message_references) > 0);
