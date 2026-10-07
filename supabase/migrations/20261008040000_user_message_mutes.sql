-- Per-friend message mutes. A muted sender's direct messages still arrive,
-- but the recipient gets no push or in-app notification for them.
-- Separate from user_nudge_mutes, which silences nudges.

create table if not exists public.user_message_mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id),
  check (user_id <> muted_user_id)
);

alter table public.user_message_mutes enable row level security;

drop policy if exists "users manage own message mutes" on public.user_message_mutes;
create policy "users manage own message mutes"
on public.user_message_mutes
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, delete on public.user_message_mutes to authenticated;

notify pgrst, 'reload schema';
