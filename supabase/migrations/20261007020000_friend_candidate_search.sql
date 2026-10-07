-- Add an optional server-side search to the paged friend candidate list.
-- Matches username or display name, case-insensitive, as a plain substring
-- (strpos instead of LIKE so % and _ in the query are literal).
drop function if exists public.list_friend_candidates_page(integer, integer);

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
  )
  select
    candidate.id,
    candidate.display_name,
    candidate.username,
    candidate.avatar_url,
    candidate.study_icon,
    candidate.profile_color,
    (
      select count(*)
      from public.friendships mine
      join public.friendships theirs
        on theirs.friend_id = mine.friend_id
      where mine.user_id = auth.uid()
        and theirs.user_id = candidate.id
    ),
    pending.direction
  from public.profiles candidate
  cross join query
  left join lateral (
    select
      case
        when request.sender_id = auth.uid() then 'outgoing'
        else 'incoming'
      end as direction
    from public.friend_requests request
    where request.status = 'pending'
      and (
        (request.sender_id = auth.uid() and request.recipient_id = candidate.id)
        or
        (request.sender_id = candidate.id and request.recipient_id = auth.uid())
      )
    order by request.created_at desc
    limit 1
  ) pending on true
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
    7 desc,
    candidate.display_name nulls last,
    candidate.username nulls last,
    candidate.id
  limit least(greatest(coalesce(result_limit, 50), 1), 100)
  offset greatest(coalesce(result_offset, 0), 0);
$$;

revoke all on function public.list_friend_candidates_page(integer, integer, text)
from public;
grant execute on function public.list_friend_candidates_page(integer, integer, text)
to authenticated;

notify pgrst, 'reload schema';
