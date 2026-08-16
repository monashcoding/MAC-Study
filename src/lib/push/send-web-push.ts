import webpush from "web-push";
import { getOptionalWebPushEnv } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type NotificationCategory =
  | "friend"
  | "nudge"
  | "other"
  | "study_reminder";

type PushSubscriptionRow = {
  auth: string;
  endpoint: string;
  p256dh: string;
};

export type PushDelivery = {
  sent: number;
  skipped?:
    | "disabled"
    | "no_subscriptions"
    | "push_not_configured"
    | "subscriptions_unavailable";
};

export async function sendWebPush({
  body,
  category,
  tag,
  title = "MAC Study",
  url,
  userId,
}: {
  body?: string;
  category: NotificationCategory;
  tag: string;
  title?: string;
  url: string;
  userId: string;
}): Promise<PushDelivery> {
  const admin = createSupabaseAdminClient();
  const pushEnv = getOptionalWebPushEnv();

  if (!admin || !pushEnv) {
    return { sent: 0, skipped: "push_not_configured" };
  }

  const [preferencesResult, subscriptionsResult] = await Promise.all([
    admin
      .from("user_notification_preferences")
      .select("friend_notifications, nudge_notifications, other_notifications")
      .eq("user_id", userId)
      .maybeSingle<{
        friend_notifications: boolean;
        nudge_notifications: boolean;
        other_notifications: boolean;
      }>(),
    admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId)
      .is("revoked_at", null),
  ]);
  const preferences = preferencesResult.data;

  const enabled =
    category === "friend"
      ? preferences?.friend_notifications
      : category === "nudge"
        ? preferences?.nudge_notifications
        : category === "other"
          ? preferences?.other_notifications
          : true;

  if (enabled === false) {
    return { sent: 0, skipped: "disabled" };
  }

  const { data, error } = subscriptionsResult;

  if (error) {
    return { sent: 0, skipped: "subscriptions_unavailable" };
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[];

  if (!subscriptions.length) {
    return { sent: 0, skipped: "no_subscriptions" };
  }

  webpush.setVapidDetails(
    pushEnv.VAPID_SUBJECT,
    pushEnv.VAPID_PUBLIC_KEY,
    pushEnv.VAPID_PRIVATE_KEY,
  );

  const payload = JSON.stringify({ body, tag, title, url });
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
