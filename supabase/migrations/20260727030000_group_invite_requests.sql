create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);

create unique index if not exists group_invites_one_pending_recipient_idx
on public.group_invites (group_id, recipient_id)
where status = 'pending';

create index if not exists group_invites_recipient_status_idx
on public.group_invites (recipient_id, status, created_at desc);

create index if not exists group_invites_sender_status_idx
on public.group_invites (sender_id, status, created_at desc);

alter table public.group_invites enable row level security;

drop policy if exists "users can read own group invites"
on public.group_invites;
create policy "users can read own group invites"
on public.group_invites for select
to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid());

create or replace function public.invite_friend_to_group(
  target_group_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  target_group_name text;
  notify_recipient boolean;
begin
  if auth.uid() is null
    or target_user_id is null
    or target_user_id = auth.uid() then
    raise exception 'INVALID_GROUP_INVITE';
  end if;

  if not public.can_manage_group_members(target_group_id) then
    raise exception 'Only leaders and moderators can invite members';
  end if;

  if not exists (
    select 1 from public.friendships
    where user_id = auth.uid() and friend_id = target_user_id
  ) then
    raise exception 'Only friends can be invited';
  end if;

  if exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = target_user_id
      and status = 'active'
  ) then
    raise exception 'ALREADY_GROUP_MEMBER';
  end if;

  if exists (
    select 1
    from public.group_invites
    where group_id = target_group_id
      and recipient_id = target_user_id
      and status = 'pending'
  ) then
    return true;
  end if;

  insert into public.group_invites (group_id, sender_id, recipient_id)
  values (target_group_id, auth.uid(), target_user_id);

  select coalesce(nullif(trim(display_name), ''), username, 'A friend')
  into actor_name
  from public.profiles
  where id = auth.uid();

  select name
  into target_group_name
  from public.groups
  where id = target_group_id;

  select coalesce(other_notifications, true)
  into notify_recipient
  from public.user_notification_preferences
  where user_id = target_user_id;

  if coalesce(notify_recipient, true) then
    insert into public.app_notifications (
      user_id,
      actor_id,
      type,
      title,
      body,
      entity_id
    )
    values (
      target_user_id,
      auth.uid(),
      'other',
      'Group invitation',
      actor_name || ' invited you to ' || target_group_name || '.',
      target_group_id
    );
  end if;

  return true;
end;
$$;

create or replace function public.respond_to_group_invite(
  target_invite_id uuid,
  response text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invite public.group_invites%rowtype;
begin
  if auth.uid() is null
    or target_invite_id is null
    or response not in ('accepted', 'declined') then
    raise exception 'INVALID_GROUP_INVITE_RESPONSE';
  end if;

  select *
  into target_invite
  from public.group_invites
  where id = target_invite_id
    and recipient_id = auth.uid()
    and status = 'pending'
  for update;

  if target_invite.id is null then
    raise exception 'GROUP_INVITE_NOT_FOUND';
  end if;

  update public.group_invites
  set status = response, responded_at = now()
  where id = target_invite_id;

  if response = 'accepted' then
    insert into public.group_members (group_id, user_id, role, status)
    values (target_invite.group_id, auth.uid(), 'member', 'active')
    on conflict (group_id, user_id)
    do update set role = 'member', status = 'active', joined_at = now();
  end if;

  update public.app_notifications
  set read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and title = 'Group invitation'
    and entity_id = target_invite.group_id;

  return true;
end;
$$;

create or replace function public.cancel_group_invite(
  target_invite_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or target_invite_id is null then
    raise exception 'INVALID_GROUP_INVITE';
  end if;

  update public.group_invites
  set status = 'cancelled', responded_at = now()
  where id = target_invite_id
    and sender_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'GROUP_INVITE_NOT_FOUND';
  end if;

  return true;
end;
$$;

create or replace function public.list_group_invites()
returns table (
  invite_id uuid,
  direction text,
  group_id uuid,
  group_name text,
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  study_icon text,
  profile_color text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    invite.id,
    case
      when invite.recipient_id = auth.uid() then 'incoming'
      else 'outgoing'
    end,
    study_group.id,
    study_group.name,
    profile.id,
    profile.display_name,
    profile.username,
    profile.avatar_url,
    profile.study_icon,
    profile.profile_color,
    invite.created_at
  from public.group_invites invite
  join public.groups study_group on study_group.id = invite.group_id
  join public.profiles profile
    on profile.id = case
      when invite.recipient_id = auth.uid() then invite.sender_id
      else invite.recipient_id
    end
  where invite.status = 'pending'
    and (
      invite.sender_id = auth.uid()
      or invite.recipient_id = auth.uid()
    )
  order by invite.created_at desc;
$$;

grant select on public.group_invites to authenticated;
grant execute on function public.invite_friend_to_group(uuid, uuid)
to authenticated;
grant execute on function public.respond_to_group_invite(uuid, text)
to authenticated;
grant execute on function public.cancel_group_invite(uuid)
to authenticated;
grant execute on function public.list_group_invites()
to authenticated;

alter table public.group_invites replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_invites'
  ) then
    alter publication supabase_realtime add table public.group_invites;
  end if;
end;
$$;

notify pgrst, 'reload schema';
