import { NextResponse } from "next/server";
import webpush from "web-push";
import { z } from "zod";
import { getOptionalWebPushEnv } from "@/lib/supabase/env";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const nudgeSchema = z.object({
  groupId: z.string().uuid().nullable().optional(),
  recipientId: z.string().uuid(),
});

type PushSubscriptionRow = {
  auth: string;
  endpoint: string;
  p256dh: string;
};

type NudgeRow = {
  group_id: string | null;
  id: string;
  message: string | null;
  recipient_id: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { message: "Sign in to send nudges." },
      { status: 401 },
    );
  }

  const parsed = nudgeSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid nudge target." },
      { status: 400 },
    );
  }

  const groupId = parsed.data.groupId ?? null;
  const { data: nudgeId, error: nudgeError } = await supabase.rpc(
    "send_nudge",
    {
      target_group_id: groupId,
      target_user_id: parsed.data.recipientId,
    },
  );

  if (nudgeError) {
    return NextResponse.json({ message: nudgeError.message }, { status: 400 });
  }

  const { data: nudge, error: fetchError } = await supabase
    .from("nudges")
    .select("id, group_id, recipient_id, message")
    .eq("id", nudgeId)
    .single<NudgeRow>();

  if (fetchError || !nudge) {
    return NextResponse.json(
      { message: "Nudge was created, but could not be loaded." },
      { status: 500 },
    );
  }

  const pushResult = await sendPushNotifications(nudge);

  return NextResponse.json({ ok: true, push: pushResult });
}

async function sendPushNotifications(nudge: NudgeRow) {
  const admin = createSupabaseAdminClient();
  const pushEnv = getOptionalWebPushEnv();

  if (!admin || !pushEnv) {
    return { sent: 0, skipped: "push_not_configured" };
  }

  const { data, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", nudge.recipient_id)
    .is("revoked_at", null);

  if (error) {
    return { sent: 0, skipped: "subscriptions_unavailable" };
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[];

  if (!subscriptions.length) {
    return { sent: 0, skipped: "no_subscriptions" };
  }

  webpush.setVapidDetails(
    pushEnv.VAPID_SUBJECT,
    pushEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    pushEnv.VAPID_PRIVATE_KEY,
  );

  const payload = JSON.stringify({
    body: nudge.message ?? "Someone woke you up!",
    tag: `mac-study-nudge-${nudge.id}`,
    title: "MAC Study",
    url: nudge.group_id ? "/app/groups" : "/app/friends",
  });

  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            auth: subscription.auth,
            p256dh: subscription.p256dh,
          },
        },
        payload,
      ),
    ),
  );

  const revokedEndpoints = subscriptions
    .filter((subscription, index) => {
      const result = results[index];

      return (
        result.status === "rejected" && isExpiredPushSubscription(result.reason)
      );
    })
    .map((subscription) => subscription.endpoint);

  if (revokedEndpoints.length) {
    await admin
      .from("push_subscriptions")
      .update({ revoked_at: new Date().toISOString() })
      .in("endpoint", revokedEndpoints);
  }

  return {
    sent: results.filter((result) => result.status === "fulfilled").length,
  };
}

function isExpiredPushSubscription(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    ((error as { statusCode?: number }).statusCode === 404 ||
      (error as { statusCode?: number }).statusCode === 410)
  );
}
