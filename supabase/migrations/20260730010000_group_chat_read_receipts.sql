create table public.group_chat_read_receipts (
  group_id uuid not null,
  user_id uuid not null,
  last_read_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  foreign key (group_id, user_id)
    references public.group_members(group_id, user_id)
    on delete cascade
);

alter table public.group_chat_read_receipts enable row level security;

create policy "group members can read group chat receipts"
on public.group_chat_read_receipts for select
to authenticated
using (public.is_group_member(group_id));

create or replace function public.mark_group_chat_read(
  target_group_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_message_at timestamptz;
begin
  if auth.uid() is null or not public.is_group_member(target_group_id) then
    raise exception 'You are not an active member of this group';
  end if;

  select max(messages.created_at)
  into latest_message_at
  from public.group_chat_messages messages
  where messages.group_id = target_group_id
    and messages.deleted_at is null;

  if latest_message_at is null then
    return null;
  end if;

  insert into public.group_chat_read_receipts (
    group_id,
    user_id,
    last_read_at,
    updated_at
  )
  values (
    target_group_id,
    auth.uid(),
    latest_message_at,
    now()
  )
  on conflict (group_id, user_id)
  do update set
    last_read_at = greatest(
      public.group_chat_read_receipts.last_read_at,
      excluded.last_read_at
    ),
    updated_at = now()
  returning last_read_at into latest_message_at;

  return latest_message_at;
end;
$$;

revoke all on function public.mark_group_chat_read(uuid) from public;
grant execute on function public.mark_group_chat_read(uuid) to authenticated;
grant select on table public.group_chat_read_receipts to authenticated;

alter table public.group_chat_read_receipts replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_chat_read_receipts'
  ) then
    alter publication supabase_realtime
    add table public.group_chat_read_receipts;
  end if;
end;
$$;
