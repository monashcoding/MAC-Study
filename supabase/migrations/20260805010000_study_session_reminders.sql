-- Per-session study reminders. A service-role scheduler claims due rows before
-- delivery so retries and overlapping job runs cannot duplicate notifications.

alter table public.study_sessions
  add column if not exists reminder_interval_minutes integer,
  add column if not exists reminder_last_sent_at timestamptz;

alter table public.study_sessions
  drop constraint if exists study_sessions_reminder_interval_minutes_check;

alter table public.study_sessions
  add constraint study_sessions_reminder_interval_minutes_check
  check (
    reminder_interval_minutes is null
    or reminder_interval_minutes between 25 and 1440
  );

create index if not exists study_sessions_due_reminder_idx
on public.study_sessions (reminder_last_sent_at)
where reminder_interval_minutes is not null
  and ended_at is null
  and deleted_at is null
  and status = 'active';

create or replace function public.set_active_study_reminder(
  next_interval_minutes integer default null
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

  if next_interval_minutes is not null
    and (next_interval_minutes < 25 or next_interval_minutes > 1440) then
    raise exception 'REMINDER_INTERVAL_OUT_OF_RANGE';
  end if;

  update public.study_sessions
  set
    reminder_interval_minutes = next_interval_minutes,
    reminder_last_sent_at = case
      when next_interval_minutes is null then null
      else clock_timestamp()
    end
  where user_id = auth.uid()
    and ended_at is null
    and deleted_at is null
    and status = 'active';

  if not found then
    raise exception 'NO_ACTIVE_STUDY_SESSION';
  end if;

  return true;
end;
$$;

create or replace function public.claim_due_study_reminders(
  batch_size integer default 100
)
returns table (
  session_id uuid,
  user_id uuid,
  started_at timestamptz,
  reminder_interval_minutes integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  return query
  with due_sessions as (
    select session.id
    from public.study_sessions as session
    where session.reminder_interval_minutes is not null
      and session.ended_at is null
      and session.deleted_at is null
      and session.status = 'active'
      and coalesce(session.reminder_last_sent_at, session.started_at)
        <= clock_timestamp()
          - make_interval(mins => session.reminder_interval_minutes)
    order by coalesce(session.reminder_last_sent_at, session.started_at)
    for update skip locked
    limit least(greatest(coalesce(batch_size, 100), 1), 250)
  )
  update public.study_sessions as session
  set reminder_last_sent_at = clock_timestamp()
  from due_sessions
  where session.id = due_sessions.id
  returning
    session.id,
    session.user_id,
    session.started_at,
    session.reminder_interval_minutes;
end;
$$;

revoke all on function public.set_active_study_reminder(integer) from public;
grant execute on function public.set_active_study_reminder(integer)
to authenticated;

revoke all on function public.claim_due_study_reminders(integer) from public;
grant execute on function public.claim_due_study_reminders(integer)
to service_role;

notify pgrst, 'reload schema';
