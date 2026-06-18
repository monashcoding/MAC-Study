grant select, insert, update, delete
on table public.nudges
to authenticated, service_role;

grant select, insert, update, delete
on table public.push_subscriptions
to authenticated, service_role;

grant execute
on function public.send_nudge(uuid, uuid)
to authenticated, service_role;
