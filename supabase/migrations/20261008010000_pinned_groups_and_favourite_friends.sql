-- Personal list preferences: pin groups and favourite friends so they sit
-- above the rest of their list. Each row is private to the user who made it.

create table if not exists public.user_pinned_groups (
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

create table if not exists public.user_favourite_friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.user_pinned_groups enable row level security;
alter table public.user_favourite_friends enable row level security;

drop policy if exists "users read own pinned groups" on public.user_pinned_groups;
create policy "users read own pinned groups"
on public.user_pinned_groups
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users pin groups they belong to" on public.user_pinned_groups;
create policy "users pin groups they belong to"
on public.user_pinned_groups
for insert
to authenticated
with check (user_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists "users unpin own groups" on public.user_pinned_groups;
create policy "users unpin own groups"
on public.user_pinned_groups
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "users read own favourite friends" on public.user_favourite_friends;
create policy "users read own favourite friends"
on public.user_favourite_friends
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users favourite their friends" on public.user_favourite_friends;
create policy "users favourite their friends"
on public.user_favourite_friends
for insert
to authenticated
with check (user_id = auth.uid() and public.is_friend(friend_id));

drop policy if exists "users unfavourite own friends" on public.user_favourite_friends;
create policy "users unfavourite own friends"
on public.user_favourite_friends
for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, delete on public.user_pinned_groups to authenticated;
grant select, insert, delete on public.user_favourite_friends to authenticated;

notify pgrst, 'reload schema';
