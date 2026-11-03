-- Server-only bridge from Orb's backend to two named Shopify credentials.
-- Run once in the Supabase SQL Editor as a project owner/admin.
-- Do NOT expose the vault schema through PostgREST.

CREATE OR REPLACE FUNCTION cx_copilot.orb_shopify_vault_credentials(p_brand_name text)
RETURNS TABLE (shopify_domain text, shopify_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, vault
AS $$
DECLARE
  brand_key text;
  domain_secret_name text;
  token_secret_name text;
BEGIN
  -- Only a server request signed with Supabase's elevated key can call this.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'server credentials are required';
  END IF;

  brand_key := trim(both '_' FROM regexp_replace(upper(coalesce(p_brand_name, '')), '[^A-Z0-9]+', '_', 'g'));
  IF brand_key = '' THEN
    RAISE EXCEPTION 'brand name is required';
  END IF;

  domain_secret_name := 'SHOPIFY_' || brand_key || '_DOMAIN';
  token_secret_name := 'SHOPIFY_' || brand_key || '_TOKEN';

  RETURN QUERY
  SELECT
    max(v.decrypted_secret) FILTER (WHERE v.name = domain_secret_name)::text,
    max(v.decrypted_secret) FILTER (WHERE v.name = token_secret_name)::text
  FROM vault.decrypted_secrets AS v
  WHERE v.name IN (domain_secret_name, token_secret_name);
END;
$$;

REVOKE ALL ON FUNCTION cx_copilot.orb_shopify_vault_credentials(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cx_copilot.orb_shopify_vault_credentials(text) FROM anon, authenticated;
GRANT USAGE ON SCHEMA cx_copilot TO service_role;
GRANT EXECUTE ON FUNCTION cx_copilot.orb_shopify_vault_credentials(text) TO service_role;
