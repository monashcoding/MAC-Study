-- Blocks obvious chat spam. Runs as a trigger (not just in the API routes)
-- because signed-in clients can insert into these tables directly through
-- the Data API. Limits are per sender, per table:
--   * at most 6 messages in any 10 seconds (burst)
--   * at most 30 messages in any minute (sustained flood)
--   * the same text at most twice in a minute (copy-paste spam)
-- Errors carry a machine-readable prefix the routes turn into a 429.

create index if not exists direct_messages_sender_created_idx
on public.direct_messages (sender_id, created_at desc);

create index if not exists group_chat_messages_user_created_idx
on public.group_chat_messages (user_id, created_at desc);

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_sender_id uuid;
  normalized_body text := lower(trim(new.body));
  burst_count integer;
  oldest_burst_at timestamptz;
  minute_count integer;
  oldest_minute_at timestamptz;
  duplicate_count integer;
  retry_after_seconds integer;
begin
  if tg_table_name = 'direct_messages' then
    current_sender_id := new.sender_id;
  else
    current_sender_id := new.user_id;
  end if;

  -- Serialize one sender's inserts so parallel requests can't slip past
  -- the counts together.
  perform pg_advisory_xact_lock(
    hashtext(tg_table_name),
    hashtext(current_sender_id::text)
  );

  if tg_table_name = 'direct_messages' then
    select
      (count(*) filter (
        where created_at > clock_timestamp() - interval '10 seconds'
      ))::integer,
      min(created_at) filter (
        where created_at > clock_timestamp() - interval '10 seconds'
      ),
      count(*)::integer,
      min(created_at),
      (count(*) filter (where lower(trim(body)) = normalized_body))::integer
    into burst_count, oldest_burst_at, minute_count, oldest_minute_at,
      duplicate_count
    from public.direct_messages
    where sender_id = current_sender_id
      and created_at > clock_timestamp() - interval '1 minute';
  else
    select
      (count(*) filter (
        where created_at > clock_timestamp() - interval '10 seconds'
      ))::integer,
      min(created_at) filter (
        where created_at > clock_timestamp() - interval '10 seconds'
      ),
      count(*)::integer,
      min(created_at),
      (count(*) filter (where lower(trim(body)) = normalized_body))::integer
    into burst_count, oldest_burst_at, minute_count, oldest_minute_at,
      duplicate_count
    from public.group_chat_messages
    where user_id = current_sender_id
      and created_at > clock_timestamp() - interval '1 minute';
  end if;

  if duplicate_count >= 2 then
    raise exception 'MESSAGE_DUPLICATE';
  end if;

  if burst_count >= 6 then
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (
        oldest_burst_at + interval '10 seconds' - clock_timestamp()
      )))::integer
    );
    raise exception 'MESSAGE_RATE_LIMIT:%', retry_after_seconds;
  end if;

  if minute_count >= 30 then
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (
        oldest_minute_at + interval '1 minute' - clock_timestamp()
      )))::integer
    );
    raise exception 'MESSAGE_RATE_LIMIT:%', retry_after_seconds;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_message_rate_limit()
from public, anon, authenticated;

drop trigger if exists direct_messages_rate_limit on public.direct_messages;
create trigger direct_messages_rate_limit
before insert on public.direct_messages
for each row execute function public.enforce_message_rate_limit();

drop trigger if exists group_chat_messages_rate_limit
on public.group_chat_messages;
create trigger group_chat_messages_rate_limit
before insert on public.group_chat_messages
for each row execute function public.enforce_message_rate_limit();
