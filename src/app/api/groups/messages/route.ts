import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerStudySession } from "@/lib/auth/server-session";
import { getMessageRateLimitError } from "@/lib/message-rate-limit";
import { sendWebPush } from "@/lib/push/send-web-push";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export const runtime = "nodejs";

// Photos were removed from group chat; messages are text only.
const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  groupId: z.string().uuid(),
  replyToId: z.string().uuid().nullable().optional(),
});

type GroupMemberRow = Pick<Tables<"group_members">, "user_id">;

type GroupMuteRow = Pick<Tables<"user_group_notification_settings">, "user_id">;

type NotificationPreferenceRow = Pick<
  Tables<"user_notification_preferences">,
  "other_notifications" | "user_id"
>;

type CreatedNotificationRow = Pick<
  Tables<"app_notifications">,
  "id" | "user_id"
>;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getServerStudySession();

  if (!supabase || !session) {
    return NextResponse.json(
      { message: "Sign in to send group messages." },
      { status: 401 },
    );
  }

  const parsed = messageSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Enter a valid group message." },
      { status: 400 },
    );
  }

  const { body, groupId, replyToId = null } = parsed.data;

  if (replyToId) {
    const { data: replyTarget, error: replyError } = await supabase
      .from("group_chat_messages")
      .select("id")
      .eq("id", replyToId)
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .maybeSingle();

    if (replyError || !replyTarget) {
      return NextResponse.json(
        { message: "That message is no longer available to reply to." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await supabase
    .from("group_chat_messages")
    .insert({
      body,
      group_id: groupId,
      reply_to_id: replyToId,
      user_id: session.sub,
    })
    .select("id")
    .single<{ id: string }>();

  const rateLimit = getMessageRateLimitError(error?.message);
  if (rateLimit) {
    return NextResponse.json(
      { message: rateLimit.message },
      {
        headers: rateLimit.retryAfterSeconds
          ? { "Retry-After": String(rateLimit.retryAfterSeconds) }
          : undefined,
        status: 429,
      },
    );
  }

  if (error || !data) {
    return NextResponse.json(
      { message: "That group message could not be sent." },
      { status: 400 },
    );
  }

  const notifications = await sendGroupMessageNotifications({
    body,
    groupId,
    messageId: data.id,
    senderId: session.sub,
  });

  return NextResponse.json({ messageId: data.id, notifications, ok: true });
}

async function sendGroupMessageNotifications({
  body,
  groupId,
  messageId,
  senderId,
}: {
  body: string;
  groupId: string;
  messageId: string;
  senderId: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) return { recipients: 0, sent: 0 };

  const [groupResult, membersResult, mutesResult, senderResult] =
    await Promise.all([
      admin.from("groups").select("name").eq("id", groupId).maybeSingle(),
      admin
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .eq("status", "active")
        .neq("user_id", senderId),
      admin
        .from("user_group_notification_settings")
        .select("user_id")
        .eq("group_id", groupId)
        .eq("chat_muted", true),
      admin
        .from("profiles")
        .select("username")
        .eq("id", senderId)
        .maybeSingle(),
    ]);
  const mutedIds = new Set(
    ((mutesResult.data ?? []) as GroupMuteRow[]).map((row) => row.user_id),
  );
  const candidateMemberIds = ((membersResult.data ?? []) as GroupMemberRow[])
    .map((row) => row.user_id)
    .filter((userId) => !mutedIds.has(userId));

  if (!candidateMemberIds.length) return { recipients: 0, sent: 0 };

  const { data: preferenceData } = await admin
    .from("user_notification_preferences")
    .select("user_id, other_notifications")
    .in("user_id", candidateMemberIds);
  const disabledIds = new Set(
    ((preferenceData ?? []) as NotificationPreferenceRow[])
      .filter((row) => !row.other_notifications)
      .map((row) => row.user_id),
  );
  const memberIds = candidateMemberIds.filter(
    (userId) => !disabledIds.has(userId),
  );

  if (!memberIds.length) return { recipients: 0, sent: 0 };

  const sender =
    (senderResult.data as { username?: string | null } | null)?.username ??
    "A group member";
  const groupName =
    (groupResult.data as { name?: string | null } | null)?.name ?? "Group chat";
  const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  const notificationBody = `@${sender}: ${preview}`;
  const { data: createdNotificationData } = await admin
    .from("app_notifications")
    .insert(
      memberIds.map((userId) => ({
        actor_id: senderId,
        body: notificationBody,
        entity_id: groupId,
        title: `New message in ${groupName}`,
        type: "other",
        user_id: userId,
      })),
    )
    .select("id, user_id");
  const notificationIdsByUser = new Map(
    ((createdNotificationData ?? []) as CreatedNotificationRow[]).map(
      (notification) => [notification.user_id, notification.id],
    ),
  );

  const deliveries = await Promise.allSettled(
    memberIds.map(async (userId) => {
      const notificationId = notificationIdsByUser.get(userId);
      const delivery = await sendWebPush({
        body: notificationBody,
        category: "other",
        tag: notificationId
          ? `mac-study-${notificationId}`
          : `mac-study-group-message-${messageId}`,
        title: groupName,
        url: `/app/groups?group=${groupId}&view=chat`,
        userId,
      });

      if (delivery.sent > 0 && notificationId) {
        await admin
          .from("app_notifications")
          .update({ delivered_at: new Date().toISOString() })
          .eq("id", notificationId);
      }

      return delivery;
    }),
  );

  return {
    recipients: memberIds.length,
    sent: deliveries.filter(
      (delivery) => delivery.status === "fulfilled" && delivery.value.sent > 0,
    ).length,
  };
}
