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
    upper(substr(md5(auth.uid()::text || clock_timestamp()::text || random()::text), 1, 10)),
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

grant execute on function public.create_study_group(text, text) to authenticated;
