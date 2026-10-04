import type { AppSupabaseClient as SupabaseClient } from "./types";
import type { Database, Tables } from "./types";

export type GroupChatReadReceipt = {
  groupId: string;
  lastReadAt: string;
  userId: string;
};

type GroupChatReadReceiptRow = Pick<
  Tables<"group_chat_read_receipts">,
  "group_id" | "last_read_at" | "user_id"
>;

type GroupChatUnreadCountRow =
  Database["public"]["Functions"]["list_group_chat_unread_counts"]["Returns"][number];

export async function fetchGroupChatUnreadCounts(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("list_group_chat_unread_counts");

  if (error) throw error;

  return Object.fromEntries(
    (data ?? []).map((row: GroupChatUnreadCountRow) => [
      row.group_id,
      Number(row.unread_count) || 0,
    ]),
  ) as Record<string, number>;
}

export async function fetchGroupChatReadReceipts(
  supabase: SupabaseClient,
  groupId: string,
) {
  const { data, error } = await supabase
    .from("group_chat_read_receipts")
    .select("group_id, user_id, last_read_at")
    .eq("group_id", groupId);

  if (error) throw error;

  return (data ?? []).map(groupChatReadReceiptFromRow);
}

export async function markGroupChatRead({
  groupId,
  supabase,
  userId,
}: {
  groupId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { data, error } = await supabase.rpc("mark_group_chat_read", {
    target_group_id: groupId,
  });

  if (error) throw error;
  if (typeof data !== "string") return null;

  return {
    groupId,
    lastReadAt: data,
    userId,
  } satisfies GroupChatReadReceipt;
}

export function subscribeToGroupChatReadReceipts(
  supabase: SupabaseClient,
  groupId: string,
  onReceipt: (receipt: GroupChatReadReceipt) => void,
) {
  const channel = supabase
    .channel(
      `mac-study-chat-reads-${groupId}-${Math.random().toString(36).slice(2)}`,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        filter: `group_id=eq.${groupId}`,
        schema: "public",
        table: "group_chat_read_receipts",
      },
      (payload) => {
        const row = payload.new as Partial<GroupChatReadReceiptRow>;

        if (
          typeof row.group_id !== "string" ||
          typeof row.user_id !== "string" ||
          typeof row.last_read_at !== "string"
        ) {
          return;
        }

        onReceipt(groupChatReadReceiptFromRow(row as GroupChatReadReceiptRow));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

function groupChatReadReceiptFromRow(
  row: GroupChatReadReceiptRow,
): GroupChatReadReceipt {
  return {
    groupId: row.group_id,
    lastReadAt: row.last_read_at,
    userId: row.user_id,
  };
}
