-- Decouple app identities from Supabase Auth. MAC Auth is now the identity
-- provider; profiles.id remains the UUID used by auth.uid() and every RLS rule.
alter table public.profiles
drop constraint if exists profiles_id_fkey;

alter table public.profiles
alter column id set default gen_random_uuid();

alter table public.profiles
add column if not exists mac_user_id text,
add column if not exists mac_email text,
add column if not exists mac_roles text[] not null default '{}',
add column if not exists mac_team text,
add column if not exists mac_token_version integer,
add column if not exists mac_last_seen_at timestamptz;

create unique index if not exists profiles_mac_user_id_unique
on public.profiles (mac_user_id)
where mac_user_id is not null;

alter table public.profiles
drop constraint if exists profiles_mac_user_id_not_blank;

alter table public.profiles
add constraint profiles_mac_user_id_not_blank
check (mac_user_id is null or length(trim(mac_user_id)) > 0);

-- Central identity and access fields are written only by trusted server code.
-- The existing row-level policy limits updates to a user's own row, but without
-- column grants it would still let a browser rewrite mac_user_id, mac_roles, or
-- access_status. Keep browser access limited to ordinary profile fields.
drop policy if exists "users can insert own profile" on public.profiles;

revoke insert, select, update on table public.profiles from authenticated;

grant select (
  id,
  display_name,
  username,
  avatar_url,
  course,
  created_at,
  updated_at,
  access_status,
  access_granted_at,
  study_icon,
  profile_color
) on table public.profiles to authenticated;

grant update (
  display_name,
  username,
  avatar_url,
  course,
  study_icon,
  profile_color
) on table public.profiles to authenticated;

comment on column public.profiles.mac_user_id is
  'Stable canonical person ID issued by auth.monashcoding.com.';
