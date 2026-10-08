-- "People you may know": friends of your friends, ranked by mutual friends.
-- Starts from your own friendships rather than every profile, so the work
-- scales with your friends' friends, not with the number of users.

create or replace function public.list_friend_suggestions(
  result_limit integer default 10
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  study_icon text,
  profile_color text,
  mutual_friend_count bigint,
  request_direction text
)
language sql
security definer
set search_path = public
stable
as $$
  with mutuals as (
    select theirs.user_id as candidate_id, count(*) as mutual_count
    from public.friendships mine
    join public.friendships theirs
      on theirs.friend_id = mine.friend_id
    where mine.user_id = auth.uid()
      and theirs.user_id <> auth.uid()
    group by theirs.user_id
  ),
  ranked as (
    select candidate.*, mutuals.mutual_count
    from mutuals
    join public.profiles candidate on candidate.id = mutuals.candidate_id
    where candidate.is_discoverable
      and candidate.access_status = 'active'
      and not exists (
        select 1
        from public.friendships friendship
        where friendship.user_id = auth.uid()
          and friendship.friend_id = candidate.id
      )
    order by
      mutuals.mutual_count desc,
      candidate.display_name nulls last,
      candidate.username nulls last,
      candidate.id
    limit least(greatest(coalesce(result_limit, 10), 1), 25)
  )
  select
    ranked.id,
    ranked.display_name,
    ranked.username,
    ranked.avatar_url,
    ranked.study_icon,
    ranked.profile_color,
    ranked.mutual_count,
    pending.direction
  from ranked
  left join lateral (
    select
      case
        when request.sender_id = auth.uid() then 'outgoing'
        else 'incoming'
      end as direction
    from public.friend_requests request
    where request.status = 'pending'
      and (
        (request.sender_id = auth.uid() and request.recipient_id = ranked.id)
        or
        (request.sender_id = ranked.id and request.recipient_id = auth.uid())
      )
    order by request.created_at desc
    limit 1
  ) pending on true
  order by
    ranked.mutual_count desc,
    ranked.display_name nulls last,
    ranked.username nulls last,
    ranked.id;
$$;

revoke all on function public.list_friend_suggestions(integer) from public;
grant execute on function public.list_friend_suggestions(integer) to authenticated;

notify pgrst, 'reload schema';
