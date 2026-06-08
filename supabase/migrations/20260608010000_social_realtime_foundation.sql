alter table public.profiles
add column if not exists study_icon text not null default 'flame-desk'
  check (study_icon in ('flame-desk', 'clock-desk', 'lamp-desk', 'spark-desk')),
add column if not exists profile_color text not null default '#FFE330';

alter table public.groups
add column if not exists icon text not null default 'users'
  check (icon in ('users', 'target', 'flame', 'book', 'trophy'));

create table if not exists public.friendships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists friendships_friend_idx
on public.friendships (friend_id, user_id);

alter table public.friendships enable row level security;

drop policy if exists "users can view own friendships" on public.friendships;
create policy "users can view own friendships"
on public.friendships for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can remove own friendships" on public.friendships;
create policy "users can remove own friendships"
on public.friendships for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.is_friend(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships
    where user_id = auth.uid()
      and friend_id = target_user_id
  );
$$;

create or replace function public.create_study_group(
  group_name text,
  group_icon text default 'users'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group_id uuid;
  normalized_name text := trim(group_name);
  normalized_icon text := coalesce(nullif(trim(group_icon), ''), 'users');
begin
  if auth.uid() is null or normalized_name = '' then
    raise exception 'Not allowed';
  end if;

  if normalized_icon not in ('users', 'target', 'flame', 'book', 'trophy') then
    normalized_icon := 'users';
  end if;

  insert into public.groups (name, owner_id, invite_code, icon)
  values (
    normalized_name,
    auth.uid(),
    upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 10)),
    normalized_icon
  )
  returning id into new_group_id;

  insert into public.group_members (group_id, user_id, role, status)
  values (new_group_id, auth.uid(), 'owner', 'active')
  on conflict (group_id, user_id)
  do update set role = 'owner', status = 'active';

  return new_group_id;
end;
$$;

create or replace function public.join_group_by_code(group_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not allowed';
  end if;

  select id
  into target_group_id
  from public.groups
  where upper(invite_code) = upper(trim(group_invite_code));

  if target_group_id is null then
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (target_group_id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id)
  do update set status = 'active', joined_at = coalesce(group_members.joined_at, now());

  return target_group_id;
end;
$$;

create or replace function public.add_friend(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or target_user_id is null or target_user_id = auth.uid() then
    return false;
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    return false;
  end if;

  insert into public.friendships (user_id, friend_id)
  values (auth.uid(), target_user_id)
  on conflict do nothing;

  insert into public.friendships (user_id, friend_id)
  values (target_user_id, auth.uid())
  on conflict do nothing;

  return true;
end;
$$;

create or replace function public.remove_friend(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or target_user_id is null then
    return false;
  end if;

  delete from public.friendships
  where (user_id = auth.uid() and friend_id = target_user_id)
     or (user_id = target_user_id and friend_id = auth.uid());

  return true;
end;
$$;

create or replace function public.invite_friend_to_group(
  target_group_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or target_group_id is null or target_user_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and status = 'active'
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.friendships
    where user_id = auth.uid()
      and friend_id = target_user_id
  ) then
    return false;
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (target_group_id, target_user_id, 'member', 'active')
  on conflict (group_id, user_id)
  do update set status = 'active';

  return true;
end;
$$;

drop policy if exists "friends can read friend sessions" on public.study_sessions;
create policy "friends can read friend sessions"
on public.study_sessions for select
to authenticated
using (public.is_friend(user_id));

drop policy if exists "group peers can read member sessions" on public.study_sessions;
create policy "group peers can read member sessions"
on public.study_sessions for select
to authenticated
using (
  exists (
    select 1
    from public.group_members as viewer
    join public.group_members as session_owner
      on session_owner.group_id = viewer.group_id
    where viewer.user_id = auth.uid()
      and viewer.status = 'active'
      and session_owner.user_id = study_sessions.user_id
      and session_owner.status = 'active'
  )
);

grant select, insert, delete on table public.friendships to authenticated;
grant execute on function public.is_friend(uuid) to authenticated;
grant execute on function public.create_study_group(text, text) to authenticated;
grant execute on function public.join_group_by_code(text) to authenticated;
grant execute on function public.add_friend(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.invite_friend_to_group(uuid, uuid) to authenticated;

alter table public.profiles replica identity full;
alter table public.groups replica identity full;
alter table public.group_members replica identity full;
alter table public.friendships replica identity full;
alter table public.study_sessions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table public.groups;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'study_sessions'
  ) then
    alter publication supabase_realtime add table public.study_sessions;
  end if;
end $$;
