create table if not exists public.super_nudge_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create unique index if not exists super_nudge_one_open_pair_idx
on public.super_nudge_requests (
  least(sender_id, recipient_id),
  greatest(sender_id, recipient_id)
)
where status in ('pending', 'active');

create index if not exists super_nudge_recipient_status_idx
on public.super_nudge_requests (recipient_id, status, created_at desc);

create index if not exists super_nudge_sender_status_idx
on public.super_nudge_requests (sender_id, status, created_at desc);

alter table public.super_nudge_requests enable row level security;

drop policy if exists "participants can read super nudge requests"
on public.super_nudge_requests;
create policy "participants can read super nudge requests"
on public.super_nudge_requests for select
to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid());

revoke insert, update, delete
on table public.super_nudge_requests
from authenticated;

grant select
on table public.super_nudge_requests
to authenticated, service_role;

create or replace function public.request_super_nudge(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_request public.super_nudge_requests%rowtype;
  new_request_id uuid;
  actor_name text;
  notify_recipient boolean;
begin
  if current_user_id is null
    or target_user_id is null
    or target_user_id = current_user_id then
    raise exception 'INVALID_SUPER_NUDGE_REQUEST';
  end if;

  if not public.is_friend(target_user_id) then
    raise exception 'SUPER_NUDGE_FRIENDS_ONLY';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(least(current_user_id, target_user_id)::text),
    hashtext(greatest(current_user_id, target_user_id)::text)
  );

  select *
  into existing_request
  from public.super_nudge_requests
  where status in ('pending', 'active')
    and (
      (sender_id = current_user_id and recipient_id = target_user_id)
      or
      (sender_id = target_user_id and recipient_id = current_user_id)
    )
  order by created_at desc
  limit 1;

  if existing_request.id is not null then
    if existing_request.status = 'active'
      or existing_request.sender_id = current_user_id then
      return existing_request.id;
    end if;

    raise exception 'INCOMING_SUPER_NUDGE_EXISTS';
  end if;

  insert into public.super_nudge_requests (sender_id, recipient_id)
  values (current_user_id, target_user_id)
  returning id into new_request_id;

  select coalesce(
    nullif(trim(display_name), ''),
    nullif(trim(username), ''),
    'A friend'
  )
  into actor_name
  from public.profiles
  where id = current_user_id;

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
      current_user_id,
      'other',
      actor_name,
      'wants to turn on Super Nudge with you.',
      new_request_id
    );
  end if;

  return new_request_id;
end;
$$;

create or replace function public.respond_super_nudge(
  request_id uuid,
  response_action text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  request_row public.super_nudge_requests%rowtype;
  actor_name text;
  notify_sender boolean;
begin
  if current_user_id is null then
    raise exception 'SIGN_IN_REQUIRED';
  end if;

  select *
  into request_row
  from public.super_nudge_requests
  where id = request_id
  for update;

  if request_row.id is null then
    raise exception 'SUPER_NUDGE_REQUEST_NOT_FOUND';
  end if;

  if response_action = 'accept' then
    if request_row.recipient_id <> current_user_id
      or request_row.status <> 'pending' then
      raise exception 'SUPER_NUDGE_ACTION_NOT_ALLOWED';
    end if;

    update public.super_nudge_requests
    set status = 'active', updated_at = clock_timestamp()
    where id = request_id;

    select coalesce(
      nullif(trim(display_name), ''),
      nullif(trim(username), ''),
      'Your friend'
    )
    into actor_name
    from public.profiles
    where id = current_user_id;

    select coalesce(other_notifications, true)
    into notify_sender
    from public.user_notification_preferences
    where user_id = request_row.sender_id;

    if coalesce(notify_sender, true) then
      insert into public.app_notifications (
        user_id,
        actor_id,
        type,
        title,
        body,
        entity_id
      )
      values (
        request_row.sender_id,
        current_user_id,
        'other',
        actor_name,
        'accepted Super Nudge.',
        request_id
      );
    end if;
  elsif response_action = 'decline' then
    if request_row.recipient_id <> current_user_id
      or request_row.status <> 'pending' then
      raise exception 'SUPER_NUDGE_ACTION_NOT_ALLOWED';
    end if;

    update public.super_nudge_requests
    set status = 'declined', updated_at = clock_timestamp()
    where id = request_id;
  elsif response_action = 'cancel' then
    if request_row.sender_id <> current_user_id
      or request_row.status <> 'pending' then
      raise exception 'SUPER_NUDGE_ACTION_NOT_ALLOWED';
    end if;

    update public.super_nudge_requests
    set status = 'cancelled', updated_at = clock_timestamp()
    where id = request_id;
  elsif response_action = 'disable' then
    if current_user_id not in (request_row.sender_id, request_row.recipient_id)
      or request_row.status <> 'active' then
      raise exception 'SUPER_NUDGE_ACTION_NOT_ALLOWED';
    end if;

    update public.super_nudge_requests
    set status = 'cancelled', updated_at = clock_timestamp()
    where id = request_id;
  else
    raise exception 'INVALID_SUPER_NUDGE_ACTION';
  end if;

  return true;
end;
$$;

grant execute
on function public.request_super_nudge(uuid)
to authenticated, service_role;

grant execute
on function public.respond_super_nudge(uuid, text)
to authenticated, service_role;

create or replace function public.remove_friend(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or target_user_id is null then
    return false;
  end if;

  update public.super_nudge_requests
  set status = 'cancelled', updated_at = clock_timestamp()
  where status in ('pending', 'active')
    and (
      (sender_id = auth.uid() and recipient_id = target_user_id)
      or
      (sender_id = target_user_id and recipient_id = auth.uid())
    );

  delete from public.friendships
  where (user_id = auth.uid() and friend_id = target_user_id)
     or (user_id = target_user_id and friend_id = auth.uid());

  return true;
end;
$$;

grant execute
on function public.remove_friend(uuid)
to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'super_nudge_requests'
  ) then
    alter publication supabase_realtime
    add table public.super_nudge_requests;
  end if;
end;
$$;

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
  current_sender_id uuid := auth.uid();
  daily_nudge_count integer;
  oldest_recent_nudge_at timestamptz;
  recent_nudge_count integer;
  recent_nudge_limit integer := 1;
  retry_after_seconds integer;
  sender_name text;
  nudge_id uuid;
begin
  if current_sender_id is null then
    raise exception 'Sign in to send nudges.';
  end if;

  if target_user_id = current_sender_id then
    raise exception 'You cannot nudge yourself.';
  end if;

  if exists (
    select 1
    from public.study_sessions
    where user_id = target_user_id
      and ended_at is null
      and deleted_at is null
      and status = 'active'
  ) then
    raise exception 'RECIPIENT_STUDYING';
  end if;

  if target_group_id is not null then
    if not exists (
      select 1
      from public.group_members
      where group_id = target_group_id
        and user_id = current_sender_id
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
  else
    select case when exists (
      select 1
      from public.super_nudge_requests
      where status = 'active'
        and (
          (sender_id = current_sender_id and recipient_id = target_user_id)
          or
          (sender_id = target_user_id and recipient_id = current_sender_id)
        )
    ) then 10 else 1 end
    into recent_nudge_limit;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(current_sender_id::text),
    hashtext(target_user_id::text)
  );

  select
    (
      count(*) filter (
        where created_at > clock_timestamp() - interval '1 minute'
      )
    )::integer,
    min(created_at) filter (
      where created_at > clock_timestamp() - interval '1 minute'
    ),
    count(*)::integer
  into recent_nudge_count, oldest_recent_nudge_at, daily_nudge_count
  from public.nudges
  where sender_id = current_sender_id
    and recipient_id = target_user_id
    and created_at > clock_timestamp() - interval '24 hours';

  if recent_nudge_count >= recent_nudge_limit then
    retry_after_seconds := greatest(
      1,
      ceil(
        extract(
          epoch from (
            oldest_recent_nudge_at + interval '1 minute' - clock_timestamp()
          )
        )
      )::integer
    );

    if recent_nudge_limit > 1 then
      raise exception 'SUPER_NUDGE_RATE_LIMIT:%', retry_after_seconds;
    end if;

    raise exception 'NUDGE_RATE_LIMIT:%', retry_after_seconds;
  end if;

  if daily_nudge_count >= 250 then
    raise exception 'NUDGE_DAILY_LIMIT';
  end if;

  select coalesce(
    nullif(trim(display_name), ''),
    nullif(trim(username), ''),
    'Someone'
  )
  into sender_name
  from public.profiles
  where id = current_sender_id;

  insert into public.nudges (
    group_id,
    sender_id,
    recipient_id,
    message
  )
  values (
    target_group_id,
    current_sender_id,
    target_user_id,
    sender_name || ' woke you up!'
  )
  returning id into nudge_id;

  return nudge_id;
end;
$$;

grant execute
on function public.send_nudge(uuid, uuid)
to authenticated, service_role;

notify pgrst, 'reload schema';

comment on table public.super_nudge_requests is
'Mutual opt-in state for the higher-frequency Super Nudge mode.';

comment on function public.send_nudge(uuid, uuid) is
'Creates one direct nudge per minute, or up to ten per minute for an active Super Nudge pair, and blocks nudges while the recipient is studying.';
