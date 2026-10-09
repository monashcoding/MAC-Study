-- Adds friend_request_id to the unit class list so an incoming friend
-- request can be accepted from the Units page. Recreates the function in
-- full, so it applies whether or not the previous migration already had it.

drop function if exists public.get_unit_cohort_page(uuid, text, boolean, integer, integer);

create function public.get_unit_cohort_page(
  input_offering_id uuid,
  search_query text default null,
  friends_only boolean default false,
  result_limit integer default 30,
  result_offset integer default 0
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  profile_color text,
  study_icon text,
  is_friend boolean,
  mutual_friend_count bigint,
  shared_group_ids uuid[],
  friend_request_direction text,
  friend_request_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with query as (
    select nullif(lower(left(btrim(coalesce(search_query, '')), 64)), '') as term
  ),
  members as (
    select
      profile.id,
      profile.display_name,
      profile.username,
      profile.profile_color,
      profile.study_icon,
      exists (
        select 1
        from public.friendships
        where friendships.user_id = auth.uid()
          and friendships.friend_id = profile.id
      ) as is_friend
    from public.unit_enrolments as enrolment
    join public.profiles as profile on profile.id = enrolment.user_id
    cross join query
    where public.is_active_mac_member(auth.uid())
      -- Only students enrolled in this offering can list its class.
      and exists (
        select 1
        from public.unit_enrolments mine
        where mine.offering_id = input_offering_id
          and mine.user_id = auth.uid()
          and mine.left_at is null
      )
      and enrolment.offering_id = input_offering_id
      and enrolment.left_at is null
      and enrolment.user_id <> auth.uid()
      and profile.access_status = 'active'
      and (
        query.term is null
        or strpos(lower(coalesce(profile.username, '')), ltrim(query.term, '@')) > 0
        or strpos(lower(coalesce(profile.display_name, '')), query.term) > 0
      )
  ),
  page as (
    select *
    from members
    where not coalesce(friends_only, false) or members.is_friend
    order by
      members.is_friend desc,
      members.display_name nulls last,
      members.username nulls last,
      members.id
    limit least(greatest(coalesce(result_limit, 30), 1), 100)
    offset greatest(coalesce(result_offset, 0), 0)
  )
  select
    page.id,
    page.display_name,
    page.username,
    page.profile_color,
    page.study_icon,
    page.is_friend,
    (
      select count(*)
      from public.friendships mine
      join public.friendships theirs
        on theirs.friend_id = mine.friend_id
      where mine.user_id = auth.uid()
        and theirs.user_id = page.id
    ),
    coalesce(
      array(
        select viewer.group_id
        from public.group_members as viewer
        join public.group_members as peer
          on peer.group_id = viewer.group_id
        where viewer.user_id = auth.uid()
          and viewer.status = 'active'
          and peer.user_id = page.id
          and peer.status = 'active'
        order by viewer.group_id
      ),
      '{}'::uuid[]
    ),
    pending.direction,
    pending.id
  from page
  left join lateral (
    select
      request.id,
      case
        when request.sender_id = auth.uid() then 'outgoing'
        else 'incoming'
      end as direction
    from public.friend_requests as request
    where not page.is_friend
      and request.status = 'pending'
      and (
        (request.sender_id = auth.uid() and request.recipient_id = page.id)
        or (request.sender_id = page.id and request.recipient_id = auth.uid())
      )
    order by request.created_at desc
    limit 1
  ) as pending on true
  order by
    page.is_friend desc,
    page.display_name nulls last,
    page.username nulls last,
    page.id;
$$;

revoke all on function public.get_unit_cohort_page(uuid, text, boolean, integer, integer)
from public;
grant execute on function public.get_unit_cohort_page(uuid, text, boolean, integer, integer)
to authenticated;

notify pgrst, 'reload schema';
