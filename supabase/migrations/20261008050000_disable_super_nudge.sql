-- Retire Super Nudge. End every open request so send_nudge falls back to
-- standard limits and study blocking, and stop clients creating new ones.
-- The table and functions stay so history is kept and this can be undone.

update public.super_nudge_requests
set status = 'cancelled', updated_at = clock_timestamp()
where status in ('pending', 'active');

revoke execute on function public.request_super_nudge(uuid)
from public, authenticated;

revoke execute on function public.respond_super_nudge(uuid, text)
from public, authenticated;

notify pgrst, 'reload schema';
