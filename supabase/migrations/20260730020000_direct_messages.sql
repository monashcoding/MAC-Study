-- Private, text-only messaging between accepted friends.

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_messages_distinct_users
    check (sender_id <> recipient_id),
  constraint direct_messages_body_length
    check (char_length(trim(body)) between 1 and 2000),
  constraint direct_messages_read_after_create
    check (read_at is null or read_at >= created_at)
);

create index if not exists direct_messages_sender_recipient_created_idx
on public.direct_messages (sender_id, recipient_id, created_at desc, id desc);

create index if not exists direct_messages_recipient_sender_created_idx
on public.direct_messages (recipient_id, sender_id, created_at desc, id desc);

create index if not exists direct_messages_recipient_unread_idx
on public.direct_messages (recipient_id, sender_id, created_at desc)
where read_at is null;

alter table public.direct_messages enable row level security;

drop policy if exists "friends can read their direct messages"
on public.direct_messages;
create policy "friends can read their direct messages"
on public.direct_messages for select
to authenticated
using (
  (
    sender_id = auth.uid()
    and public.is_friend(recipient_id)
  )
  or
  (
    recipient_id = auth.uid()
    and public.is_friend(sender_id)
  )
);

drop policy if exists "friends can send direct messages"
on public.direct_messages;
create policy "friends can send direct messages"
on public.direct_messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.is_friend(recipient_id)
);

drop policy if exists "recipients can mark direct messages read"
on public.direct_messages;
create policy "recipients can mark direct messages read"
on public.direct_messages for update
to authenticated
using (
  recipient_id = auth.uid()
  and public.is_friend(sender_id)
)
with check (
  recipient_id = auth.uid()
  and public.is_friend(sender_id)
);

create or replace function public.list_direct_conversations(
  result_limit integer default 60
)
returns table (
  friend_id uuid,
  display_name text,
  username text,
  profile_color text,
  latest_message_id uuid,
  latest_body text,
  latest_sender_id uuid,
  latest_created_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    profile.id as friend_id,
    profile.display_name,
    profile.username,
    profile.profile_color,
    latest.id as latest_message_id,
    latest.body as latest_body,
    latest.sender_id as latest_sender_id,
    latest.created_at as latest_created_at,
    coalesce(unread.unread_count, 0)::bigint as unread_count
  from public.friendships friendship
  join public.profiles profile
    on profile.id = friendship.friend_id
  left join lateral (
    select
      message.id,
      message.body,
      message.sender_id,
      message.created_at
    from public.direct_messages message
    where (
      message.sender_id = auth.uid()
      and message.recipient_id = profile.id
    ) or (
      message.sender_id = profile.id
      and message.recipient_id = auth.uid()
    )
    order by message.created_at desc, message.id desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*) as unread_count
    from public.direct_messages message
    where message.sender_id = profile.id
      and message.recipient_id = auth.uid()
      and message.read_at is null
  ) unread on true
  where friendship.user_id = auth.uid()
  order by latest.created_at desc nulls last, profile.display_name, profile.username
  limit least(greatest(coalesce(result_limit, 60), 1), 100);
$$;

create or replace function public.list_direct_messages(
  target_friend_id uuid,
  before_created_at timestamptz default null,
  before_message_id uuid default null,
  result_limit integer default 41
)
returns table (
  message_id uuid,
  sender_id uuid,
  recipient_id uuid,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null or not public.is_friend(target_friend_id) then
    raise exception 'DIRECT_MESSAGE_NOT_ALLOWED';
  end if;

  return query
  select
    message.id,
    message.sender_id,
    message.recipient_id,
    message.body,
    message.created_at,
    message.read_at
  from public.direct_messages message
  where (
    (
      message.sender_id = auth.uid()
      and message.recipient_id = target_friend_id
    )
    or
    (
      message.sender_id = target_friend_id
      and message.recipient_id = auth.uid()
    )
  )
  and (
    before_created_at is null
    or message.created_at < before_created_at
    or (
      message.created_at = before_created_at
      and before_message_id is not null
      and message.id < before_message_id
    )
  )
  order by message.created_at desc, message.id desc
  limit least(greatest(coalesce(result_limit, 41), 1), 100);
end;
$$;

grant select, insert on table public.direct_messages to authenticated;
grant update (read_at) on table public.direct_messages to authenticated;
grant select, insert, update, delete on table public.direct_messages
to service_role;

revoke all on function public.list_direct_conversations(integer) from public;
revoke all on function public.list_direct_messages(
  uuid,
  timestamptz,
  uuid,
  integer
) from public;

grant execute on function public.list_direct_conversations(integer)
to authenticated;
grant execute on function public.list_direct_messages(
  uuid,
  timestamptz,
  uuid,
  integer
) to authenticated;

alter table public.direct_messages replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end;
$$;

comment on table public.direct_messages is
'Private, text-only messages visible only while both participants are friends.';

notify pgrst, 'reload schema';
