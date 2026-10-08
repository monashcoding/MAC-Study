-- Add-friend browsing: order by name and work out mutual friends and
-- pending requests only for the page being returned. The old version
-- counted mutual friends for every discoverable profile on every page and
-- every search, just to sort by them.

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
    pending.direction
  from page
  left join lateral (
    select
      case
        when request.sender_id = auth.uid() then 'outgoing'
        else 'incoming'
      end as direction
    from public.friend_requests request
    where request.status = 'pending'
      and (
        (request.sender_id = auth.uid() and request.recipient_id = page.id)
        or
        (request.sender_id = page.id and request.recipient_id = auth.uid())
      )
    order by request.created_at desc
    limit 1
  ) pending on true
  order by
    page.display_name nulls last,
    page.username nulls last,
    page.id;
$$;

notify pgrst, 'reload schema';
