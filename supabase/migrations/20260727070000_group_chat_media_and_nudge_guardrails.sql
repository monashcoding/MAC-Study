-- Private group-chat images and less disruptive nudging.

alter table public.group_chat_messages
alter column body drop not null;

alter table public.group_chat_messages
add column if not exists image_path text;

alter table public.group_chat_messages
drop constraint if exists group_chat_message_body_length;

alter table public.group_chat_messages
drop constraint if exists group_chat_message_content_required;

alter table public.group_chat_messages
add constraint group_chat_message_content_required
check (
  (
    body is not null
    and char_length(trim(body)) between 1 and 2000
  )
  or image_path is not null
);

alter table public.group_chat_messages
drop constraint if exists group_chat_message_image_path_matches_sender;

alter table public.group_chat_messages
add constraint group_chat_message_image_path_matches_sender
check (
  image_path is null
  or image_path like group_id::text || '/' || user_id::text || '/%'
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'group-chat-images',
  'group-chat-images',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "group members can view chat images"
on storage.objects;

create policy "group members can view chat images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'group-chat-images'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/]+$'
  and public.is_group_member(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists "group members can upload own chat images"
on storage.objects;

create policy "group members can upload own chat images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'group-chat-images'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/]+$'
  and ((storage.foldername(name))[2])::uuid = auth.uid()
  and public.is_group_member(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists "senders and moderators can delete chat images"
on storage.objects;

create policy "senders and moderators can delete chat images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'group-chat-images'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/]+$'
  and (
    ((storage.foldername(name))[2])::uuid = auth.uid()
    or public.can_manage_group_members(
      ((storage.foldername(name))[1])::uuid
    )
  )
);

alter table public.groups
alter column nudge_cooldown_seconds set default 60;

update public.groups
set nudge_cooldown_seconds = 60
where nudge_cooldown_seconds = 600;

create index if not exists study_sessions_active_recipient_idx
on public.study_sessions (user_id)
where ended_at is null
  and deleted_at is null
  and status = 'active';

create or replace function public.send_nudge(
  target_user_id uuid,
  target_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_sender_id uuid := auth.uid();
  daily_nudge_count integer;
  oldest_recent_nudge_at timestamptz;
  recent_nudge_count integer;
  retry_after_seconds integer;
  sender_name text;
  nudge_id uuid;
begin
  if current_sender_id is null then
    raise exception 'Sign in to send nudges.';
  end if;

  if target_user_id = current_sender_id then
    raise exception 'You cannot nudge yourself.';
  end if;

  if exists (
    select 1
    from public.study_sessions
    where user_id = target_user_id
      and ended_at is null
      and deleted_at is null
      and status = 'active'
  ) then
    raise exception 'RECIPIENT_STUDYING';
  end if;

  if target_group_id is not null then
    if not exists (
      select 1
      from public.group_members
      where group_id = target_group_id
        and user_id = current_sender_id
        and status = 'active'
    ) then
      raise exception 'You are not in this group.';
    end if;

    if not exists (
      select 1
      from public.group_members
      where group_id = target_group_id
        and user_id = target_user_id
        and status = 'active'
    ) then
      raise exception 'This person is not in this group.';
    end if;
  elsif not public.is_friend(target_user_id) then
    raise exception 'You can only nudge friends.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(current_sender_id::text),
    hashtext(target_user_id::text)
  );

  select
    (
      count(*) filter (
        where created_at > clock_timestamp() - interval '1 minute'
      )
    )::integer,
    min(created_at) filter (
      where created_at > clock_timestamp() - interval '1 minute'
    ),
    count(*)::integer
  into recent_nudge_count, oldest_recent_nudge_at, daily_nudge_count
  from public.nudges
  where sender_id = current_sender_id
    and recipient_id = target_user_id
    and created_at > clock_timestamp() - interval '24 hours';

  if recent_nudge_count >= 1 then
    retry_after_seconds := greatest(
      1,
      ceil(
        extract(
          epoch from (
            oldest_recent_nudge_at + interval '1 minute' - clock_timestamp()
          )
        )
      )::integer
    );

    raise exception 'NUDGE_RATE_LIMIT:%', retry_after_seconds;
  end if;

  if daily_nudge_count >= 250 then
    raise exception 'NUDGE_DAILY_LIMIT';
  end if;

  select coalesce(
    nullif(trim(display_name), ''),
    nullif(trim(username), ''),
    'Someone'
  )
  into sender_name
  from public.profiles
  where id = current_sender_id;

  insert into public.nudges (
    group_id,
    sender_id,
    recipient_id,
    message
  )
  values (
    target_group_id,
    current_sender_id,
    target_user_id,
    sender_name || ' woke you up!'
  )
  returning id into nudge_id;

  return nudge_id;
end;
$$;

grant execute
on function public.send_nudge(uuid, uuid)
to authenticated, service_role;

notify pgrst, 'reload schema';

comment on column public.group_chat_messages.image_path is
'Private storage path for an optional image attached to a group message.';

comment on function public.send_nudge(uuid, uuid) is
'Creates at most one nudge per minute per sender/recipient and blocks nudges while the recipient is studying.';
