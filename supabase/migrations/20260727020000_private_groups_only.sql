-- Keep every study group invite-only until public discovery is reintroduced.

update public.groups
set visibility = 'invite_only'
where visibility <> 'invite_only';

alter table public.groups
  alter column visibility set default 'invite_only';

alter table public.groups
  drop constraint if exists groups_visibility_check;

alter table public.groups
  add constraint groups_visibility_check
  check (visibility = 'invite_only');

create or replace function public.enforce_private_study_group()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.visibility := 'invite_only';
  return new;
end;
$$;

drop trigger if exists enforce_private_study_group on public.groups;
create trigger enforce_private_study_group
before insert or update of visibility on public.groups
for each row execute function public.enforce_private_study_group();

drop policy if exists "members and signed in users can view groups"
on public.groups;
drop policy if exists "members can view groups"
on public.groups;

create policy "members can view groups"
on public.groups for select
to authenticated
using (
  public.is_group_member(id)
  or owner_id = auth.uid()
);

revoke execute on function public.join_public_study_group(uuid)
from public, authenticated;
revoke execute on function public.list_public_study_groups()
from public, authenticated;

notify pgrst, 'reload schema';
