-- Any active member can invite an existing friend to their group.
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

  if not exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and status = 'active'
  ) then
    raise exception 'Only active group members can invite people';
  end if;

  if not exists (
    select 1
    from public.friendships
    where user_id = auth.uid()
      and friend_id = target_user_id
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

-- Require both the private group id and invite code for bearer-link joins.
create or replace function public.join_group_by_link(
  target_group_id uuid,
  group_invite_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_group_id uuid;
begin
  if auth.uid() is null or nullif(trim(group_invite_code), '') is null then
    raise exception 'INVALID_GROUP_JOIN_LINK';
  end if;

  select id
  into matched_group_id
  from public.groups
  where id = target_group_id
    and upper(invite_code) = upper(trim(group_invite_code))
  for update;

  if matched_group_id is null then
    raise exception 'INVALID_GROUP_JOIN_LINK';
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (matched_group_id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id)
  do update set
    role = case
      when group_members.status = 'active' then group_members.role
      else 'member'
    end,
    status = 'active',
    joined_at = case
      when group_members.status = 'active' then group_members.joined_at
      else now()
    end
  where group_members.status <> 'banned';

  if not found then
    raise exception 'GROUP_JOIN_BLOCKED';
  end if;

  update public.group_invites
  set status = 'accepted', responded_at = now()
  where group_id = matched_group_id
    and recipient_id = auth.uid()
    and status = 'pending';

  update public.app_notifications
  set read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and title = 'Group invitation'
    and entity_id = matched_group_id;

  return matched_group_id;
end;
$$;

revoke execute on function public.join_group_by_code(text)
from public, authenticated;
revoke all on function public.join_group_by_link(uuid, text) from public;
revoke all on function public.invite_friend_to_group(uuid, uuid) from public;
grant execute on function public.join_group_by_link(uuid, text) to authenticated;
grant execute on function public.invite_friend_to_group(uuid, uuid)
to authenticated;

notify pgrst, 'reload schema';
