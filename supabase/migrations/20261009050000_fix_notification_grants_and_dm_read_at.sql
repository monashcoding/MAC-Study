-- Fixes errors seen in production Postgres logs.
--
-- 1. "permission denied for table user_notification_preferences /
--    user_message_mutes / app_notifications": the message, friend request
--    and group invite routes read these with the service role to decide
--    who gets notified. user_message_mutes was never granted to
--    service_role, and the hosted database was missing the others too, so
--    every notification attempt failed. Re-grant explicitly (idempotent).
--    The same goes for the authenticated grants Realtime relies on to
--    filter nudges and notifications by recipient.

grant select on table
  public.user_notification_preferences,
  public.user_message_mutes
to service_role;

grant select, insert, update on table public.app_notifications
to service_role;

grant select on table public.nudges, public.app_notifications
to authenticated;

-- 2. "direct_messages violates check constraint
--    direct_messages_read_after_create": the browser marks messages read
--    with its own clock. When that clock runs behind the server, read_at
--    lands before created_at and the whole mark-read update fails, so the
--    messages stay unread. Stamp read_at with server time instead.

create or replace function public.stamp_direct_message_read_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.read_at is not null and old.read_at is null then
    new.read_at := greatest(now(), new.created_at);
  end if;

  return new;
end;
$$;

drop trigger if exists direct_messages_stamp_read_at
on public.direct_messages;
create trigger direct_messages_stamp_read_at
before update of read_at on public.direct_messages
for each row execute function public.stamp_direct_message_read_at();

notify pgrst, 'reload schema';
