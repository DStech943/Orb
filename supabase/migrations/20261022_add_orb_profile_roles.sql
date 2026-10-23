alter table cx_copilot.orb_profiles
add column if not exists role text not null default 'client'
check (role in ('admin', 'client'));

update cx_copilot.orb_profiles
set role = 'admin'
where id in (
  select id from cx_copilot.orb_profiles order by created_at asc limit 1
);
