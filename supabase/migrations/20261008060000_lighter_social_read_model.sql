-- Make the friends/groups read model cheap to re-run.
--
-- list_social_friends runs on every refresh of the Friends and Groups
-- screens. It used to split every session a visible person had ever logged
-- into days and return each person's full day-by-day history. Now it:
--   * only splits sessions that touch the current month/week into days
--     (for the day/week/month totals),
--   * gets all-time totals from the stored duration column, and
--   * returns an empty daily_study_seconds. The column stays so clients
--     still on the previous build keep working.
-- A friend's history now loads on demand via get_user_daily_study_seconds,
-- capped at the last 365 days (enough for "This year" and the 52-week map).

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
  bounds as (
    select
      viewer.today,
      viewer.today - (extract(isodow from viewer.today)::integer - 1) as week_start,
      date_trunc('month', viewer.today)::date as month_start,
      (
        least(
          viewer.today - (extract(isodow from viewer.today)::integer - 1),
          date_trunc('month', viewer.today)::date
        )::timestamp at time zone 'Australia/Sydney'
      ) as window_starts_at
    from viewer
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
  recent_segments as (
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
                (calendar_day.local_date::date + 1)::timestamp
                  at time zone 'Australia/Sydney'
              )
              - greatest(
                session.started_at,
                calendar_day.local_date::date::timestamp
                  at time zone 'Australia/Sydney'
              )
          )
        )
      )::bigint as seconds
    from public.study_sessions session
    join visible_users visible on visible.user_id = session.user_id
    cross join bounds
    cross join lateral generate_series(
      greatest(
        (session.started_at at time zone 'Australia/Sydney')::date,
        least(bounds.week_start, bounds.month_start)
      ),
      (
        coalesce(session.ended_at, statement_timestamp())
        at time zone 'Australia/Sydney'
      )::date,
      interval '1 day'
    ) as calendar_day(local_date)
    where session.deleted_at is null
      and session.status <> 'voided'
      -- No study session runs a week, so this keeps the index range tight.
      and session.started_at >= bounds.window_starts_at - interval '7 days'
      and coalesce(session.ended_at, statement_timestamp()) > bounds.window_starts_at
      and session.started_at <= coalesce(session.ended_at, statement_timestamp())
  ),
  recent_totals as (
    select
      segment.user_id,
      coalesce(
        sum(segment.seconds) filter (where segment.study_date = bounds.today),
        0
      )::bigint as day_seconds,
      coalesce(
        sum(segment.seconds) filter (
          where segment.study_date between bounds.week_start and bounds.today
        ),
        0
      )::bigint as week_seconds,
      coalesce(
        sum(segment.seconds) filter (
          where segment.study_date between bounds.month_start and bounds.today
        ),
        0
      )::bigint as month_seconds
    from recent_segments segment
    cross join bounds
    group by segment.user_id
  ),
  all_time_totals as (
    select
      session.user_id,
      sum(
        coalesce(
          session.duration_seconds,
          greatest(
            0,
            floor(extract(epoch from statement_timestamp() - session.started_at))
          )::integer
        )
      )::bigint as all_time_seconds
    from public.study_sessions session
    join visible_users visible on visible.user_id = session.user_id
    where session.deleted_at is null
      and session.status <> 'voided'
    group by session.user_id
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
    '{}'::jsonb,
    coalesce(recent.day_seconds, 0),
    coalesce(recent.week_seconds, 0),
    coalesce(recent.month_seconds, 0),
    coalesce(lifetime.all_time_seconds, 0),
    active.active_started_at
  from visible_users visible
  cross join viewer
  join public.profiles profile on profile.id = visible.user_id
  left join recent_totals recent on recent.user_id = profile.id
  left join all_time_totals lifetime on lifetime.user_id = profile.id
  left join active_sessions active on active.user_id = profile.id
  order by profile.display_name nulls last, profile.username nulls last, profile.id;
$$;

-- One person's day-by-day study seconds for the last 365 days, for their
-- profile's "This year" total and activity map. Visible to themselves,
-- their friends and people who share an active group with them.
create or replace function public.get_user_daily_study_seconds(
  target_user_id uuid
)
returns jsonb
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
  allowed as (
    select 1
    from viewer
    where viewer.user_id = target_user_id
      or exists (
        select 1
        from public.friendships friendship
        where friendship.user_id = viewer.user_id
          and friendship.friend_id = target_user_id
      )
      or exists (
        select 1
        from public.group_members own_membership
        join public.group_members member
          on member.group_id = own_membership.group_id
          and member.status = 'active'
        where own_membership.user_id = viewer.user_id
          and own_membership.status = 'active'
          and member.user_id = target_user_id
      )
  ),
  bounds as (
    select
      viewer.today,
      viewer.today - 364 as first_day,
      ((viewer.today - 364)::timestamp at time zone 'Australia/Sydney') as starts_at
    from viewer
  ),
  segments as (
    select
      calendar_day.local_date::date as study_date,
      floor(
        greatest(
          0,
          extract(
            epoch from
              least(
                coalesce(session.ended_at, statement_timestamp()),
                (calendar_day.local_date::date + 1)::timestamp
                  at time zone 'Australia/Sydney'
              )
              - greatest(
                session.started_at,
                calendar_day.local_date::date::timestamp
                  at time zone 'Australia/Sydney'
              )
          )
        )
      )::bigint as seconds
    from public.study_sessions session
    cross join bounds
    cross join lateral generate_series(
      greatest(
        (session.started_at at time zone 'Australia/Sydney')::date,
        bounds.first_day
      ),
      (
        coalesce(session.ended_at, statement_timestamp())
        at time zone 'Australia/Sydney'
      )::date,
      interval '1 day'
    ) as calendar_day(local_date)
    where exists (select 1 from allowed)
      and session.user_id = target_user_id
      and session.deleted_at is null
      and session.status <> 'voided'
      and session.started_at >= bounds.starts_at - interval '7 days'
      and coalesce(session.ended_at, statement_timestamp()) > bounds.starts_at
      and session.started_at <= coalesce(session.ended_at, statement_timestamp())
  )
  select coalesce(
    jsonb_object_agg(daily.study_date::text, daily.seconds order by daily.study_date),
    '{}'::jsonb
  )
  from (
    select study_date, sum(seconds)::bigint as seconds
    from segments
    group by study_date
    having sum(seconds) > 0
  ) daily;
$$;

revoke all on function public.get_user_daily_study_seconds(uuid) from public;
grant execute on function public.get_user_daily_study_seconds(uuid)
to authenticated;

-- Profile rows are readable by every signed-in user, so broadcasting their
-- changes sent every sign-in (last-seen update) to every open client, each
-- of which then refetched its social data. Profile edits now show up on the
-- next normal refresh instead.
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime drop table public.profiles;
  end if;
end;
$$;

notify pgrst, 'reload schema';
