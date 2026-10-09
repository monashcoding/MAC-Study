-- Add-friend search and "People you may know" leave out anyone with a
-- pending friend request either way; they already show in the Requests
-- section. request_direction stays in the result for the client's optimistic
-- updates but is now always null from the server.

create or replace function public.list_friend_candidates_page(
  result_limit integer default 50,
  result_offset integer default 0,
  search_query text default null
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
  with query as (
    select nullif(lower(left(btrim(coalesce(search_query, '')), 64)), '') as term
  ),
  page as (
    select candidate.*
    from public.profiles candidate
    cross join query
    where candidate.id <> auth.uid()
      and candidate.is_discoverable
      and not exists (
        select 1
        from public.friendships friendship
        where friendship.user_id = auth.uid()
          and friendship.friend_id = candidate.id
      )
      and not exists (
        select 1
        from public.friend_requests request
        where request.status = 'pending'
          and (
            (request.sender_id = auth.uid() and request.recipient_id = candidate.id)
            or
            (request.sender_id = candidate.id and request.recipient_id = auth.uid())
          )
      )
      and (
        query.term is null
        or strpos(lower(coalesce(candidate.username, '')), ltrim(query.term, '@')) > 0
        or strpos(lower(coalesce(candidate.display_name, '')), query.term) > 0
      )
    order by
      candidate.display_name nulls last,
      candidate.username nulls last,
      candidate.id
    limit least(greatest(coalesce(result_limit, 50), 1), 100)
    offset greatest(coalesce(result_offset, 0), 0)
  )
  select
    page.id,
    page.display_name,
    page.username,
    page.avatar_url,
    page.study_icon,
    page.profile_color,
    (
      select count(*)
      from public.friendships mine
      join public.friendships theirs
        on theirs.friend_id = mine.friend_id
      where mine.user_id = auth.uid()
        and theirs.user_id = page.id
    ),
    null::text
  from page
  order by
    page.display_name nulls last,
    page.username nulls last,
    page.id;
$$;

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
      and not exists (
        select 1
        from public.friend_requests request
        where request.status = 'pending'
          and (
            (request.sender_id = auth.uid() and request.recipient_id = candidate.id)
            or
            (request.sender_id = candidate.id and request.recipient_id = auth.uid())
          )
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
    null::text
  from ranked
  order by
    ranked.mutual_count desc,
    ranked.display_name nulls last,
    ranked.username nulls last,
    ranked.id;
$$;

notify pgrst, 'reload schema';
