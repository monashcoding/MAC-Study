create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[A-Z]{3}[0-9]{4}$'),
  created_at timestamptz not null default now()
);

create table public.unit_offerings (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  study_year integer not null check (study_year between 2000 and 2100),
  teaching_period text not null
    check (teaching_period in ('semester_1', 'semester_2', 'summer', 'winter')),
  created_at timestamptz not null default now(),
  unique (unit_id, study_year, teaching_period)
);

create table public.unit_enrolments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  offering_id uuid not null references public.unit_offerings(id) on delete cascade,
  nickname text check (nickname is null or char_length(nickname) between 1 and 60),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (user_id, offering_id)
);

alter table public.subjects
add column unit_offering_id uuid references public.unit_offerings(id) on delete set null;

create unique index subjects_user_unit_offering_idx
on public.subjects (user_id, unit_offering_id);

create index unit_offerings_period_idx
on public.unit_offerings (study_year desc, teaching_period, unit_id);

create index unit_enrolments_active_offering_idx
on public.unit_enrolments (offering_id, joined_at)
where left_at is null;

create index unit_enrolments_active_user_idx
on public.unit_enrolments (user_id, joined_at desc)
where left_at is null;

alter table public.units enable row level security;
alter table public.unit_offerings enable row level security;
alter table public.unit_enrolments enable row level security;

create or replace function public.is_active_mac_member(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and access_status = 'active'
  );
$$;

create policy "active members can view units"
on public.units for select
to authenticated
using (public.is_active_mac_member(auth.uid()));

create policy "active members can view unit offerings"
on public.unit_offerings for select
to authenticated
using (public.is_active_mac_member(auth.uid()));

create policy "users can view own unit enrolments"
on public.unit_enrolments for select
to authenticated
using (
  user_id = auth.uid()
  and public.is_active_mac_member(auth.uid())
);

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
  target_subject_id uuid;
  existing_subject_name text;
  effective_nickname text;
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

  perform pg_advisory_xact_lock(
    hashtext(current_user_id::text),
    hashtext(target_offering_id::text)
  );

  select id, name
  into target_subject_id, existing_subject_name
  from public.subjects
  where user_id = current_user_id
    and unit_offering_id = target_offering_id
  order by created_at
  limit 1;

  if target_subject_id is null then
    select id, name
    into target_subject_id, existing_subject_name
    from public.subjects
    where user_id = current_user_id
      and unit_offering_id is null
      and upper(regexp_replace(trim(code), '[[:space:]-]+', '', 'g')) = normalized_code
    order by (archived_at is null) desc, created_at
    limit 1;
  end if;

  effective_nickname := normalized_nickname;

  if effective_nickname is null
     and nullif(trim(coalesce(existing_subject_name, '')), '') is not null
     and upper(trim(existing_subject_name)) <> normalized_code then
    effective_nickname := trim(existing_subject_name);
  end if;

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
    effective_nickname,
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

  if target_subject_id is null then
    insert into public.subjects (
      user_id,
      code,
      name,
      color,
      unit_offering_id
    )
    values (
      current_user_id,
      normalized_code,
      coalesce(effective_nickname, normalized_code),
      '#FFE330',
      target_offering_id
    );
  else
    update public.subjects
    set code = normalized_code,
        name = coalesce(effective_nickname, normalized_code),
        archived_at = null,
        unit_offering_id = target_offering_id
    where id = target_subject_id
      and user_id = current_user_id;
  end if;

  return target_offering_id;
end;
$$;

create or replace function public.leave_unit_enrolment(input_offering_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_active_mac_member(auth.uid()) then
    return false;
  end if;

  update public.unit_enrolments
  set left_at = now()
  where user_id = auth.uid()
    and offering_id = input_offering_id
    and left_at is null;

  return found;
end;
$$;

create or replace function public.get_unit_cohort(input_offering_id uuid)
returns table (
  user_id uuid,
  display_name text,
  username text,
  profile_color text,
  study_icon text,
  is_friend boolean,
  shared_group_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.id,
    profile.display_name,
    profile.username,
    profile.profile_color,
    profile.study_icon,
    exists (
      select 1
      from public.friendships
      where friendships.user_id = auth.uid()
        and friendships.friend_id = profile.id
    ) as is_friend,
    coalesce(
      array(
        select viewer.group_id
        from public.group_members as viewer
        join public.group_members as peer
          on peer.group_id = viewer.group_id
        where viewer.user_id = auth.uid()
          and viewer.status = 'active'
          and peer.user_id = profile.id
          and peer.status = 'active'
        order by viewer.group_id
      ),
      '{}'::uuid[]
    ) as shared_group_ids
  from public.unit_enrolments as enrolment
  join public.profiles as profile on profile.id = enrolment.user_id
  where public.is_active_mac_member(auth.uid())
    and enrolment.offering_id = input_offering_id
    and enrolment.left_at is null
    and enrolment.user_id <> auth.uid()
    and profile.access_status = 'active'
  order by coalesce(profile.display_name, profile.username, profile.id::text);
$$;

create or replace function public.sync_unit_subject_nickname()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_code text;
begin
  if new.unit_offering_id is null then
    return new;
  end if;

  select units.code
  into canonical_code
  from public.unit_offerings
  join public.units on units.id = unit_offerings.unit_id
  where unit_offerings.id = new.unit_offering_id;

  update public.unit_enrolments
  set nickname = case
    when nullif(trim(coalesce(new.name, '')), '') is null then null
    when upper(trim(new.name)) = canonical_code then null
    else left(trim(new.name), 60)
  end
  where user_id = new.user_id
    and offering_id = new.unit_offering_id;

  return new;
end;
$$;

create trigger subjects_sync_unit_nickname
after insert or update of name, unit_offering_id on public.subjects
for each row
execute function public.sync_unit_subject_nickname();

grant select on table public.units, public.unit_offerings, public.unit_enrolments
to authenticated;

grant all on table public.units, public.unit_offerings, public.unit_enrolments
to service_role;

grant execute on function public.is_active_mac_member(uuid) to authenticated, service_role;
grant execute on function public.upsert_unit_enrolment(text, integer, text, text)
to authenticated, service_role;
grant execute on function public.leave_unit_enrolment(uuid)
to authenticated, service_role;
grant execute on function public.get_unit_cohort(uuid)
to authenticated, service_role;

alter table public.unit_enrolments replica identity full;
alter table public.subjects replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'unit_enrolments'
  ) then
    alter publication supabase_realtime add table public.unit_enrolments;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'subjects'
  ) then
    alter publication supabase_realtime add table public.subjects;
  end if;
end $$;

comment on table public.units is 'Canonical Monash unit codes shared across MAC Study.';
comment on table public.unit_offerings is 'A canonical unit taught in a specific year and teaching period.';
comment on table public.unit_enrolments is 'MAC member participation in a unit offering.';
