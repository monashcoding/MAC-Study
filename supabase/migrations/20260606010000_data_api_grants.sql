grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.subjects to authenticated;
grant select, insert, update, delete on table public.groups to authenticated;
grant select, insert, update, delete on table public.group_members to authenticated;
grant select, insert, update, delete on table public.study_sessions to authenticated;
grant select, insert, update, delete on table public.group_chat_messages to authenticated;
grant select, insert, update, delete on table public.nudges to authenticated;
grant select, insert, update, delete on table public.user_group_notification_settings to authenticated;
grant select, insert, update, delete on table public.user_nudge_mutes to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, insert, update, delete on table public.user_goals to authenticated;

grant select on table public.access_invites to authenticated;
grant select on table public.access_invite_redemptions to authenticated;
grant execute on function public.redeem_access_invite(text) to authenticated;
