import type {
  AppSupabaseClient as SupabaseClient,
  Database,
  Tables,
} from "../types";
import { getRemoteUserId } from "./shared";
import { invalidateRemoteCachesForTable } from "@/lib/client-cache";
import type {
  RemoteAppNotification,
  RemoteGroupNotificationSettings,
  RemoteNotificationPreferences,
  RemoteNudgeDelivery,
  RemoteNudgeNotification,
} from "./types";

type NotificationPreferencesRow =
  Database["public"]["Functions"]["get_notification_preferences"]["Returns"][number];

type AppNotificationRow = Omit<
  Pick<
    Tables<"app_notifications">,
    "body" | "created_at" | "entity_id" | "id" | "title" | "type"
  >,
  "type"
> & { type: "friend_accepted" | "friend_request" | "other" };

type NudgeRow = Pick<
  Tables<"nudges">,
  "created_at" | "group_id" | "id" | "message" | "recipient_id" | "sender_id"
>;

export function getNudgeDeliveryMessage(delivery: RemoteNudgeDelivery) {
  if (delivery.sent > 0) {
    return "Nudge delivered.";
  }

  if (delivery.skipped === "no_subscriptions") {
    return "They need to enable nudge notifications.";
  }

  if (delivery.skipped === "disabled") {
    return "They have nudge notifications muted.";
  }

  if (delivery.skipped === "push_not_configured") {
    return "Push notifications are not configured.";
  }

  return "Push delivery is unavailable.";
}

export async function fetchRemoteGroupNotificationSettings({
  groupId,
  supabase,
}: {
  groupId: string;
  supabase: SupabaseClient;
}): Promise<RemoteGroupNotificationSettings> {
  const userId = await getRemoteUserId();
  if (!userId) return { chatMuted: false, nudgesMuted: false };

  const { data, error } = await supabase
    .from("user_group_notification_settings")
    .select("chat_muted, nudges_muted")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .maybeSingle<{ chat_muted: boolean; nudges_muted: boolean }>();

  if (error) throw error;

  return {
    chatMuted: data?.chat_muted ?? false,
    nudgesMuted: data?.nudges_muted ?? false,
  };
}

export async function saveRemoteGroupNotificationSettings({
  groupId,
  settings,
  supabase,
}: {
  groupId: string;
  settings: RemoteGroupNotificationSettings;
  supabase: SupabaseClient;
}) {
  const userId = await getRemoteUserId();
  if (!userId) return;

  const { error } = await supabase
    .from("user_group_notification_settings")
    .upsert(
      {
        chat_muted: settings.chatMuted,
        group_id: groupId,
        nudges_muted: settings.nudgesMuted,
        updated_at: new Date().toISOString(),
        user_id: userId,
      },
      { onConflict: "user_id,group_id" },
    );

  if (error) throw error;
}

export async function fetchRemoteUserNudgeMute({
  groupId,
  supabase,
  userId,
}: {
  groupId: string | null;
  supabase: SupabaseClient;
  userId: string;
}) {
  const currentUserId = await getRemoteUserId();
  if (!currentUserId) return false;

  let query = supabase
    .from("user_nudge_mutes")
    .select("muted_user_id")
    .eq("user_id", currentUserId)
    .eq("muted_user_id", userId);
  query = groupId ? query.eq("group_id", groupId) : query.is("group_id", null);

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function fetchRemoteGlobalNudgeMutes({
  supabase,
}: {
  supabase: SupabaseClient;
}) {
  const currentUserId = await getRemoteUserId();
  if (!currentUserId) return [];

  const { data, error } = await supabase
    .from("user_nudge_mutes")
    .select("muted_user_id")
    .eq("user_id", currentUserId)
    .is("group_id", null);

  if (error) throw error;

  return (data ?? []).map((row) => row.muted_user_id as string);
}

export async function setRemoteUserNudgeMute({
  groupId,
  muted,
  supabase,
  userId,
}: {
  groupId: string | null;
  muted: boolean;
  supabase: SupabaseClient;
  userId: string;
}) {
  const currentUserId = await getRemoteUserId();
  if (!currentUserId) return;

  if (muted) {
    const { error } = await supabase.from("user_nudge_mutes").upsert(
      {
        group_id: groupId,
        muted_user_id: userId,
        user_id: currentUserId,
      },
      { onConflict: "user_id,muted_user_id,group_id" },
    );
    if (error) throw error;
    return;
  }

  let query = supabase
    .from("user_nudge_mutes")
    .delete()
    .eq("user_id", currentUserId)
    .eq("muted_user_id", userId);
  query = groupId ? query.eq("group_id", groupId) : query.is("group_id", null);

  const { error } = await query;

  if (error) throw error;
}

export async function fetchRemoteNotificationPreferences(
  supabase: SupabaseClient,
): Promise<RemoteNotificationPreferences> {
  const { data, error } = await supabase.rpc("get_notification_preferences");

  if (error) throw error;

  const row = ((data ?? []) as NotificationPreferencesRow[])[0];

  return row
    ? notificationPreferencesFromRow(row)
    : {
        friendNotifications: true,
        nudgeNotifications: true,
        otherNotifications: true,
      };
}

export async function updateRemoteNotificationPreferences({
  preferences,
  supabase,
}: {
  preferences: RemoteNotificationPreferences;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase.rpc("update_notification_preferences", {
    next_friend_notifications: preferences.friendNotifications,
    next_nudge_notifications: preferences.nudgeNotifications,
    next_other_notifications: preferences.otherNotifications,
  });

  if (error) throw error;
}

export async function sendRemoteNudge({
  groupId = null,
  recipientId,
}: {
  groupId?: string | null;
  recipientId: string;
}) {
  const response = await fetch("/api/nudges", {
    body: JSON.stringify({ groupId, recipientId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const body = (await response.json().catch(() => null)) as {
    message?: string;
    push?: RemoteNudgeDelivery;
  } | null;

  if (!response.ok) {
    throw new Error(body?.message ?? "Nudge failed.");
  }

  return body?.push ?? { sent: 0, skipped: "subscriptions_unavailable" };
}

export function subscribeToRemoteNudges(
  supabase: SupabaseClient,
  recipientId: string,
  onNudge: (nudge: RemoteNudgeNotification) => void,
) {
  const channel = supabase
    .channel(
      `mac-study-nudges-${recipientId}-${Math.random().toString(36).slice(2)}`,
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        filter: `recipient_id=eq.${recipientId}`,
        schema: "public",
        table: "nudges",
      },
      (payload) => {
        onNudge(nudgeFromRow(payload.new as NudgeRow));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToRemoteAppNotifications(
  supabase: SupabaseClient,
  userId: string,
  onNotification: (notification: RemoteAppNotification) => void,
) {
  const channel = supabase
    .channel(
      `mac-study-notifications-${userId}-${Math.random().toString(36).slice(2)}`,
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        filter: `user_id=eq.${userId}`,
        schema: "public",
        table: "app_notifications",
      },
      (payload) =>
        onNotification(
          appNotificationFromRow(payload.new as AppNotificationRow),
        ),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function markRemoteAppNotificationRead({
  notificationId,
  supabase,
}: {
  notificationId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await supabase
    .from("app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);

  if (error) throw error;
}

const REALTIME_BATCH_MS = 750;

export function subscribeToRemoteAppChanges(
  supabase: SupabaseClient,
  onChange?: (table: string) => void,
) {
  // Realtime events arrive in bursts (one session start can touch several
  // rows and tables). Collect them briefly and refetch once per table.
  const pendingTables = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    flushTimer = null;
    const tables = [...pendingTables];
    pendingTables.clear();
    tables.forEach((table) => {
      invalidateRemoteCachesForTable(table);
      onChange?.(table);
    });
  };
  const handleChange = (table: string) => {
    pendingTables.add(table);
    flushTimer ??= setTimeout(flush, REALTIME_BATCH_MS);
  };

  const channel = supabase
    .channel(`mac-study-app-data-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "study_sessions" },
      () => handleChange("study_sessions"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_members" },
      () => handleChange("group_members"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friendships" },
      () => handleChange("friendships"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friend_requests" },
      () => handleChange("friend_requests"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "direct_messages" },
      () => handleChange("direct_messages"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_invites" },
      () => handleChange("group_invites"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_notifications" },
      () => handleChange("app_notifications"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_chat_messages" },
      () => handleChange("group_chat_messages"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "groups" },
      () => handleChange("groups"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "nudges" },
      () => handleChange("nudges"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "subjects" },
      () => handleChange("subjects"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "unit_enrolments" },
      () => handleChange("unit_enrolments"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "special_units" },
      () => handleChange("special_units"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "special_unit_aliases" },
      () => handleChange("special_unit_aliases"),
    )
    .subscribe();

  return () => {
    if (flushTimer) clearTimeout(flushTimer);
    void supabase.removeChannel(channel);
  };
}

function nudgeFromRow(row: NudgeRow): RemoteNudgeNotification {
  return {
    id: row.id,
    createdAt: row.created_at,
    groupId: row.group_id,
    message: row.message || "Someone woke you up!",
    senderId: row.sender_id,
  };
}

function notificationPreferencesFromRow(
  row: NotificationPreferencesRow,
): RemoteNotificationPreferences {
  return {
    friendNotifications: row.friend_notifications,
    nudgeNotifications: row.nudge_notifications,
    otherNotifications: row.other_notifications,
  };
}

function appNotificationFromRow(
  row: AppNotificationRow,
): RemoteAppNotification {
  return {
    body: row.body,
    createdAt: row.created_at,
    entityId: row.entity_id,
    id: row.id,
    title: row.title,
    type: row.type,
  };
}

export async function fetchRemoteMessageMutes({
  supabase,
}: {
  supabase: SupabaseClient;
}) {
  const currentUserId = await getRemoteUserId();
  if (!currentUserId) return [];

  const { data, error } = await supabase
    .from("user_message_mutes")
    .select("muted_user_id")
    .eq("user_id", currentUserId);

  if (error) throw error;

  return (data ?? []).map((row) => row.muted_user_id);
}

export async function setRemoteMessageMute({
  muted,
  supabase,
  userId,
}: {
  muted: boolean;
  supabase: SupabaseClient;
  userId: string;
}) {
  const currentUserId = await getRemoteUserId();
  if (!currentUserId) return;

  const { error } = muted
    ? await supabase
        .from("user_message_mutes")
        .upsert(
          { muted_user_id: userId, user_id: currentUserId },
          { ignoreDuplicates: true, onConflict: "user_id,muted_user_id" },
        )
    : await supabase
        .from("user_message_mutes")
        .delete()
        .eq("user_id", currentUserId)
        .eq("muted_user_id", userId);

  if (error) throw error;
}
