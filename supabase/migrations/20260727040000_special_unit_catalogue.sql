create table if not exists public.special_units (
  code text primary key
    check (code ~ '^[A-Z][A-Z0-9]{1,13}$'),
  name text not null
    check (char_length(trim(name)) between 1 and 80),
  description text
    check (
      description is null
      or char_length(trim(description)) between 1 and 180
    ),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_special_unit_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_special_unit_updated_at
on public.special_units;

create trigger set_special_unit_updated_at
before update on public.special_units
for each row execute function public.set_special_unit_updated_at();

revoke execute on function public.set_special_unit_updated_at()
from public, anon, authenticated;

grant execute on function public.set_special_unit_updated_at()
to service_role;

alter table public.special_units enable row level security;

drop policy if exists "active members can view special units"
on public.special_units;

create policy "active members can view special units"
on public.special_units for select
to authenticated
using (
  is_active
  and public.is_active_mac_member(auth.uid())
);

grant select on table public.special_units to authenticated;
grant all on table public.special_units to service_role;

alter table public.units
drop constraint if exists units_code_check;

alter table public.units
add constraint units_code_check
check (code ~ '^[A-Z][A-Z0-9]{1,13}$');

insert into public.special_units (
  code,
  name,
  description,
  is_active,
  sort_order,
  updated_at
)
values (
  'IBL',
  'Industry Based Learning',
  'Industry experience completed as part of your studies.',
  true,
  10,
  now()
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

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
    regexp_replace(
      trim(coalesce(input_unit_code, '')),
      '[[:space:]-]+',
      '',
      'g'
    )
  );
  normalized_nickname text := nullif(
    regexp_replace(
      trim(coalesce(input_nickname, '')),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  special_unit_name text;
  target_unit_id uuid;
  target_offering_id uuid;
begin
  if current_user_id is null
     or not public.is_active_mac_member(current_user_id) then
    raise exception 'Active account access is required.';
  end if;

  select name
  into special_unit_name
  from public.special_units
  where code = normalized_code
    and is_active;

  if normalized_code !~ '^[A-Z]{3}[0-9]{4}$'
     and special_unit_name is null then
    raise exception 'Choose a standard unit code or an available special unit.';
  end if;

  if char_length(trim(coalesce(input_unit_code, ''))) > 14 then
    raise exception 'Unit code input is too long.';
  end if;

  if input_study_year is null
     or input_study_year not between 2000 and 2100 then
    raise exception 'Choose a valid study year.';
  end if;

  if input_teaching_period not in (
    'semester_1',
    'semester_2',
    'summer',
    'winter'
  ) then
    raise exception 'Choose a valid teaching period.';
  end if;

  if normalized_nickname is not null
     and char_length(normalized_nickname) > 60 then
    raise exception 'Unit nickname must be 60 characters or fewer.';
  end if;

  if special_unit_name is not null and normalized_nickname is null then
    normalized_nickname := special_unit_name;
  end if;

  insert into public.units (code)
  values (normalized_code)
  on conflict (code) do update set code = excluded.code
  returning id into target_unit_id;

  insert into public.unit_offerings (
    unit_id,
    study_year,
    teaching_period
  )
  values (
    target_unit_id,
    input_study_year,
    input_teaching_period
  )
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

grant execute on function public.upsert_unit_enrolment(
  text,
  integer,
  text,
  text
) to authenticated;

alter table public.special_units replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'special_units'
  ) then
    alter publication supabase_realtime add table public.special_units;
  end if;
end;
$$;

notify pgrst, 'reload schema';

comment on table public.special_units is
'Admin-managed catalogue of non-standard units shown automatically in the Add unit flow.';
