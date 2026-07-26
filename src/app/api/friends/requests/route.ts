import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerStudySession } from "@/lib/auth/server-session";
import { sendWebPush } from "@/lib/push/send-web-push";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const sendRequestSchema = z.object({
  recipientId: z.string().uuid(),
});

const updateRequestSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
  requestId: z.string().uuid(),
});

type AppNotificationRow = {
  body: string;
  id: string;
  title: string;
  type: "friend_accepted" | "friend_request";
  user_id: string;
};

export async function POST(request: Request) {
  const context = await getRequestContext();

  if ("response" in context) return context.response;

  const parsed = sendRequestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid friend request." },
      { status: 400 },
    );
  }

  const { data: requestId, error } = await context.supabase.rpc(
    "send_friend_request",
    { target_user_id: parsed.data.recipientId },
  );

  if (error || !requestId) {
    return NextResponse.json(
      { message: getFriendRequestError(error?.message) },
      { status: 400 },
    );
  }

  const notification = await getFriendNotification(
    requestId as string,
    "friend_request",
  );
  const push = notification
    ? await sendFriendNotificationPush(notification)
    : { sent: 0 };

  return NextResponse.json({ ok: true, push, requestId });
}

export async function PATCH(request: Request) {
  const context = await getRequestContext();

  if ("response" in context) return context.response;

  const parsed = updateRequestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid friend request action." },
      { status: 400 },
    );
  }

  const { action, requestId } = parsed.data;
  const rpc =
    action === "cancel"
      ? context.supabase.rpc("cancel_friend_request", {
          target_request_id: requestId,
        })
      : context.supabase.rpc("respond_to_friend_request", {
          response: action === "accept" ? "accepted" : "declined",
          target_request_id: requestId,
        });
  const { error } = await rpc;

  if (error) {
    return NextResponse.json(
      { message: getFriendRequestError(error.message) },
      { status: 400 },
    );
  }

  let push = { sent: 0 };

  if (action === "accept") {
    const notification = await getFriendNotification(
      requestId,
      "friend_accepted",
    );

    if (notification) {
      push = await sendFriendNotificationPush(notification);
    }
  }

  return NextResponse.json({ ok: true, push });
}

async function getRequestContext() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      response: NextResponse.json(
        { message: "Supabase is not configured." },
        { status: 503 },
      ),
    };
  }

  const session = await getServerStudySession();

  if (!session) {
    return {
      response: NextResponse.json(
        { message: "Sign in to manage friend requests." },
        { status: 401 },
      ),
    };
  }

  return { session, supabase };
}

async function getFriendNotification(
  requestId: string,
  type: "friend_accepted" | "friend_request",
) {
  const admin = createSupabaseAdminClient();

  if (!admin) return null;

  const { data } = await admin
    .from("app_notifications")
    .select("id, user_id, title, body, type")
    .eq("entity_id", requestId)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AppNotificationRow>();

  return data ?? null;
}

async function sendFriendNotificationPush(notification: AppNotificationRow) {
  const delivery = await sendWebPush({
    body: notification.body,
    category: "friend",
    tag: `mac-study-${notification.id}`,
    title: notification.title,
    url:
      notification.type === "friend_request"
        ? "/app/friends?tab=requests"
        : "/app/friends",
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

function getFriendRequestError(message?: string) {
  if (!message) return "That friend request could not be updated.";
  if (message.includes("ALREADY_FRIENDS")) return "You are already friends.";
  if (message.includes("INCOMING_REQUEST_EXISTS")) {
    return "They already sent you a request. Open the Requests tab.";
  }
  if (message.includes("FRIEND_REQUEST_NOT_FOUND")) {
    return "That request is no longer available.";
  }

  return "That friend request could not be updated.";
}
