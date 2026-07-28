import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerStudySession } from "@/lib/auth/server-session";
import { sendWebPush } from "@/lib/push/send-web-push";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  friendId: z.string().uuid(),
});

type DirectMessageRow = {
  body: string;
  created_at: string;
  id: string;
  read_at: string | null;
  recipient_id: string;
  sender_id: string;
};

export async function POST(request: Request) {
  const [supabase, session] = await Promise.all([
    createSupabaseServerClient(),
    getServerStudySession(),
  ]);

  if (!supabase || !session) {
    return NextResponse.json(
      { message: "Sign in to send messages." },
      { status: 401 },
    );
  }

  const parsed = messageSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success || parsed.data.friendId === session.sub) {
    return NextResponse.json(
      { message: "Enter a valid message for a friend." },
      { status: 400 },
    );
  }

  const { body, friendId } = parsed.data;
  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      body,
      recipient_id: friendId,
      sender_id: session.sub,
    })
    .select("id, sender_id, recipient_id, body, created_at, read_at")
    .single<DirectMessageRow>();

  if (error || !data) {
    return NextResponse.json(
      { message: "Messages can only be sent to accepted friends." },
      { status: 403 },
    );
  }

  const notifications = await sendDirectMessageNotification({
    body,
    friendId,
    messageId: data.id,
    senderId: session.sub,
  });

  return NextResponse.json({
    message: {
      body: data.body,
      createdAt: data.created_at,
      id: data.id,
      readAt: data.read_at,
      recipientId: data.recipient_id,
      senderId: data.sender_id,
    },
    notifications,
    ok: true,
  });
}

async function sendDirectMessageNotification({
  body,
  friendId,
  messageId,
  senderId,
}: {
  body: string;
  friendId: string;
  messageId: string;
  senderId: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) return { recipients: 0, sent: 0 };

  const [preferenceResult, senderResult] = await Promise.all([
    admin
      .from("user_notification_preferences")
      .select("other_notifications")
      .eq("user_id", friendId)
      .maybeSingle<{ other_notifications: boolean }>(),
    admin
      .from("profiles")
      .select("display_name, username")
      .eq("id", senderId)
      .maybeSingle<{
        display_name: string | null;
        username: string | null;
      }>(),
  ]);

  if (preferenceResult.data?.other_notifications === false) {
    return { recipients: 0, sent: 0 };
  }

  const senderName =
    senderResult.data?.display_name?.trim() ||
    senderResult.data?.username?.trim() ||
    "A friend";
  const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  const title = `New message from ${senderName}`;
  const { data: notification } = await admin
    .from("app_notifications")
    .insert({
      actor_id: senderId,
      body: preview,
      entity_id: senderId,
      title,
      type: "other",
      user_id: friendId,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  const delivery = await sendWebPush({
    body: preview,
    category: "other",
    tag: notification?.id
      ? `mac-study-${notification.id}`
      : `mac-study-direct-message-${messageId}`,
    title,
    url: `/app/friends?tab=messages&message=${encodeURIComponent(senderId)}`,
    userId: friendId,
  });

  if (delivery.sent > 0 && notification?.id) {
    await admin
      .from("app_notifications")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", notification.id);
  }

  return { recipients: 1, sent: delivery.sent };
}
