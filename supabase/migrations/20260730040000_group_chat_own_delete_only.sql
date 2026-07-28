-- Group chat messages may only be deleted by their sender.

create or replace function public.delete_group_chat_message(
  target_message_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.group_chat_messages
  set deleted_at = now()
  where id = target_message_id
    and user_id = auth.uid()
    and deleted_at is null;

  if not found then
    raise exception 'Message not found or you cannot delete it';
  end if;

  return true;
end;
$$;

revoke all on function public.delete_group_chat_message(uuid) from public;
grant execute on function public.delete_group_chat_message(uuid)
to authenticated;

notify pgrst, 'reload schema';
