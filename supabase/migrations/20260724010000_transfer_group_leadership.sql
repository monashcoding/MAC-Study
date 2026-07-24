-- Group leaders can hand ownership to another active member.
-- The previous leader remains in the group as a moderator.

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

grant execute on function public.transfer_group_leadership(uuid, uuid)
to authenticated;
