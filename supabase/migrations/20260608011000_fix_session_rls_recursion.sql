create or replace function public.shares_active_group_with_user(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members as viewer
    join public.group_members as peer
      on peer.group_id = viewer.group_id
    where viewer.user_id = auth.uid()
      and viewer.status = 'active'
      and peer.user_id = target_user_id
      and peer.status = 'active'
  );
$$;

drop policy if exists "group peers can read member sessions" on public.study_sessions;
create policy "group peers can read member sessions"
on public.study_sessions for select
to authenticated
using (public.shares_active_group_with_user(user_id));

grant execute on function public.shares_active_group_with_user(uuid) to authenticated;
