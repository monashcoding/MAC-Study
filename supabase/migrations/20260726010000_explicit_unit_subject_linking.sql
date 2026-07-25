create or replace function public.upsert_unit_enrolment(
  input_unit_code text,
  input_study_year integer,
  input_teaching_period text,
  input_nickname text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := upper(
    regexp_replace(trim(coalesce(input_unit_code, '')), '[[:space:]-]+', '', 'g')
  );
  normalized_nickname text := nullif(
    regexp_replace(trim(coalesce(input_nickname, '')), '[[:space:]]+', ' ', 'g'),
    ''
  );
  target_unit_id uuid;
  target_offering_id uuid;
begin
  if current_user_id is null or not public.is_active_mac_member(current_user_id) then
    raise exception 'Active MAC access is required.';
  end if;

  if normalized_code !~ '^[A-Z]{3}[0-9]{4}$' then
    raise exception 'Use a Monash unit code such as FIT3077.';
  end if;

  if char_length(trim(coalesce(input_unit_code, ''))) > 14 then
    raise exception 'Unit code input is too long.';
  end if;

  if input_study_year is null or input_study_year not between 2000 and 2100 then
    raise exception 'Choose a valid study year.';
  end if;

  if input_teaching_period not in ('semester_1', 'semester_2', 'summer', 'winter') then
    raise exception 'Choose a valid teaching period.';
  end if;

  if normalized_nickname is not null and char_length(normalized_nickname) > 60 then
    raise exception 'Unit nickname must be 60 characters or fewer.';
  end if;

  insert into public.units (code)
  values (normalized_code)
  on conflict (code) do update set code = excluded.code
  returning id into target_unit_id;

  insert into public.unit_offerings (unit_id, study_year, teaching_period)
  values (target_unit_id, input_study_year, input_teaching_period)
  on conflict (unit_id, study_year, teaching_period)
  do update set unit_id = excluded.unit_id
  returning id into target_offering_id;

  insert into public.unit_enrolments (
    user_id,
    offering_id,
    nickname,
    joined_at,
    left_at
  )
  values (
    current_user_id,
    target_offering_id,
    normalized_nickname,
    now(),
    null
  )
  on conflict (user_id, offering_id)
  do update set
    nickname = excluded.nickname,
    joined_at = case
      when unit_enrolments.left_at is not null then now()
      else unit_enrolments.joined_at
    end,
    left_at = null;

  return target_offering_id;
end;
$$;

create or replace function public.set_subject_unit_offering(
  input_subject_id uuid,
  input_offering_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  canonical_code text;
begin
  if current_user_id is null or not public.is_active_mac_member(current_user_id) then
    raise exception 'Active MAC access is required.';
  end if;

  if not exists (
    select 1
    from public.subjects
    where id = input_subject_id
      and user_id = current_user_id
      and archived_at is null
  ) then
    raise exception 'Study subject not found.';
  end if;

  if input_offering_id is null then
    update public.subjects
    set unit_offering_id = null,
        code = coalesce(nullif(trim(name), ''), code)
    where id = input_subject_id
      and user_id = current_user_id;

    return found;
  end if;

  select units.code
  into canonical_code
  from public.unit_enrolments
  join public.unit_offerings
    on unit_offerings.id = unit_enrolments.offering_id
  join public.units
    on units.id = unit_offerings.unit_id
  where unit_enrolments.user_id = current_user_id
    and unit_enrolments.offering_id = input_offering_id
    and unit_enrolments.left_at is null;

  if canonical_code is null then
    raise exception 'Join this unit before linking it to a study subject.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(current_user_id::text),
    hashtext(input_offering_id::text)
  );

  update public.subjects
  set unit_offering_id = null,
      code = coalesce(nullif(trim(name), ''), code)
  where user_id = current_user_id
    and unit_offering_id = input_offering_id
    and id <> input_subject_id;

  update public.subjects
  set unit_offering_id = input_offering_id,
      code = canonical_code,
      archived_at = null
  where id = input_subject_id
    and user_id = current_user_id;

  return found;
end;
$$;

create or replace function public.leave_unit_enrolment(input_offering_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  did_leave boolean;
begin
  if current_user_id is null or not public.is_active_mac_member(current_user_id) then
    return false;
  end if;

  update public.unit_enrolments
  set left_at = now()
  where user_id = current_user_id
    and offering_id = input_offering_id
    and left_at is null;

  did_leave := found;

  if did_leave then
    update public.subjects
    set unit_offering_id = null,
        code = coalesce(nullif(trim(name), ''), code)
    where user_id = current_user_id
      and unit_offering_id = input_offering_id;
  end if;

  return did_leave;
end;
$$;

grant execute on function public.upsert_unit_enrolment(text, integer, text, text)
to authenticated, service_role;
grant execute on function public.set_subject_unit_offering(uuid, uuid)
to authenticated, service_role;
grant execute on function public.leave_unit_enrolment(uuid)
to authenticated, service_role;

comment on function public.set_subject_unit_offering(uuid, uuid)
is 'Explicitly links or unlinks one of the current user''s study subjects to an active unit enrolment.';
