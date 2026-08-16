-- Efficient unread group-message counts for the signed-in member.

create or replace function public.list_group_chat_unread_counts()
returns table (
  group_id uuid,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    membership.group_id,
    count(message.id)::bigint as unread_count
  from public.group_members as membership
  left join public.group_chat_read_receipts as receipt
    on receipt.group_id = membership.group_id
    and receipt.user_id = membership.user_id
  left join public.group_chat_messages as message
    on message.group_id = membership.group_id
    and message.user_id <> membership.user_id
    and message.deleted_at is null
    and message.created_at > coalesce(
      receipt.last_read_at,
      membership.joined_at
    )
  where membership.user_id = auth.uid()
    and membership.status = 'active'
  group by membership.group_id;
$$;

revoke all on function public.list_group_chat_unread_counts() from public;
grant execute on function public.list_group_chat_unread_counts()
to authenticated;

notify pgrst, 'reload schema';
