create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);

create unique index if not exists friend_requests_one_pending_pair_idx
on public.friend_requests (
  least(sender_id, recipient_id),
  greatest(sender_id, recipient_id)
)
where status = 'pending';

create index if not exists friend_requests_recipient_status_idx
on public.friend_requests (recipient_id, status, created_at desc);

create index if not exists friend_requests_sender_status_idx
on public.friend_requests (sender_id, status, created_at desc);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  friend_notifications boolean not null default true,
  nudge_notifications boolean not null default true,
  other_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_notification_preferences (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (
    type in ('friend_request', 'friend_accepted', 'other')
  ),
  title text not null,
  body text not null,
  entity_id uuid,
  read_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_created_idx
on public.app_notifications (user_id, created_at desc);

alter table public.friend_requests enable row level security;
alter table public.user_notification_preferences enable row level security;
alter table public.app_notifications enable row level security;

drop policy if exists "users can read own friend requests"
on public.friend_requests;
create policy "users can read own friend requests"
on public.friend_requests for select
to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "users manage own notification preferences"
on public.user_notification_preferences;
create policy "users manage own notification preferences"
on public.user_notification_preferences for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users can read own app notifications"
on public.app_notifications;
create policy "users can read own app notifications"
on public.app_notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can update own app notifications"
on public.app_notifications;
create policy "users can update own app notifications"
on public.app_notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.create_default_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_create_notification_preferences
on public.profiles;
create trigger profiles_create_notification_preferences
after insert on public.profiles
for each row execute function public.create_default_notification_preferences();

create or replace function public.send_friend_request(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_request public.friend_requests%rowtype;
  new_request_id uuid;
  actor_name text;
  notify_recipient boolean;
begin
  if current_user_id is null
    or target_user_id is null
    or target_user_id = current_user_id then
    raise exception 'INVALID_FRIEND_REQUEST';
  end if;

  if not exists (
    select 1 from public.profiles where id = target_user_id
  ) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.friendships
    where user_id = current_user_id
      and friend_id = target_user_id
  ) then
    raise exception 'ALREADY_FRIENDS';
  end if;

  select *
  into existing_request
  from public.friend_requests
  where status = 'pending'
    and (
      (sender_id = current_user_id and recipient_id = target_user_id)
      or
      (sender_id = target_user_id and recipient_id = current_user_id)
    )
  order by created_at desc
  limit 1;

  if existing_request.id is not null then
    if existing_request.sender_id = current_user_id then
      return existing_request.id;
    end if;

    raise exception 'INCOMING_REQUEST_EXISTS';
  end if;

  insert into public.friend_requests (sender_id, recipient_id)
  values (current_user_id, target_user_id)
  returning id into new_request_id;

  select coalesce(nullif(trim(display_name), ''), username, 'A student')
  into actor_name
  from public.profiles
  where id = current_user_id;

  select coalesce(friend_notifications, true)
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
      'friend_request',
      'New friend request',
      actor_name || ' sent you a friend request.',
      new_request_id
    );
  end if;

  return new_request_id;
end;
$$;

create or replace function public.respond_to_friend_request(
  target_request_id uuid,
  response text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_request public.friend_requests%rowtype;
  actor_name text;
  notify_sender boolean;
begin
  if current_user_id is null
    or target_request_id is null
    or response not in ('accepted', 'declined') then
    raise exception 'INVALID_FRIEND_RESPONSE';
  end if;

  select *
  into target_request
  from public.friend_requests
  where id = target_request_id
    and recipient_id = current_user_id
    and status = 'pending'
  for update;

  if target_request.id is null then
    raise exception 'FRIEND_REQUEST_NOT_FOUND';
  end if;

  update public.friend_requests
  set
    status = response,
    responded_at = now()
  where id = target_request_id;

  if response = 'accepted' then
    insert into public.friendships (user_id, friend_id)
    values
      (target_request.sender_id, target_request.recipient_id),
      (target_request.recipient_id, target_request.sender_id)
    on conflict do nothing;

    select coalesce(nullif(trim(display_name), ''), username, 'A student')
    into actor_name
    from public.profiles
    where id = current_user_id;

    select coalesce(friend_notifications, true)
    into notify_sender
    from public.user_notification_preferences
    where user_id = target_request.sender_id;

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
        target_request.sender_id,
        current_user_id,
        'friend_accepted',
        'Friend request accepted',
        actor_name || ' accepted your friend request.',
        target_request.id
      );
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.cancel_friend_request(
  target_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or target_request_id is null then
    raise exception 'INVALID_FRIEND_REQUEST';
  end if;

  update public.friend_requests
  set
    status = 'cancelled',
    responded_at = now()
  where id = target_request_id
    and sender_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'FRIEND_REQUEST_NOT_FOUND';
  end if;

  return true;
end;
$$;

create or replace function public.list_friend_requests()
returns table (
  request_id uuid,
  direction text,
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  study_icon text,
  profile_color text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    request.id as request_id,
    case
      when request.recipient_id = auth.uid() then 'incoming'
      else 'outgoing'
    end as direction,
    profile.id as user_id,
    profile.display_name,
    profile.username,
    profile.avatar_url,
    profile.study_icon,
    profile.profile_color,
    request.created_at
  from public.friend_requests request
  join public.profiles profile
    on profile.id = case
      when request.recipient_id = auth.uid() then request.sender_id
      else request.recipient_id
    end
  where request.status = 'pending'
    and (
      request.sender_id = auth.uid()
      or request.recipient_id = auth.uid()
    )
  order by request.created_at desc;
$$;

create or replace function public.list_friend_candidates()
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  study_icon text,
  profile_color text,
  mutual_friend_count bigint,
  request_direction text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    candidate.id as user_id,
    candidate.display_name,
    candidate.username,
    candidate.avatar_url,
    candidate.study_icon,
    candidate.profile_color,
    (
      select count(*)
      from public.friendships mine
      join public.friendships theirs
        on theirs.friend_id = mine.friend_id
      where mine.user_id = auth.uid()
        and theirs.user_id = candidate.id
    ) as mutual_friend_count,
    pending.direction as request_direction
  from public.profiles candidate
  left join lateral (
    select
      case
        when request.sender_id = auth.uid() then 'outgoing'
        else 'incoming'
      end as direction
    from public.friend_requests request
    where request.status = 'pending'
      and (
        (
          request.sender_id = auth.uid()
          and request.recipient_id = candidate.id
        )
        or
        (
          request.sender_id = candidate.id
          and request.recipient_id = auth.uid()
        )
      )
    order by request.created_at desc
    limit 1
  ) pending on true
  where candidate.id <> auth.uid()
    and not exists (
      select 1
      from public.friendships friendship
      where friendship.user_id = auth.uid()
        and friendship.friend_id = candidate.id
    )
  order by mutual_friend_count desc, candidate.display_name, candidate.username;
$$;

create or replace function public.get_notification_preferences()
returns table (
  friend_notifications boolean,
  nudge_notifications boolean,
  other_notifications boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  insert into public.user_notification_preferences (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  return query
  select
    preferences.friend_notifications,
    preferences.nudge_notifications,
    preferences.other_notifications
  from public.user_notification_preferences preferences
  where preferences.user_id = auth.uid();
end;
$$;

create or replace function public.update_notification_preferences(
  next_friend_notifications boolean,
  next_nudge_notifications boolean,
  next_other_notifications boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  insert into public.user_notification_preferences (
    user_id,
    friend_notifications,
    nudge_notifications,
    other_notifications,
    updated_at
  )
  values (
    auth.uid(),
    coalesce(next_friend_notifications, true),
    coalesce(next_nudge_notifications, true),
    coalesce(next_other_notifications, true),
    now()
  )
  on conflict (user_id)
  do update set
    friend_notifications = excluded.friend_notifications,
    nudge_notifications = excluded.nudge_notifications,
    other_notifications = excluded.other_notifications,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.add_friend(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.send_friend_request(target_user_id);
  return true;
end;
$$;

grant select on public.friend_requests to authenticated;
grant select, insert, update on public.user_notification_preferences
to authenticated;
grant select, update on public.app_notifications to authenticated;

grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, text)
to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.list_friend_requests() to authenticated;
grant execute on function public.list_friend_candidates() to authenticated;
grant execute on function public.get_notification_preferences()
to authenticated;
grant execute on function public.update_notification_preferences(
  boolean,
  boolean,
  boolean
) to authenticated;

alter table public.friend_requests replica identity full;
alter table public.app_notifications replica identity full;
alter table public.user_notification_preferences replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;

  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_notifications'
  ) then
    alter publication supabase_realtime add table public.app_notifications;
  end if;

  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_notification_preferences'
  ) then
    alter publication supabase_realtime
    add table public.user_notification_preferences;
  end if;
end;
$$;
