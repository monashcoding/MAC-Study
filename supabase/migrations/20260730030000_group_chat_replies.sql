alter table public.group_chat_messages
  add column if not exists reply_to_id uuid
  references public.group_chat_messages(id)
  on delete set null;

create index if not exists group_chat_messages_reply_to_id_idx
  on public.group_chat_messages (reply_to_id)
  where reply_to_id is not null;

create or replace function public.enforce_group_chat_reply_target()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_group_id uuid;
begin
  if new.reply_to_id is null then
    return new;
  end if;

  if new.reply_to_id = new.id then
    raise exception 'A group message cannot reply to itself.';
  end if;

  select message.group_id
  into target_group_id
  from public.group_chat_messages as message
  where message.id = new.reply_to_id
    and message.deleted_at is null;

  if target_group_id is null or target_group_id <> new.group_id then
    raise exception 'Reply target must be an active message in the same group.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_group_chat_reply_target_trigger
  on public.group_chat_messages;

create trigger enforce_group_chat_reply_target_trigger
before insert or update of group_id, reply_to_id
on public.group_chat_messages
for each row
execute function public.enforce_group_chat_reply_target();

notify pgrst, 'reload schema';

comment on column public.group_chat_messages.reply_to_id is
'Optional message in the same group that this message replies to.';
