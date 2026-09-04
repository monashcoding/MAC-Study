import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerStudySession } from "@/lib/auth/server-session";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const GROUP_CHAT_IMAGE_BUCKET = "group-chat-images";
const STORAGE_DELETE_BATCH_SIZE = 100;

const leaveGroupSchema = z.object({
  groupId: z.string().uuid(),
});

type GroupImageRow = {
  image_path: string | null;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const session = await getServerStudySession();

  if (!supabase || !session) {
    return NextResponse.json(
      { message: "Sign in to leave this group." },
      { status: 401 },
    );
  }

  const parsed = leaveGroupSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid group." }, { status: 400 });
  }

  const { groupId } = parsed.data;
  const { data: imageRows, error: imageError } = await supabase
    .from("group_chat_messages")
    .select("image_path")
    .eq("group_id", groupId)
    .not("image_path", "is", null);

  if (imageError) {
    console.error("Could not list group images before leaving.", imageError);
  }

  const { data, error } = await supabase.rpc("leave_study_group", {
    target_group_id: groupId,
  });

  if (error) {
    const ownershipTransferRequired = error.message.includes(
      "TRANSFER_OWNERSHIP_REQUIRED",
    );

    return NextResponse.json(
      {
        message: ownershipTransferRequired
          ? "Transfer ownership before leaving this group."
          : "This group could not be left.",
      },
      { status: ownershipTransferRequired ? 409 : 400 },
    );
  }

  const outcome = data === "disbanded" ? "disbanded" : "left";

  if (outcome === "disbanded" && imageRows?.length) {
    await removeGroupChatImages(
      (imageRows as GroupImageRow[])
        .map((row) => row.image_path)
        .filter((path): path is string => Boolean(path)),
    );
  }

  return NextResponse.json({ ok: true, outcome });
}

async function removeGroupChatImages(paths: string[]) {
  const admin = createSupabaseAdminClient();
  const uniquePaths = [...new Set(paths)];

  if (!admin || uniquePaths.length === 0) return;

  for (
    let index = 0;
    index < uniquePaths.length;
    index += STORAGE_DELETE_BATCH_SIZE
  ) {
    const batch = uniquePaths.slice(index, index + STORAGE_DELETE_BATCH_SIZE);
    const { error } = await admin.storage
      .from(GROUP_CHAT_IMAGE_BUCKET)
      .remove(batch);

    if (error) {
      console.error("Could not remove disbanded group chat images.", error);
    }
  }
}
