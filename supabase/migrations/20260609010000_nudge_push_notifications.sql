alter table public.nudges
alter column group_id drop not null;

drop policy if exists "members can create nudges" on public.nudges;
drop policy if exists "members and friends can create nudges" on public.nudges;

create policy "members and friends can create nudges"
on public.nudges for insert
to authenticated
with check (
  sender_id = auth.uid()
  and sender_id <> recipient_id
  and (
    (
      group_id is not null
      and public.is_group_member(group_id)
      and exists (
        select 1
        from public.group_members as recipient_member
        where recipient_member.group_id = nudges.group_id
          and recipient_member.user_id = nudges.recipient_id
          and recipient_member.status = 'active'
      )
    )
    or (
      group_id is null
      and public.is_friend(recipient_id)
    )
  )
);

create or replace function public.send_nudge(
  target_user_id uuid,
  target_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  nudge_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to send nudges.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot nudge yourself.';
  end if;

  if target_group_id is not null then
    if not exists (
      select 1
      from public.group_members
      where group_id = target_group_id
        and user_id = auth.uid()
        and status = 'active'
    ) then
      raise exception 'You are not in this group.';
    end if;

    if not exists (
      select 1
      from public.group_members
      where group_id = target_group_id
        and user_id = target_user_id
        and status = 'active'
    ) then
      raise exception 'This person is not in this group.';
    end if;
  elsif not public.is_friend(target_user_id) then
    raise exception 'You can only nudge friends.';
  end if;

  select coalesce(
    nullif(display_name, ''),
    nullif(username, ''),
    'Someone'
  )
  into sender_name
  from public.profiles
  where id = auth.uid();

  insert into public.nudges (
    group_id,
    sender_id,
    recipient_id,
    message
  )
  values (
    target_group_id,
    auth.uid(),
    target_user_id,
    sender_name || ' woke you up!'
  )
  returning id into nudge_id;

  return nudge_id;
end;
$$;

grant execute on function public.send_nudge(uuid, uuid) to authenticated;

alter table public.nudges replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'nudges'
  ) then
    alter publication supabase_realtime add table public.nudges;
  end if;
end $$;
