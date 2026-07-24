import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerStudySession } from "@/lib/auth/server-session";
import { sendWebPush } from "@/lib/push/send-web-push";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const nudgeSchema = z.object({
  groupId: z.string().uuid().nullable().optional(),
  recipientId: z.string().uuid(),
});

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

  const session = await getServerStudySession();

  if (!session) {
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
    if (nudgeError.message.includes("NUDGE_DAILY_LIMIT")) {
      return NextResponse.json(
        { message: "250 nudges today. The bit is complete." },
        { status: 429 },
      );
    }

    const retryAfterSeconds = getNudgeRetryAfterSeconds(nudgeError.message);

    if (retryAfterSeconds !== null) {
      return NextResponse.json(
        {
          message: `That is 10 nudges in a minute. Give them ${retryAfterSeconds}s to recover.`,
          retryAfterSeconds,
        },
        {
          headers: { "Retry-After": `${retryAfterSeconds}` },
          status: 429,
        },
      );
    }

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
  return sendWebPush({
    body: nudge.message ?? "Someone woke you up!",
    category: "nudge",
    tag: `mac-study-nudge-${nudge.id}`,
    title: "MAC Study",
    url: nudge.group_id ? "/app/groups" : "/app/friends",
    userId: nudge.recipient_id,
  });
}

function getNudgeRetryAfterSeconds(message: string) {
  const match = message.match(/NUDGE_RATE_LIMIT:(\d+)/);

  if (!match) {
    return null;
  }

  return Math.max(1, Number.parseInt(match[1], 10));
}
