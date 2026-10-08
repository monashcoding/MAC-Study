import type { AppSupabaseClient as SupabaseClient, Tables } from "../types";
import { getResponseError } from "./shared";
import type { RemoteGroupChatMessage, RemoteGroupChatPage } from "./types";

type GroupChatRow = Pick<
  Tables<"group_chat_messages">,
  | "body"
  | "created_at"
  | "group_id"
  | "id"
  | "image_path"
  | "reply_to_id"
  | "user_id"
>;

export async function fetchRemoteGroupChatMessages(
  supabase: SupabaseClient,
  groupId: string,
  options: { before?: string; limit?: number } = {},
) {
  const pageSize = Math.min(Math.max(options.limit ?? 50, 1), 100);
  let query = supabase
    .from("group_chat_messages")
    .select("id, group_id, user_id, body, image_path, reply_to_id, created_at")
    .eq("group_id", groupId)
    .is("deleted_at", null);

  if (options.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(pageSize + 1);

  if (error) throw error;

  const rows = (data ?? []) as GroupChatRow[];

  const messages = rows
    .slice(0, pageSize)
    .map(groupChatMessageFromRow)
    .reverse();

  return {
    hasMore: rows.length > pageSize,
    messages,
  } satisfies RemoteGroupChatPage;
}

export async function sendRemoteGroupChatMessage({
  body,
  groupId,
  replyToId = null,
}: {
  body?: string;
  groupId: string;
  replyToId?: string | null;
}) {
  const trimmedBody = body?.trim() ?? "";

  if (!trimmedBody) return;

  const response = await fetch("/api/groups/messages", {
    body: JSON.stringify({
      body: trimmedBody,
      groupId,
      replyToId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await getResponseError(response));
  }

  const result = (await response.json()) as { messageId?: string };
  return result.messageId ?? null;
}

export async function deleteRemoteGroupChatMessage({
  messageId,
  supabase,
}: {
  messageId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("delete_group_chat_message", {
    target_message_id: messageId,
  });

  if (error) throw error;
}

export async function reportRemoteGroupChatMessage({
  messageId,
  supabase,
}: {
  messageId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("report_group_chat_message", {
    target_message_id: messageId,
  });

  if (error) throw error;
}

export function subscribeToRemoteGroupChat(
  supabase: SupabaseClient,
  groupId: string,
  onMessage: (message: RemoteGroupChatMessage) => void,
) {
  const channel = supabase
    .channel(`mac-study-chat-${groupId}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        filter: `group_id=eq.${groupId}`,
        schema: "public",
        table: "group_chat_messages",
      },
      (payload) => {
        onMessage(groupChatMessageFromRow(payload.new as GroupChatRow));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

function groupChatMessageFromRow(row: GroupChatRow): RemoteGroupChatMessage {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    body: row.body ?? "",
    createdAt: row.created_at,
    imagePath: row.image_path,
    imageUrl: null,
    replyToId: row.reply_to_id,
  };
}
