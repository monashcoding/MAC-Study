-- Cap each student at 5 active units per teaching period (year + period).
-- Enforced by trigger so every path that enrols or re-joins is covered.
-- Existing enrolments over the cap are left alone; only new joins are blocked.

create or replace function public.enforce_unit_enrolment_period_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_year integer;
  target_period text;
  active_count integer;
begin
  -- Only joining (insert) or re-joining (left_at cleared) can add a unit.
  if new.left_at is not null
     or (tg_op = 'UPDATE' and old.left_at is null) then
    return new;
  end if;

  select study_year, teaching_period
  into target_year, target_period
  from public.unit_offerings
  where id = new.offering_id;

  -- Serialise concurrent joins for the same student.
  perform pg_advisory_xact_lock(hashtext('unit-limit:' || new.user_id::text));

  select count(*)
  into active_count
  from public.unit_enrolments enrolment
  join public.unit_offerings offering on offering.id = enrolment.offering_id
  where enrolment.user_id = new.user_id
    and enrolment.left_at is null
    and enrolment.offering_id <> new.offering_id
    and offering.study_year = target_year
    and offering.teaching_period = target_period;

  if active_count >= 5 then
    raise exception 'You can join up to 5 units per teaching period.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists unit_enrolments_period_limit on public.unit_enrolments;
create trigger unit_enrolments_period_limit
before insert or update of left_at on public.unit_enrolments
for each row
execute function public.enforce_unit_enrolment_period_limit();
