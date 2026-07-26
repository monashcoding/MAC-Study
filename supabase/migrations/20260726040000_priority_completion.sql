-- Restores group moderation RPCs for projects that were created before the
-- leadership migration, and adds the chat moderation primitives used by the UI.

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
    select 1
    from public.groups
    where id = target_group_id
      and owner_id = auth.uid()
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
  select role
  into manager_role
  from public.group_members
  where group_id = target_group_id
    and user_id = auth.uid()
    and role in ('owner', 'admin')
    and status = 'active';

  select role
  into target_role
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
  where group_id = target_group_id
    and user_id = target_user_id;

  return true;
end;
$$;

create or replace function public.transfer_group_leadership(
  target_group_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_owner_id uuid := auth.uid();
begin
  if current_owner_id is null or target_user_id = current_owner_id then
    raise exception 'Choose another member as group leader';
  end if;

  if not exists (
    select 1
    from public.groups
    where id = target_group_id
      and owner_id = current_owner_id
  ) then
    raise exception 'Only the group leader can transfer leadership';
  end if;

  if not exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = target_user_id
      and status = 'active'
      and role <> 'owner'
  ) then
    raise exception 'The new leader must be an active group member';
  end if;

  update public.group_members
  set role = 'admin'
  where group_id = target_group_id
    and user_id = current_owner_id
    and role = 'owner'
    and status = 'active';

  update public.group_members
  set role = 'owner'
  where group_id = target_group_id
    and user_id = target_user_id
    and status = 'active';

  update public.groups
  set owner_id = target_user_id
  where id = target_group_id
    and owner_id = current_owner_id;

  return true;
end;
$$;

create table if not exists public.group_chat_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.group_chat_messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);

alter table public.group_chat_message_reports enable row level security;

drop policy if exists "members can report group messages"
on public.group_chat_message_reports;

create policy "members can report group messages"
on public.group_chat_message_reports for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and exists (
    select 1
    from public.group_chat_messages as message
    where message.id = message_id
      and public.is_group_member(message.group_id)
  )
);

create or replace function public.delete_group_chat_message(
  target_message_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  message_group_id uuid;
  message_user_id uuid;
begin
  select group_id, user_id
  into message_group_id, message_user_id
  from public.group_chat_messages
  where id = target_message_id
    and deleted_at is null;

  if message_group_id is null then
    raise exception 'Message not found';
  end if;

  if message_user_id <> auth.uid()
    and not exists (
      select 1
      from public.group_members
      where group_id = message_group_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
        and status = 'active'
    )
  then
    raise exception 'You cannot delete this message';
  end if;

  update public.group_chat_messages
  set deleted_at = now()
  where id = target_message_id;

  return true;
end;
$$;

create or replace function public.report_group_chat_message(
  target_message_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  message_group_id uuid;
  message_user_id uuid;
begin
  select group_id, user_id
  into message_group_id, message_user_id
  from public.group_chat_messages
  where id = target_message_id
    and deleted_at is null;

  if message_group_id is null
    or not public.is_group_member(message_group_id)
    or message_user_id = auth.uid()
  then
    raise exception 'Message cannot be reported';
  end if;

  insert into public.group_chat_message_reports (message_id, reporter_id)
  values (target_message_id, auth.uid())
  on conflict (message_id, reporter_id) do nothing;

  return true;
end;
$$;

grant select, insert on table public.group_chat_message_reports to authenticated;
grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_group_leadership(uuid, uuid) to authenticated;
grant execute on function public.delete_group_chat_message(uuid) to authenticated;
grant execute on function public.report_group_chat_message(uuid) to authenticated;

notify pgrst, 'reload schema';
