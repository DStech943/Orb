-- Application data for authenticated users.
-- Do not store passwords or Supabase Auth internals in this table.

create schema if not exists cx_copilot;

create table if not exists cx_copilot.orb_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cx_copilot.orb_profiles enable row level security;

-- The client may only read and edit its own non-auth profile data.
grant usage on schema cx_copilot to authenticated;
revoke all on table cx_copilot.orb_profiles from anon, authenticated;
grant select on table cx_copilot.orb_profiles to authenticated;
grant update (full_name, avatar_url) on table cx_copilot.orb_profiles to authenticated;

drop policy if exists "orb_profiles_select_own" on cx_copilot.orb_profiles;
create policy "orb_profiles_select_own"
on cx_copilot.orb_profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "orb_profiles_update_own" on cx_copilot.orb_profiles;
create policy "orb_profiles_update_own"
on cx_copilot.orb_profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Runs with the migration owner's privileges so a new Auth user can receive
-- a public profile row in the same database transaction.
create or replace function cx_copilot.orb_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into cx_copilot.orb_profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, cx_copilot.orb_profiles.full_name),
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists orb_on_auth_user_created on auth.users;
create trigger orb_on_auth_user_created
after insert on auth.users
for each row execute procedure cx_copilot.orb_handle_new_user();

create or replace function cx_copilot.orb_set_profile_updated_at()
returns trigger
language plpgsql
security invoker set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orb_profiles_set_updated_at on cx_copilot.orb_profiles;
create trigger orb_profiles_set_updated_at
before update on cx_copilot.orb_profiles
for each row execute procedure cx_copilot.orb_set_profile_updated_at();

-- Populate profiles for any Auth users that existed before this migration.
insert into cx_copilot.orb_profiles (id, email, full_name)
select
  id,
  email,
  raw_user_meta_data ->> 'full_name'
from auth.users
on conflict (id) do nothing;
