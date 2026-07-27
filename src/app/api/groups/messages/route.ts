import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getServerStudySession } from "@/lib/auth/server-session";
import { sendWebPush } from "@/lib/push/send-web-push";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const messageSchema = z
  .object({
    body: z.string().trim().max(2000).default(""),
    groupId: z.string().uuid(),
    imagePath: z.string().trim().max(240).nullable().optional(),
  })
  .refine((value) => Boolean(value.body || value.imagePath), {
    message: "A message or photo is required.",
  });

type GroupMemberRow = {
  user_id: string;
};

type GroupMuteRow = {
  user_id: string;
};

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

  const { body, groupId, imagePath = null } = parsed.data;
  const expectedImagePrefix = `${groupId}/${session.sub}/`;

  if (
    imagePath &&
    (!imagePath.startsWith(expectedImagePrefix) ||
      !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:gif|jpe?g|png|webp)$/i.test(
        imagePath,
      ))
  ) {
    return NextResponse.json(
      { message: "That photo does not belong to this message." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("group_chat_messages")
    .insert({
      body: body || null,
      group_id: groupId,
      image_path: imagePath,
      user_id: session.sub,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    return NextResponse.json(
      { message: "That group message could not be sent." },
      { status: 400 },
    );
  }

  after(() =>
    sendGroupMessagePush({
      body,
      groupId,
      hasImage: Boolean(imagePath),
      messageId: data.id,
      senderId: session.sub,
    }),
  );

  return NextResponse.json({ messageId: data.id, ok: true });
}

async function sendGroupMessagePush({
  body,
  groupId,
  hasImage,
  messageId,
  senderId,
}: {
  body: string;
  groupId: string;
  hasImage: boolean;
  messageId: string;
  senderId: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;

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
  const memberIds = ((membersResult.data ?? []) as GroupMemberRow[])
    .map((row) => row.user_id)
    .filter((userId) => !mutedIds.has(userId));

  if (!memberIds.length) return;

  const sender =
    (senderResult.data as { username?: string | null } | null)?.username ??
    "A group member";
  const groupName =
    (groupResult.data as { name?: string | null } | null)?.name ?? "Group chat";
  const preview = body
    ? body.length > 120
      ? `${body.slice(0, 117)}…`
      : body
    : hasImage
      ? "Sent a photo"
      : "Sent a message";

  await Promise.allSettled(
    memberIds.map((userId) =>
      sendWebPush({
        body: `@${sender}: ${preview}`,
        category: "other",
        tag: `mac-study-group-message-${messageId}`,
        title: groupName,
        url: `/app/groups?group=${groupId}`,
        userId,
      }),
    ),
  );
}
