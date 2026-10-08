create table public.user_onboarding_states (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  welcome_version integer not null default 0 check (welcome_version >= 0),
  welcome_completed_at timestamptz,
  welcome_dismissed_at timestamptz,
  is_existing_at_rollout boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_onboarding_states (user_id, is_existing_at_rollout)
select id, true
from public.profiles
on conflict (user_id) do nothing;

create trigger user_onboarding_states_set_updated_at
before update on public.user_onboarding_states
for each row execute function public.set_updated_at();

alter table public.user_onboarding_states enable row level security;

create policy "users manage own onboarding state"
on public.user_onboarding_states for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update on public.user_onboarding_states to authenticated;
