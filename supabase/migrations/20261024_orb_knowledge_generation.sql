-- Apply this migration in the Supabase SQL editor or with the Supabase CLI.
-- The Python API uses the server-only database connection and owns writes.

create schema if not exists cx_copilot;

alter table cx_copilot.brands
  add column if not exists industry_category text;

alter table cx_copilot.brands
  drop constraint if exists brands_industry_category_check;

alter table cx_copilot.brands
  add constraint brands_industry_category_check check (
    industry_category is null or industry_category in (
      'fashion_apparel', 'footwear_accessories', 'beauty_personal_care',
      'health_supplements_nutrition', 'food_snacks', 'beverages',
      'fresh_perishable_foods', 'home_living_furniture',
      'kitchen_household_essentials', 'electronics_appliances',
      'baby_kids_toys', 'pets', 'sports_fitness_outdoors',
      'jewellery_watches_eyewear', 'lifestyle_gifting_specialty'
    )
  );

create table if not exists cx_copilot.orb_sop_templates (
  id uuid primary key default gen_random_uuid(),
  category_code text not null,
  title text not null,
  template_json jsonb not null,
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_code, title, version)
);

create table if not exists cx_copilot.orb_products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references cx_copilot.brands(id) on delete cascade,
  provider text not null check (provider in ('shopify_public', 'shopify_admin', 'website', 'manual')),
  external_id text not null,
  status text not null default 'active' check (status in ('active', 'archived', 'draft')),
  payload jsonb not null,
  source_url text,
  synced_at timestamptz not null default now(),
  qdrant_published_at timestamptz,
  qdrant_error text,
  unique (brand_id, provider, external_id)
);

create table if not exists cx_copilot.orb_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references cx_copilot.brands(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  requested_outputs text[] not null check (requested_outputs <@ array['sops', 'faqs', 'products']::text[]),
  source_job_ids uuid[] not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cx_copilot.orb_generated_content (
  id uuid primary key default gen_random_uuid(),
  generation_job_id uuid references cx_copilot.orb_generation_jobs(id) on delete set null,
  brand_id uuid not null references cx_copilot.brands(id) on delete cascade,
  kind text not null check (kind in ('sop', 'faq')),
  template_id uuid references cx_copilot.orb_sop_templates(id) on delete set null,
  template_version integer,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'rejected')),
  payload jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  qdrant_published_at timestamptz,
  qdrant_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orb_sop_templates_category_active_idx
  on cx_copilot.orb_sop_templates (category_code, active, version desc);
create index if not exists orb_products_brand_idx on cx_copilot.orb_products (brand_id, synced_at desc);
create index if not exists orb_generation_jobs_brand_idx on cx_copilot.orb_generation_jobs (brand_id, created_at desc);
create index if not exists orb_generated_content_brand_kind_idx
  on cx_copilot.orb_generated_content (brand_id, kind, status, created_at desc);

create or replace function cx_copilot.orb_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists orb_sop_templates_updated_at on cx_copilot.orb_sop_templates;
create trigger orb_sop_templates_updated_at before update on cx_copilot.orb_sop_templates
for each row execute procedure cx_copilot.orb_set_updated_at();

drop trigger if exists orb_generation_jobs_updated_at on cx_copilot.orb_generation_jobs;
create trigger orb_generation_jobs_updated_at before update on cx_copilot.orb_generation_jobs
for each row execute procedure cx_copilot.orb_set_updated_at();

drop trigger if exists orb_generated_content_updated_at on cx_copilot.orb_generated_content;
create trigger orb_generated_content_updated_at before update on cx_copilot.orb_generated_content
for each row execute procedure cx_copilot.orb_set_updated_at();

-- The crawler's public-schema jobs can be associated with a selected brand.
alter table public.crawl_jobs add column if not exists brand_id uuid;
create index if not exists crawl_jobs_brand_created_idx
  on public.crawl_jobs (brand_id, created_at desc) where brand_id is not null;
