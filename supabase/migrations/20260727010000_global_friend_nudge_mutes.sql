-- Allow a user to mute another user's nudges globally.
-- Existing group-specific mute rows remain unchanged.

alter table public.user_nudge_mutes
drop constraint if exists user_nudge_mutes_pkey;

alter table public.user_nudge_mutes
alter column group_id drop not null;

alter table public.user_nudge_mutes
add column if not exists id uuid default gen_random_uuid();

update public.user_nudge_mutes
set id = gen_random_uuid()
where id is null;

alter table public.user_nudge_mutes
alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_nudge_mutes'::regclass
      and contype = 'p'
  ) then
    alter table public.user_nudge_mutes
    add constraint user_nudge_mutes_id_pkey primary key (id);
  end if;
end;
$$;

create unique index if not exists user_nudge_mutes_scope_unique
on public.user_nudge_mutes (user_id, muted_user_id, group_id)
nulls not distinct;

notify pgrst, 'reload schema';
