-- Run this against Orb's local crawler Postgres database, not Supabase.
alter table crawl_jobs add column if not exists brand_id uuid;

create index if not exists crawl_jobs_brand_created_idx
  on crawl_jobs (brand_id, created_at desc)
  where brand_id is not null;
