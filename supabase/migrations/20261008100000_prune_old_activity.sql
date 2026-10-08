-- Nightly cleanup of rows that only matter for a short while, so the
-- database doesn't grow forever. Nothing a user can still see or act on is
-- removed:
--   * read notifications older than 60 days (unread ones after 180 days)
--   * nudges older than 60 days (the rate limits only look at today)
--   * friend requests, group invites and Super Nudge requests that were
--     already answered or cancelled more than 90 days ago

create or replace function public.prune_old_activity()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.app_notifications
  where (read_at is not null and created_at < now() - interval '60 days')
     or created_at < now() - interval '180 days';

  delete from public.nudges
  where created_at < now() - interval '60 days';

  delete from public.friend_requests
  where status <> 'pending'
    and created_at < now() - interval '90 days';

  delete from public.group_invites
  where status <> 'pending'
    and created_at < now() - interval '90 days';

  delete from public.super_nudge_requests
  where status not in ('pending', 'active')
    and created_at < now() - interval '90 days';
end;
$$;

-- Only the scheduler (running as postgres) should call this.
revoke all on function public.prune_old_activity() from public, anon, authenticated;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mac-study-prune-old-activity') then
    perform cron.unschedule('mac-study-prune-old-activity');
  end if;
end;
$$;

-- 16:17 UTC is 2:17am or 3:17am in Sydney, when hardly anyone is studying.
select cron.schedule(
  'mac-study-prune-old-activity',
  '17 16 * * *',
  'select public.prune_old_activity()'
);
