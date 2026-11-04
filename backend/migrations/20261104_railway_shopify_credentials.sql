-- Private credential store for Shopify connections created in Orb's Install
-- Shopify dialog. The API encrypts tokens with pgcrypto and a Railway-only
-- SHOPIFY_CREDENTIALS_ENCRYPTION_KEY; clients never receive the token.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS shopify_brand_credentials (
  org_id uuid NOT NULL,
  brand_key text NOT NULL,
  brand_name text NOT NULL,
  domain text NOT NULL,
  token_encrypted bytea NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, brand_key)
);
