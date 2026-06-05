alter table public.profiles
add column if not exists access_status text not null default 'pending'
  check (access_status in ('pending', 'active', 'blocked')),
add column if not exists access_granted_at timestamptz,
add column if not exists access_granted_by uuid references public.profiles(id),
add column if not exists access_granted_source text;

create table if not exists public.access_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.access_invite_redemptions (
  invite_id uuid not null references public.access_invites(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);

alter table public.access_invites enable row level security;
alter table public.access_invite_redemptions enable row level security;

create policy "active members can view access invites"
on public.access_invites for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and access_status = 'active'
  )
);

create policy "users can view own invite redemptions"
on public.access_invite_redemptions for select
to authenticated
using (user_id = auth.uid());

create or replace function public.redeem_access_invite(invite_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text := upper(trim(invite_code));
  invite public.access_invites%rowtype;
  redemption_inserted integer := 0;
begin
  if auth.uid() is null then
    return false;
  end if;

  select *
  into invite
  from public.access_invites
  where upper(code) = normalized_code
  for update;

  if invite.id is null then
    return false;
  end if;

  if invite.revoked_at is not null then
    return false;
  end if;

  if invite.expires_at is not null and invite.expires_at < now() then
    return false;
  end if;

  if invite.max_uses is not null and invite.uses_count >= invite.max_uses then
    return false;
  end if;

  insert into public.access_invite_redemptions (invite_id, user_id)
  values (invite.id, auth.uid())
  on conflict do nothing;

  get diagnostics redemption_inserted = row_count;

  if redemption_inserted = 1 then
    update public.access_invites
    set uses_count = uses_count + 1
    where id = invite.id;
  end if;

  update public.profiles
  set
    access_status = 'active',
    access_granted_at = coalesce(access_granted_at, now()),
    access_granted_source = 'invite'
  where id = auth.uid();

  return true;
end;
$$;

grant execute on function public.redeem_access_invite(text) to authenticated;

-- For local/MVP testing, create an invite from the Supabase SQL editor:
-- insert into public.access_invites (code, note, max_uses)
-- values ('MAC-FOUNDING', 'Initial MVP test invite', 50);
