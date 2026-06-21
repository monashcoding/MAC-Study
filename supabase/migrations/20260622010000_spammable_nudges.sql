create index if not exists nudges_sender_recipient_created_at_idx
on public.nudges (sender_id, recipient_id, created_at desc);

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
  end if;

  -- Serialize each sender/recipient pair so simultaneous taps cannot race past
  -- the rolling limit.
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

  if recent_nudge_count >= 10 then
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

    raise exception 'NUDGE_RATE_LIMIT:%', retry_after_seconds;
  end if;

  if daily_nudge_count >= 250 then
    raise exception 'NUDGE_DAILY_LIMIT';
  end if;

  select coalesce(
    nullif(display_name, ''),
    nullif(username, ''),
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

comment on function public.send_nudge(uuid, uuid) is
'Creates a nudge with limits of 10/minute and 250/day per sender/recipient pair.';
