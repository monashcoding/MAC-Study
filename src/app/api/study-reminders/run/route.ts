import { NextResponse } from "next/server";
import { sendWebPush } from "@/lib/push/send-web-push";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type DueStudyReminder = {
  reminder_interval_minutes: number;
  session_id: string;
  started_at: string;
  user_id: string;
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { message: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const { data, error } = await admin.rpc("claim_due_study_reminders", {
    batch_size: 100,
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const reminders = (data ?? []) as DueStudyReminder[];
  const deliveries = await Promise.allSettled(
    reminders.map((reminder) =>
      sendWebPush({
        body: `Your timer has been running for ${formatElapsed(reminder.started_at)}. Tap to check in.`,
        category: "study_reminder",
        tag: `mac-study-reminder-${reminder.session_id}`,
        title: "Still studying?",
        url: "/app?study-reminder=check",
        userId: reminder.user_id,
      }),
    ),
  );
  const delivered = deliveries.reduce(
    (count, delivery) =>
      count + (delivery.status === "fulfilled" ? delivery.value.sent : 0),
    0,
  );

  return NextResponse.json({
    claimed: reminders.length,
    delivered,
  });
}

function isAuthorized(request: Request) {
  const secret = process.env.STUDY_REMINDER_CRON_SECRET;
  if (!secret) return false;

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function formatElapsed(startedAt: string) {
  const elapsedMinutes = Math.max(
    1,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000),
  );

  if (elapsedMinutes < 60) return `${elapsedMinutes} minutes`;

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}
