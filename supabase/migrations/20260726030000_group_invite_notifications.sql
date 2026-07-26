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
  group_name text;
  notify_recipient boolean;
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

  if exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = target_user_id
      and status = 'active'
  ) then
    return true;
  end if;

  insert into public.group_members (group_id, user_id, role, status)
  values (target_group_id, target_user_id, 'member', 'active')
  on conflict (group_id, user_id)
  do update set role = 'member', status = 'active', joined_at = now();

  select coalesce(nullif(trim(display_name), ''), username, 'A friend')
  into actor_name
  from public.profiles
  where id = auth.uid();

  select name
  into group_name
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
      actor_name || ' invited you to ' || group_name || '.',
      target_group_id
    );
  end if;

  return true;
end;
$$;

grant execute
on function public.invite_friend_to_group(uuid, uuid)
to authenticated;
