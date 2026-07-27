create table if not exists public.special_unit_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null
    references public.profiles(id) on delete cascade,
  unit_name text not null
    check (char_length(trim(unit_name)) between 1 and 80),
  unit_code text
    check (
      unit_code is null
      or (
        char_length(unit_code) between 1 and 14
        and unit_code ~ '^[A-Z][A-Z0-9]{1,13}$'
      )
    ),
  comment text
    check (comment is null or char_length(trim(comment)) between 1 and 500),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists special_unit_requests_status_created_idx
on public.special_unit_requests (status, created_at desc);

create unique index if not exists special_unit_requests_pending_name_idx
on public.special_unit_requests (requester_id, lower(unit_name))
where status = 'pending';

alter table public.special_unit_requests enable row level security;

drop policy if exists "users can submit special unit requests"
on public.special_unit_requests;

create policy "users can submit special unit requests"
on public.special_unit_requests for insert
to authenticated
with check (
  requester_id = auth.uid()
  and status = 'pending'
  and public.is_active_mac_member(auth.uid())
);

drop policy if exists "users can view own special unit requests"
on public.special_unit_requests;

create policy "users can view own special unit requests"
on public.special_unit_requests for select
to authenticated
using (
  requester_id = auth.uid()
  and public.is_active_mac_member(auth.uid())
);

grant select, insert on table public.special_unit_requests to authenticated;
grant all on table public.special_unit_requests to service_role;

comment on table public.special_unit_requests is
'User-submitted requests for additions to the special unit catalogue.';

notify pgrst, 'reload schema';
