import type {
  AppSupabaseClient as SupabaseClient,
  Tables,
} from "../types";
import { getRemoteUserId, getResponseError } from "./shared";
import type {
  RemoteGroupChatMessage,
  RemoteGroupChatPage,
} from "./types";

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

const GROUP_CHAT_IMAGE_BUCKET = "group-chat-images";

const GROUP_CHAT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const GROUP_CHAT_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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
    messages: await signRemoteGroupChatImages(supabase, messages),
  } satisfies RemoteGroupChatPage;
}

export async function sendRemoteGroupChatMessage({
  body,
  groupId,
  imagePath = null,
  replyToId = null,
}: {
  body?: string;
  groupId: string;
  imagePath?: string | null;
  replyToId?: string | null;
}) {
  const trimmedBody = body?.trim() ?? "";

  if (!trimmedBody && !imagePath) return;

  const response = await fetch("/api/groups/messages", {
    body: JSON.stringify({
      body: trimmedBody,
      groupId,
      imagePath,
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

export async function uploadRemoteGroupChatImage({
  file,
  groupId,
  supabase,
}: {
  file: File;
  groupId: string;
  supabase: SupabaseClient;
}) {
  const extension = GROUP_CHAT_IMAGE_EXTENSIONS[file.type];

  if (!extension) {
    throw new Error("Choose a JPG, PNG, WebP or GIF image.");
  }

  if (file.size > GROUP_CHAT_IMAGE_MAX_BYTES) {
    throw new Error("Photos must be 8 MB or smaller.");
  }

  const userId = await getRemoteUserId();
  if (!userId) throw new Error("Sign in to send photos.");

  const imagePath = `${groupId}/${userId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(GROUP_CHAT_IMAGE_BUCKET)
    .upload(imagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(GROUP_CHAT_IMAGE_BUCKET)
    .createSignedUrl(imagePath, 60 * 60);

  if (signError) {
    await supabase.storage.from(GROUP_CHAT_IMAGE_BUCKET).remove([imagePath]);
    throw signError;
  }

  return { imagePath, imageUrl: data.signedUrl };
}

export async function deleteRemoteGroupChatImage({
  imagePath,
  supabase,
}: {
  imagePath: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.storage
    .from(GROUP_CHAT_IMAGE_BUCKET)
    .remove([imagePath]);

  if (error) throw error;
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
        const message = groupChatMessageFromRow(payload.new as GroupChatRow);
        void signRemoteGroupChatImages(supabase, [message])
          .then(([signedMessage]) => onMessage(signedMessage ?? message))
          .catch(() => onMessage(message));
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

async function signRemoteGroupChatImages(
  supabase: SupabaseClient,
  messages: RemoteGroupChatMessage[],
) {
  const imagePaths = [
    ...new Set(
      messages
        .map((message) => message.imagePath)
        .filter((path): path is string => Boolean(path)),
    ),
  ];

  if (!imagePaths.length) return messages;

  const { data, error } = await supabase.storage
    .from(GROUP_CHAT_IMAGE_BUCKET)
    .createSignedUrls(imagePaths, 60 * 60);

  if (error) return messages;

  const urlsByPath = new Map<string, string>();
  (data ?? []).forEach((item, index) => {
    const path = item.path ?? imagePaths[index];
    if (path && item.signedUrl) urlsByPath.set(path, item.signedUrl);
  });

  return messages.map((message) => ({
    ...message,
    imageUrl: message.imagePath
      ? (urlsByPath.get(message.imagePath) ?? null)
      : null,
  }));
}
