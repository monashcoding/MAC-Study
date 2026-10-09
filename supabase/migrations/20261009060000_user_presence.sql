-- Tracks when someone last had the app open on screen, so push delivery
-- can skip native notifications while they're already looking at the app
-- (they get the in-app alert instead). iOS penalizes service workers that
-- receive a push without showing a notification, so the skip has to
-- happen on the server, not in the service worker.

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_active_at timestamptz
);

alter table public.user_presence enable row level security;

-- Written only through /api/presence (signed-in user, own row) and read
-- only by server push delivery.
create or replace function public.touch_user_presence(is_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;

  insert into public.user_presence (user_id, last_active_at)
  values (auth.uid(), case when is_active then now() end)
  on conflict (user_id) do update
  set last_active_at = excluded.last_active_at;
end;
$$;

revoke all on function public.touch_user_presence(boolean)
from public, anon;
grant execute on function public.touch_user_presence(boolean)
to authenticated;

grant select on table public.user_presence to service_role;

notify pgrst, 'reload schema';
