alter table public.profiles
add column if not exists is_discoverable boolean not null default true;

grant select (is_discoverable) on table public.profiles to authenticated;

create or replace function public.set_profile_discoverability(
  next_is_discoverable boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.profiles
  set is_discoverable = coalesce(next_is_discoverable, true)
  where id = auth.uid();

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  return coalesce(next_is_discoverable, true);
end;
$$;

revoke all on function public.set_profile_discoverability(boolean) from public;
grant execute on function public.set_profile_discoverability(boolean)
to authenticated;

create or replace function public.list_friend_candidates()
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
  select
    candidate.id as user_id,
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
    ) as mutual_friend_count,
    pending.direction as request_direction
  from public.profiles candidate
  left join lateral (
    select
      case
        when request.sender_id = auth.uid() then 'outgoing'
        else 'incoming'
      end as direction
    from public.friend_requests request
    where request.status = 'pending'
      and (
        (
          request.sender_id = auth.uid()
          and request.recipient_id = candidate.id
        )
        or
        (
          request.sender_id = candidate.id
          and request.recipient_id = auth.uid()
        )
      )
    order by request.created_at desc
    limit 1
  ) pending on true
  where candidate.id <> auth.uid()
    and coalesce(candidate.is_discoverable, true)
    and not exists (
      select 1
      from public.friendships friendship
      where friendship.user_id = auth.uid()
        and friendship.friend_id = candidate.id
    )
  order by mutual_friend_count desc, candidate.display_name, candidate.username;
$$;

revoke all on function public.list_friend_candidates() from public;
grant execute on function public.list_friend_candidates() to authenticated;

notify pgrst, 'reload schema';
