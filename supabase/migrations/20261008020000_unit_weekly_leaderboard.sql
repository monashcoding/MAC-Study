-- Weekly study time per student for one unit offering, counting only
-- sessions on subjects linked to that offering. The week starts Monday
-- (Australia/Sydney), matching the social read models.
-- Returns students with time this week, plus the caller even at zero.
create or replace function public.get_unit_weekly_leaderboard(
  input_offering_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  study_icon text,
  week_seconds bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with week as (
    select (
      (
        (statement_timestamp() at time zone 'Australia/Sydney')::date
        - (
          extract(
            isodow from (statement_timestamp() at time zone 'Australia/Sydney')
          )::integer - 1
        )
      )::timestamp at time zone 'Australia/Sydney'
    ) as starts_at
  ),
  cohort as (
    select enrolment.user_id
    from public.unit_enrolments enrolment
    join public.profiles profile on profile.id = enrolment.user_id
    where enrolment.offering_id = input_offering_id
      and enrolment.left_at is null
      and profile.access_status = 'active'
  ),
  totals as (
    select
      session.user_id,
      sum(
        floor(
          greatest(
            0,
            extract(
              epoch from
                least(
                  coalesce(session.ended_at, statement_timestamp()),
                  statement_timestamp()
                )
                - greatest(session.started_at, week.starts_at)
            )
          )
        )
      )::bigint as seconds
    from public.study_sessions session
    join public.subjects subject on subject.id = session.subject_id
    join cohort on cohort.user_id = session.user_id
    cross join week
    where subject.unit_offering_id = input_offering_id
      and session.deleted_at is null
      and session.status <> 'voided'
      and coalesce(session.ended_at, statement_timestamp()) > week.starts_at
    group by session.user_id
  )
  select
    profile.id,
    profile.display_name,
    profile.username,
    profile.study_icon,
    coalesce(totals.seconds, 0)
  from cohort
  join public.profiles profile on profile.id = cohort.user_id
  left join totals on totals.user_id = cohort.user_id
  where public.is_active_mac_member(auth.uid())
    -- Only students in this offering can see its leaderboard.
    and exists (select 1 from cohort viewer where viewer.user_id = auth.uid())
    and (coalesce(totals.seconds, 0) > 0 or profile.id = auth.uid())
  order by
    coalesce(totals.seconds, 0) desc,
    coalesce(profile.display_name, profile.username, profile.id::text);
$$;

revoke all on function public.get_unit_weekly_leaderboard(uuid) from public;
grant execute on function public.get_unit_weekly_leaderboard(uuid)
to authenticated;

notify pgrst, 'reload schema';
