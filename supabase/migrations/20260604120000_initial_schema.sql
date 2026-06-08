create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  username text unique,
  avatar_url text,
  course text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  name text,
  color text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  invite_code text not null unique,
  visibility text not null default 'invite_only'
    check (visibility in ('invite_only', 'public')),
  nudges_enabled boolean not null default true,
  nudge_cooldown_seconds integer not null default 600,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  status text not null default 'active'
    check (status in ('active', 'removed', 'banned')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (group_id, user_id)
);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete restrict,
  group_id uuid references public.groups(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'completed', 'needs_confirmation', 'voided')),
  source text not null default 'timer'
    check (source in ('timer', 'manual_adjustment')),
  note text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  duration_seconds integer generated always as (
    case
      when ended_at is null then null
      else greatest(0, floor(extract(epoch from ended_at - started_at))::integer)
    end
  ) stored
);

create table public.group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create table public.user_group_notification_settings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  nudges_muted boolean not null default false,
  chat_muted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

create table public.user_nudge_mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id, group_id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create table public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  period text not null check (period in ('daily', 'weekly')),
  target_seconds integer not null check (target_seconds > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_active_session_per_user
on public.study_sessions (user_id)
where ended_at is null and deleted_at is null;

create index study_sessions_user_started_idx
on public.study_sessions (user_id, started_at desc);

create index study_sessions_group_started_idx
on public.study_sessions (group_id, started_at desc)
where group_id is not null;

create index group_chat_messages_group_created_idx
on public.group_chat_messages (group_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger study_sessions_set_updated_at
before update on public.study_sessions
for each row execute function public.set_updated_at();

create trigger user_group_notification_settings_set_updated_at
before update on public.user_group_notification_settings
for each row execute function public.set_updated_at();

create trigger user_goals_set_updated_at
before update on public.user_goals
for each row execute function public.set_updated_at();

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.study_sessions enable row level security;
alter table public.group_chat_messages enable row level security;
alter table public.nudges enable row level security;
alter table public.user_group_notification_settings enable row level security;
alter table public.user_nudge_mutes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.user_goals enable row level security;

create policy "profiles are visible to signed-in users"
on public.profiles for select
to authenticated
using (true);

create policy "users can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "users can insert own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "users manage own subjects"
on public.subjects for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "members can view groups"
on public.groups for select
to authenticated
using (public.is_group_member(id) or owner_id = auth.uid());

create policy "users can create groups"
on public.groups for insert
to authenticated
with check (owner_id = auth.uid());

create policy "owners and admins can update groups"
on public.groups for update
to authenticated
using (
  exists (
    select 1
    from public.group_members
    where group_id = id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and status = 'active'
  )
)
with check (owner_id = owner_id);

create policy "members can view group memberships"
on public.group_members for select
to authenticated
using (public.is_group_member(group_id) or user_id = auth.uid());

create policy "group owners and admins can manage members"
on public.group_members for all
to authenticated
using (
  exists (
    select 1
    from public.group_members as manager
    where manager.group_id = group_members.group_id
      and manager.user_id = auth.uid()
      and manager.role in ('owner', 'admin')
      and manager.status = 'active'
  )
)
with check (
  exists (
    select 1
    from public.group_members as manager
    where manager.group_id = group_members.group_id
      and manager.user_id = auth.uid()
      and manager.role in ('owner', 'admin')
      and manager.status = 'active'
  )
);

create policy "users manage own sessions"
on public.study_sessions for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "group members can read group sessions"
on public.study_sessions for select
to authenticated
using (group_id is not null and public.is_group_member(group_id));

create policy "group members can read chat"
on public.group_chat_messages for select
to authenticated
using (public.is_group_member(group_id));

create policy "group members can create chat"
on public.group_chat_messages for insert
to authenticated
with check (user_id = auth.uid() and public.is_group_member(group_id));

create policy "members can create nudges"
on public.nudges for insert
to authenticated
with check (sender_id = auth.uid() and public.is_group_member(group_id));

create policy "users can read own nudges"
on public.nudges for select
to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy "users manage own group notification settings"
on public.user_group_notification_settings for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users manage own nudge mutes"
on public.user_nudge_mutes for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users manage own push subscriptions"
on public.push_subscriptions for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "users manage own goals"
on public.user_goals for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
