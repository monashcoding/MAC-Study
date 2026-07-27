create table if not exists public.special_unit_aliases (
  alias_code text primary key
    check (alias_code ~ '^[A-Z]{3}[0-9]{4}$'),
  special_unit_code text not null
    references public.special_units(code)
    on update cascade
    on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists special_unit_aliases_unit_idx
on public.special_unit_aliases (special_unit_code, alias_code);

alter table public.special_unit_aliases enable row level security;

drop policy if exists "active members can view special unit aliases"
on public.special_unit_aliases;

create policy "active members can view special unit aliases"
on public.special_unit_aliases for select
to authenticated
using (
  public.is_active_mac_member(auth.uid())
  and exists (
    select 1
    from public.special_units
    where special_units.code = special_unit_aliases.special_unit_code
      and special_units.is_active
  )
);

grant select on table public.special_unit_aliases to authenticated;
grant all on table public.special_unit_aliases to service_role;

insert into public.special_unit_aliases (
  alias_code,
  special_unit_code
)
values
  ('FIT3045', 'IBL'),
  ('FIT4042', 'IBL')
on conflict (alias_code) do update set
  special_unit_code = excluded.special_unit_code;

alter table public.special_unit_aliases replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'special_unit_aliases'
  ) then
    alter publication supabase_realtime
    add table public.special_unit_aliases;
  end if;
end;
$$;

comment on table public.special_unit_aliases is
'Standard unit codes that should prompt users to join a shared special-unit cohort.';

notify pgrst, 'reload schema';
