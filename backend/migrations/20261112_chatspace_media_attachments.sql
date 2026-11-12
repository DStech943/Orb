-- Migration: Add media attachments and Supabase storage bucket for Chatspace
-- Bucket Name: orb_chatspace_attachments

-- 1. Add media column to orb_client_chat_messages
ALTER TABLE cx_copilot.orb_client_chat_messages
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Create the storage bucket in Supabase storage schema (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'orb_chatspace_attachments',
  'orb_chatspace_attachments',
  true,
  20971520, -- 20MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf', 'application/json', 'text/plain', 'text/csv']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520;

-- 3. Storage bucket access policies
DROP POLICY IF EXISTS "Public chat attachment read access" ON storage.objects;
CREATE POLICY "Public chat attachment read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'orb_chatspace_attachments');

DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'orb_chatspace_attachments');

DROP POLICY IF EXISTS "Anon users can upload chat attachments" ON storage.objects;
CREATE POLICY "Anon users can upload chat attachments"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'orb_chatspace_attachments');

