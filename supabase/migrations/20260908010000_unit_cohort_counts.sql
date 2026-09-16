create or replace function public.get_my_unit_cohort_counts()
returns table (
  offering_id uuid,
  member_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    viewer.offering_id,
    count(peer.user_id) as member_count
  from public.unit_enrolments as viewer
  join public.unit_enrolments as peer
    on peer.offering_id = viewer.offering_id
    and peer.left_at is null
  join public.profiles as peer_profile
    on peer_profile.id = peer.user_id
    and peer_profile.access_status = 'active'
  where auth.uid() is not null
    and public.is_active_mac_member(auth.uid())
    and viewer.user_id = auth.uid()
    and viewer.left_at is null
  group by viewer.offering_id;
$$;

grant execute on function public.get_my_unit_cohort_counts()
to authenticated, service_role;

comment on function public.get_my_unit_cohort_counts() is
  'Returns active member counts only for unit offerings joined by the signed-in user.';
