-- Allow server-only notification delivery code to read recipients and
-- subscriptions, then create and mark notification records as delivered.

grant select on table
  public.groups,
  public.group_members,
  public.profiles,
  public.user_group_notification_settings,
  public.user_notification_preferences,
  public.push_subscriptions
to service_role;

grant select, insert, update on table public.app_notifications
to service_role;

notify pgrst, 'reload schema';
