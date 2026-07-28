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
  super_nudge_active boolean := false;
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
  else
    if not public.is_friend(target_user_id) then
      raise exception 'You can only nudge friends.';
    end if;

    select exists (
      select 1
      from public.super_nudge_requests
      where status = 'active'
        and (
          (sender_id = current_sender_id and recipient_id = target_user_id)
          or
          (sender_id = target_user_id and recipient_id = current_sender_id)
        )
    )
    into super_nudge_active;

    if super_nudge_active then
      recent_nudge_limit := 10;
    end if;
  end if;

  if exists (
    select 1
    from public.study_sessions
    where user_id = target_user_id
      and ended_at is null
      and deleted_at is null
      and status = 'active'
  ) and not super_nudge_active then
    raise exception 'RECIPIENT_STUDYING';
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

comment on function public.send_nudge(uuid, uuid) is
'Creates one direct nudge per minute, or up to ten per minute for an active mutual Super Nudge pair. Active Super Nudge pairs may nudge while the recipient is studying.';
