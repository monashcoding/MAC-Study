import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerStudySession } from "@/lib/auth/server-session";
import { sendWebPush } from "@/lib/push/send-web-push";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

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
  const muted = await isNudgeMuted({
    groupId,
    recipientId: parsed.data.recipientId,
    senderId: session.sub,
  });

  if (muted) {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }

  const { data: nudgeId, error: nudgeError } = await supabase.rpc(
    "send_nudge",
    {
      target_group_id: groupId,
      target_user_id: parsed.data.recipientId,
    },
  );

  if (nudgeError) {
    if (nudgeError.message.includes("RECIPIENT_STUDYING")) {
      return NextResponse.json(
        { message: "They are already studying." },
        { status: 409 },
      );
    }

    if (nudgeError.message.includes("NUDGE_DAILY_LIMIT")) {
      return NextResponse.json(
        { message: "250 nudges today. The bit is complete." },
        { status: 429 },
      );
    }

    const retryAfterSeconds = getNudgeRetryAfterSeconds(nudgeError.message);

    if (retryAfterSeconds !== null) {
      const isSuperNudge = nudgeError.message.includes(
        "SUPER_NUDGE_RATE_LIMIT",
      );
      return NextResponse.json(
        {
          message: isSuperNudge
            ? `Super Nudge allows 10 per minute. Ready again in ${retryAfterSeconds}s.`
            : `One nudge per minute. Ready again in ${retryAfterSeconds}s.`,
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

  const pushResult = await sendPushNotifications(nudge, session.sub);

  return NextResponse.json({ ok: true, push: pushResult });
}

async function sendPushNotifications(nudge: NudgeRow, senderId: string) {
  if (nudge.group_id) {
    const admin = createSupabaseAdminClient();

    if (admin) {
      const [groupMute, senderMute] = await Promise.all([
        admin
          .from("user_group_notification_settings")
          .select("nudges_muted")
          .eq("user_id", nudge.recipient_id)
          .eq("group_id", nudge.group_id)
          .maybeSingle<{ nudges_muted: boolean }>(),
        admin
          .from("user_nudge_mutes")
          .select("muted_user_id")
          .eq("user_id", nudge.recipient_id)
          .eq("muted_user_id", senderId)
          .eq("group_id", nudge.group_id)
          .maybeSingle(),
      ]);

      if (groupMute.data?.nudges_muted || senderMute.data) {
        return { sent: 0, skipped: "disabled" as const };
      }
    }
  }

  return sendWebPush({
    category: "nudge",
    tag: `mac-study-nudge-${nudge.id}`,
    title: nudge.message ?? "Someone woke you up!",
    url: nudge.group_id
      ? `/app/groups?group=${encodeURIComponent(nudge.group_id)}`
      : `/app/friends?friend=${encodeURIComponent(senderId)}`,
    userId: nudge.recipient_id,
  });
}

async function isNudgeMuted({
  groupId,
  recipientId,
  senderId,
}: {
  groupId: string | null;
  recipientId: string;
  senderId: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) return false;

  const globalMute = admin
    .from("user_nudge_mutes")
    .select("muted_user_id")
    .eq("user_id", recipientId)
    .eq("muted_user_id", senderId)
    .is("group_id", null)
    .maybeSingle();

  if (!groupId) {
    const { data } = await globalMute;
    return Boolean(data);
  }

  const [globalResult, groupMute, senderMute] = await Promise.all([
    globalMute,
    admin
      .from("user_group_notification_settings")
      .select("nudges_muted")
      .eq("user_id", recipientId)
      .eq("group_id", groupId)
      .maybeSingle<{ nudges_muted: boolean }>(),
    admin
      .from("user_nudge_mutes")
      .select("muted_user_id")
      .eq("user_id", recipientId)
      .eq("muted_user_id", senderId)
      .eq("group_id", groupId)
      .maybeSingle(),
  ]);

  return Boolean(
    globalResult.data || groupMute.data?.nudges_muted || senderMute.data,
  );
}

function getNudgeRetryAfterSeconds(message: string) {
  const match = message.match(/(?:SUPER_)?NUDGE_RATE_LIMIT:(\d+)/);

  if (!match) {
    return null;
  }

  return Math.max(1, Number.parseInt(match[1], 10));
}
