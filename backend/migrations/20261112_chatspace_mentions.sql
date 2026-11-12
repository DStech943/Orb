-- Migration: Add mentions column to orb_client_chat_messages
-- Supports @ mentions tagging people, teams, and @all

ALTER TABLE cx_copilot.orb_client_chat_messages
  ADD COLUMN IF NOT EXISTS mentions jsonb DEFAULT '[]'::jsonb;

