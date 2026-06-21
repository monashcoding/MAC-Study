create or replace function public.get_unit_cohort(input_offering_id uuid)
returns table (
  user_id uuid,
  display_name text,
  username text,
  profile_color text,
  study_icon text,
  is_friend boolean,
  shared_group_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.id,
    profile.display_name,
    profile.username,
    profile.profile_color,
    profile.study_icon,
    exists (
      select 1
      from public.friendships
      where (
        friendships.user_id = auth.uid()
        and friendships.friend_id = profile.id
      ) or (
        friendships.user_id = profile.id
        and friendships.friend_id = auth.uid()
      )
    ) as is_friend,
    coalesce(
      array(
        select viewer.group_id
        from public.group_members as viewer
        join public.group_members as peer
          on peer.group_id = viewer.group_id
        where viewer.user_id = auth.uid()
          and viewer.status = 'active'
          and peer.user_id = profile.id
          and peer.status = 'active'
        order by viewer.group_id
      ),
      '{}'::uuid[]
    ) as shared_group_ids
  from public.unit_enrolments as enrolment
  join public.profiles as profile on profile.id = enrolment.user_id
  where public.is_active_mac_member(auth.uid())
    and enrolment.offering_id = input_offering_id
    and enrolment.left_at is null
    and enrolment.user_id <> auth.uid()
    and profile.access_status = 'active'
  order by coalesce(profile.display_name, profile.username, profile.id::text);
$$;

grant execute on function public.get_unit_cohort(uuid)
to authenticated, service_role;
