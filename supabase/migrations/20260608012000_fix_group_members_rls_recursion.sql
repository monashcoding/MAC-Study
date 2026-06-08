create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and status = 'active'
  );
end;
$$;

create or replace function public.can_manage_group_members(target_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and status = 'active'
  );
end;
$$;

drop policy if exists "members can view group memberships" on public.group_members;
create policy "members can view group memberships"
on public.group_members for select
to authenticated
using (user_id = auth.uid() or public.is_group_member(group_id));

drop policy if exists "group owners and admins can manage members" on public.group_members;
create policy "group owners and admins can manage members"
on public.group_members for all
to authenticated
using (public.can_manage_group_members(group_id))
with check (public.can_manage_group_members(group_id));

drop policy if exists "owners and admins can update groups" on public.groups;
create policy "owners and admins can update groups"
on public.groups for update
to authenticated
using (public.can_manage_group_members(id))
with check (public.can_manage_group_members(id));

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.can_manage_group_members(uuid) to authenticated;
