import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerStudySession } from "@/lib/auth/server-session";
import { sendWebPush } from "@/lib/push/send-web-push";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const inviteSchema = z.object({
  friendId: z.string().uuid(),
  groupId: z.string().uuid(),
});

type GroupNotificationRow = {
  body: string;
  id: string;
  title: string;
  user_id: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getServerStudySession();

  if (!supabase || !session) {
    return NextResponse.json(
      { message: "Sign in to send group invitations." },
      { status: 401 },
    );
  }

  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid group invitation." },
      { status: 400 },
    );
  }

  const { friendId, groupId } = parsed.data;
  const { error } = await supabase.rpc("invite_friend_to_group", {
    target_group_id: groupId,
    target_user_id: friendId,
  });

  if (error) {
    return NextResponse.json(
      { message: getGroupInviteError(error.message) },
      { status: 400 },
    );
  }

  const notification = await getGroupNotification({
    actorId: session.sub,
    groupId,
    userId: friendId,
  });
  const push = notification
    ? await sendGroupInvitePush(notification)
    : { sent: 0 };

  return NextResponse.json({ ok: true, push });
}

async function getGroupNotification({
  actorId,
  groupId,
  userId,
}: {
  actorId: string;
  groupId: string;
  userId: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;

  const { data } = await admin
    .from("app_notifications")
    .select("id, user_id, title, body")
    .eq("actor_id", actorId)
    .eq("entity_id", groupId)
    .eq("type", "other")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<GroupNotificationRow>();

  return data ?? null;
}

async function sendGroupInvitePush(notification: GroupNotificationRow) {
  const delivery = await sendWebPush({
    body: notification.body,
    category: "other",
    tag: `mac-study-${notification.id}`,
    title: notification.title,
    url: "/app/groups",
    userId: notification.user_id,
  });

  if (delivery.sent > 0) {
    const admin = createSupabaseAdminClient();
    await admin
      ?.from("app_notifications")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", notification.id);
  }

  return delivery;
}

function getGroupInviteError(message: string) {
  if (message.includes("leaders and moderators")) {
    return "Only group leaders and moderators can invite members.";
  }

  if (message.includes("Only friends")) {
    return "You can only invite friends.";
  }

  return "Could not send that group invitation.";
}
