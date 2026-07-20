-- Group leaders own group-level settings. Moderators can manage regular members.
-- Group deletion intentionally remains unavailable.

drop policy if exists "members can view groups" on public.groups;
create policy "members and signed in users can view groups"
on public.groups for select
to authenticated
using (
  visibility = 'public'
  or public.is_group_member(id)
  or owner_id = auth.uid()
);

drop policy if exists "owners and admins can update groups" on public.groups;
create policy "owners can update groups"
on public.groups for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "group owners and admins can manage members" on public.group_members;

drop function if exists public.create_study_group(text, text);

create or replace function public.create_study_group(
  group_name text,
  group_icon text default 'users',
  group_visibility text default 'invite_only'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group_id uuid;
  normalized_name text := trim(group_name);
  normalized_visibility text := case
    when group_visibility = 'public' then 'public'
    else 'invite_only'
  end;
begin
  if auth.uid() is null or normalized_name = '' then
    raise exception 'A group name is required';
  end if;

  insert into public.groups (name, owner_id, invite_code, icon, visibility)
  values (
    normalized_name,
    auth.uid(),
    upper(substr(md5(auth.uid()::text || clock_timestamp()::text || random()::text), 1, 10)),
    'users',
    normalized_visibility
  )
  returning id into new_group_id;

  insert into public.group_members (group_id, user_id, role, status)
  values (new_group_id, auth.uid(), 'owner', 'active')
  on conflict (group_id, user_id)
  do update set role = 'owner', status = 'active';

  return new_group_id;
end;
$$;

create or replace function public.update_study_group(
  target_group_id uuid,
  group_name text,
  group_visibility text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := trim(group_name);
begin
  if normalized_name = '' then
    raise exception 'A group name is required';
  end if;

  update public.groups
  set name = normalized_name,
      visibility = case
        when group_visibility = 'public' then 'public'
        else 'invite_only'
      end,
      icon = 'users'
  where id = target_group_id
    and owner_id = auth.uid();

  if not found then
    raise exception 'Only the group leader can update group settings';
  end if;

  return true;
end;
$$;

create or replace function public.set_group_member_role(
  target_group_id uuid,
  target_user_id uuid,
  new_role text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_role not in ('admin', 'member') then
    raise exception 'Invalid group role';
  end if;

  if not exists (
    select 1 from public.groups
    where id = target_group_id and owner_id = auth.uid()
  ) then
    raise exception 'Only the group leader can manage moderators';
  end if;

  update public.group_members
  set role = new_role
  where group_id = target_group_id
    and user_id = target_user_id
    and role <> 'owner'
    and status = 'active';

  if not found then
    raise exception 'Member not found';
  end if;

  return true;
end;
$$;

create or replace function public.remove_group_member(
  target_group_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  manager_role text;
  target_role text;
begin
  select role into manager_role
  from public.group_members
  where group_id = target_group_id
    and user_id = auth.uid()
    and role in ('owner', 'admin')
    and status = 'active';

  select role into target_role
  from public.group_members
  where group_id = target_group_id
    and user_id = target_user_id
    and status = 'active';

  if manager_role is null or target_role is null or target_role = 'owner' then
    raise exception 'Member cannot be removed';
  end if;

  if manager_role = 'admin' and target_role <> 'member' then
    raise exception 'Moderators can only remove regular members';
  end if;

  update public.group_members
  set status = 'removed'
  where group_id = target_group_id and user_id = target_user_id;

  return true;
end;
$$;

create or replace function public.leave_study_group(target_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and role = 'owner'
      and status = 'active'
  ) then
    raise exception 'The group leader cannot leave the group';
  end if;

  update public.group_members
  set status = 'removed'
  where group_id = target_group_id
    and user_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Active membership not found';
  end if;

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
  if not public.can_manage_group_members(target_group_id) then
    raise exception 'Only leaders and moderators can invite members';
  end if;

  if not exists (
    select 1 from public.friendships
    where user_id = auth.uid() and friend_id = target_user_id
  ) then
    raise exception 'Only friends can be invited';
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (target_group_id, target_user_id, 'member', 'active')
  on conflict (group_id, user_id)
  do update set role = 'member', status = 'active', joined_at = now();

  return true;
end;
$$;

create or replace function public.join_public_study_group(target_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.groups
    where id = target_group_id and visibility = 'public'
  ) then
    raise exception 'Public group not found';
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (target_group_id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id)
  do update set role = 'member', status = 'active', joined_at = now();

  return true;
end;
$$;

create or replace function public.list_public_study_groups()
returns table (group_id uuid, group_name text, member_count bigint)
language sql
security definer
set search_path = public
as $$
  select groups.id, groups.name, count(group_members.user_id)
  from public.groups
  left join public.group_members
    on group_members.group_id = groups.id
    and group_members.status = 'active'
  where groups.visibility = 'public'
  group by groups.id, groups.name, groups.created_at
  order by groups.created_at desc;
$$;

alter table public.group_chat_messages
  add constraint group_chat_message_body_length
  check (char_length(trim(body)) between 1 and 2000) not valid;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_chat_messages'
  ) then
    alter publication supabase_realtime add table public.group_chat_messages;
  end if;
end;
$$;

grant execute on function public.create_study_group(text, text, text) to authenticated;
grant execute on function public.update_study_group(uuid, text, text) to authenticated;
grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.leave_study_group(uuid) to authenticated;
grant execute on function public.invite_friend_to_group(uuid, uuid) to authenticated;
grant execute on function public.join_public_study_group(uuid) to authenticated;
grant execute on function public.list_public_study_groups() to authenticated;
