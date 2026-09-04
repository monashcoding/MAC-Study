drop function if exists public.leave_study_group(uuid);

create function public.leave_study_group(target_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
  current_owner_id uuid;
  active_member_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select owner_id
  into current_owner_id
  from public.groups
  where id = target_group_id
  for update;

  if not found then
    raise exception 'Group not found';
  end if;

  select role
  into current_role
  from public.group_members
  where group_id = target_group_id
    and user_id = current_user_id
    and status = 'active';

  if current_role is null then
    raise exception 'Active membership not found';
  end if;

  select count(*)::integer
  into active_member_count
  from public.group_members
  where group_id = target_group_id
    and status = 'active';

  if current_role = 'owner' then
    if current_owner_id <> current_user_id then
      raise exception 'Group ownership is inconsistent';
    end if;

    if active_member_count > 1 then
      raise exception 'TRANSFER_OWNERSHIP_REQUIRED';
    end if;

    delete from public.groups
    where id = target_group_id
      and owner_id = current_user_id;

    if not found then
      raise exception 'Group could not be disbanded';
    end if;

    return 'disbanded';
  end if;

  update public.group_members
  set status = 'removed'
  where group_id = target_group_id
    and user_id = current_user_id
    and status = 'active';

  if not found then
    raise exception 'Active membership not found';
  end if;

  return 'left';
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
  current_user_id uuid := auth.uid();
  current_owner_id uuid;
begin
  if current_user_id is null or target_user_id = current_user_id then
    raise exception 'Choose another member as group leader';
  end if;

  select owner_id
  into current_owner_id
  from public.groups
  where id = target_group_id
  for update;

  if not found or current_owner_id <> current_user_id then
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
    and user_id = current_user_id
    and role = 'owner'
    and status = 'active';

  if not found then
    raise exception 'Only the group leader can transfer leadership';
  end if;

  update public.group_members
  set role = 'owner'
  where group_id = target_group_id
    and user_id = target_user_id
    and status = 'active'
    and role <> 'owner';

  if not found then
    raise exception 'The new leader must be an active group member';
  end if;

  update public.groups
  set owner_id = target_user_id
  where id = target_group_id
    and owner_id = current_user_id;

  if not found then
    raise exception 'Leadership could not be transferred';
  end if;

  return true;
end;
$$;

revoke all on function public.leave_study_group(uuid) from public;
revoke all on function public.transfer_group_leadership(uuid, uuid) from public;
grant execute on function public.leave_study_group(uuid) to authenticated;
grant execute on function public.transfer_group_leadership(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
