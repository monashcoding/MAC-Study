-- Focused social read models keep broad tables and raw study sessions out of
-- the browser while retaining the same user-scoped result set.

create index if not exists group_members_user_active_group_idx
on public.group_members (user_id, group_id)
where status = 'active';

create index if not exists study_sessions_social_rollup_idx
on public.study_sessions (user_id, started_at)
include (ended_at, status, duration_seconds)
where deleted_at is null and status <> 'voided';

create index if not exists profiles_discoverable_sort_idx
on public.profiles (display_name, username, id)
where is_discoverable;

create or replace function public.list_social_friends()
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  study_icon text,
  profile_color text,
  is_friend boolean,
  daily_study_seconds jsonb,
  day_seconds bigint,
  week_seconds bigint,
  month_seconds bigint,
  all_time_seconds bigint,
  active_started_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with viewer as (
    select
      auth.uid() as user_id,
      (statement_timestamp() at time zone 'Australia/Sydney')::date as today
  ),
  visible_users as (
    select viewer.user_id
    from viewer
    where viewer.user_id is not null

    union

    select friendship.friend_id
    from public.friendships friendship
    cross join viewer
    where friendship.user_id = viewer.user_id

    union

    select member.user_id
    from public.group_members own_membership
    join public.group_members member
      on member.group_id = own_membership.group_id
      and member.status = 'active'
    cross join viewer
    where own_membership.user_id = viewer.user_id
      and own_membership.status = 'active'
  ),
  session_segments as (
    select
      session.user_id,
      calendar_day.local_date::date as study_date,
      floor(
        greatest(
          0,
          extract(
            epoch from
              least(
                coalesce(session.ended_at, statement_timestamp()),
                (
                  (calendar_day.local_date::date + 1)::timestamp
                  at time zone 'Australia/Sydney'
                )
              )
              - greatest(
                session.started_at,
                (
                  calendar_day.local_date::date::timestamp
                  at time zone 'Australia/Sydney'
                )
              )
          )
        )
      )::bigint as seconds
    from public.study_sessions session
    join visible_users visible on visible.user_id = session.user_id
    cross join lateral generate_series(
      (session.started_at at time zone 'Australia/Sydney')::date,
      (
        coalesce(session.ended_at, statement_timestamp())
        at time zone 'Australia/Sydney'
      )::date,
      interval '1 day'
    ) as calendar_day(local_date)
    where session.deleted_at is null
      and session.status <> 'voided'
      and session.started_at <= coalesce(session.ended_at, statement_timestamp())
  ),
  daily_totals as (
    select
      segment.user_id,
      segment.study_date,
      sum(segment.seconds)::bigint as seconds
    from session_segments segment
    group by segment.user_id, segment.study_date
  ),
  session_rollups as (
    select
      daily.user_id,
      jsonb_object_agg(
        daily.study_date::text,
        daily.seconds
        order by daily.study_date
      ) as daily_study_seconds,
      coalesce(
        sum(daily.seconds) filter (where daily.study_date = viewer.today),
        0
      )::bigint as day_seconds,
      coalesce(
        sum(daily.seconds) filter (
          where daily.study_date between
            viewer.today - (extract(isodow from viewer.today)::integer - 1)
            and viewer.today
        ),
        0
      )::bigint as week_seconds,
      coalesce(
        sum(daily.seconds) filter (
          where daily.study_date between
            date_trunc('month', viewer.today)::date
            and viewer.today
        ),
        0
      )::bigint as month_seconds,
      coalesce(sum(daily.seconds), 0)::bigint as all_time_seconds
    from daily_totals daily
    cross join viewer
    group by daily.user_id
  ),
  active_sessions as (
    select
      session.user_id,
      max(session.started_at) as active_started_at
    from public.study_sessions session
    join visible_users visible on visible.user_id = session.user_id
    where session.deleted_at is null
      and session.status = 'active'
      and session.ended_at is null
    group by session.user_id
  )
  select
    profile.id,
    profile.display_name,
    profile.username,
    profile.avatar_url,
    profile.study_icon,
    profile.profile_color,
    profile.id = viewer.user_id
    or exists (
      select 1
      from public.friendships friendship
      where friendship.user_id = viewer.user_id
        and friendship.friend_id = profile.id
    ) as is_friend,
    coalesce(rollup.daily_study_seconds, '{}'::jsonb),
    coalesce(rollup.day_seconds, 0),
    coalesce(rollup.week_seconds, 0),
    coalesce(rollup.month_seconds, 0),
    coalesce(rollup.all_time_seconds, 0),
    active.active_started_at
  from visible_users visible
  cross join viewer
  join public.profiles profile on profile.id = visible.user_id
  left join session_rollups rollup on rollup.user_id = profile.id
  left join active_sessions active on active.user_id = profile.id
  order by profile.display_name nulls last, profile.username nulls last, profile.id;
$$;

create or replace function public.list_my_study_groups()
returns table (
  group_id uuid,
  group_name text,
  group_icon text,
  invite_code text,
  visibility text,
  current_user_role text,
  member_ids uuid[],
  member_roles jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    study_group.id,
    study_group.name,
    study_group.icon,
    study_group.invite_code,
    study_group.visibility,
    own_membership.role,
    array_agg(member.user_id order by member.joined_at, member.user_id),
    jsonb_object_agg(member.user_id::text, member.role)
  from public.group_members own_membership
  join public.groups study_group
    on study_group.id = own_membership.group_id
  join public.group_members member
    on member.group_id = study_group.id
    and member.status = 'active'
  where own_membership.user_id = auth.uid()
    and own_membership.status = 'active'
  group by
    study_group.id,
    study_group.name,
    study_group.icon,
    study_group.invite_code,
    study_group.visibility,
    study_group.created_at,
    own_membership.role
  order by study_group.created_at desc;
$$;

create or replace function public.list_friend_candidates_page(
  result_limit integer default 50,
  result_offset integer default 0
)
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
    candidate.id,
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
    ),
    pending.direction
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
        (request.sender_id = auth.uid() and request.recipient_id = candidate.id)
        or
        (request.sender_id = candidate.id and request.recipient_id = auth.uid())
      )
    order by request.created_at desc
    limit 1
  ) pending on true
  where candidate.id <> auth.uid()
    and candidate.is_discoverable
    and not exists (
      select 1
      from public.friendships friendship
      where friendship.user_id = auth.uid()
        and friendship.friend_id = candidate.id
  )
  order by
    7 desc,
    candidate.display_name nulls last,
    candidate.username nulls last,
    candidate.id
  limit least(greatest(coalesce(result_limit, 50), 1), 100)
  offset greatest(coalesce(result_offset, 0), 0);
$$;

create or replace function public.list_friend_requests_page(
  result_limit integer default 50,
  result_offset integer default 0
)
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
    request.id,
    case
      when request.recipient_id = auth.uid() then 'incoming'
      else 'outgoing'
    end,
    profile.id,
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
  order by request.created_at desc, request.id
  limit least(greatest(coalesce(result_limit, 50), 1), 100)
  offset greatest(coalesce(result_offset, 0), 0);
$$;

create or replace function public.list_group_invites_page(
  result_limit integer default 50,
  result_offset integer default 0
)
returns table (
  invite_id uuid,
  direction text,
  group_id uuid,
  group_name text,
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
    invite.id,
    case
      when invite.recipient_id = auth.uid() then 'incoming'
      else 'outgoing'
    end,
    study_group.id,
    study_group.name,
    profile.id,
    profile.display_name,
    profile.username,
    profile.avatar_url,
    profile.study_icon,
    profile.profile_color,
    invite.created_at
  from public.group_invites invite
  join public.groups study_group on study_group.id = invite.group_id
  join public.profiles profile
    on profile.id = case
      when invite.recipient_id = auth.uid() then invite.sender_id
      else invite.recipient_id
    end
  where invite.status = 'pending'
    and (
      invite.sender_id = auth.uid()
      or invite.recipient_id = auth.uid()
    )
  order by invite.created_at desc, invite.id
  limit least(greatest(coalesce(result_limit, 50), 1), 100)
  offset greatest(coalesce(result_offset, 0), 0);
$$;

create or replace function public.list_active_super_nudges(
  result_limit integer default 50,
  result_offset integer default 0
)
returns table (
  request_id uuid,
  sender_id uuid,
  recipient_id uuid,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    request.id,
    request.sender_id,
    request.recipient_id,
    request.status,
    request.created_at
  from public.super_nudge_requests request
  where request.status in ('pending', 'active')
    and (
      request.sender_id = auth.uid()
      or request.recipient_id = auth.uid()
    )
  order by request.created_at desc, request.id
  limit least(greatest(coalesce(result_limit, 50), 1), 100)
  offset greatest(coalesce(result_offset, 0), 0);
$$;

revoke all on function public.list_social_friends() from public;
revoke all on function public.list_my_study_groups() from public;
revoke all on function public.list_friend_candidates_page(integer, integer) from public;
revoke all on function public.list_friend_requests_page(integer, integer) from public;
revoke all on function public.list_group_invites_page(integer, integer) from public;
revoke all on function public.list_active_super_nudges(integer, integer) from public;

grant execute on function public.list_social_friends() to authenticated;
grant execute on function public.list_my_study_groups() to authenticated;
grant execute on function public.list_friend_candidates_page(integer, integer)
to authenticated;
grant execute on function public.list_friend_requests_page(integer, integer)
to authenticated;
grant execute on function public.list_group_invites_page(integer, integer)
to authenticated;
grant execute on function public.list_active_super_nudges(integer, integer)
to authenticated;

notify pgrst, 'reload schema';
