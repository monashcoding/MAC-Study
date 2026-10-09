import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerStudySession } from "@/lib/auth/server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const presenceSchema = z.object({ active: z.boolean() });

// Heartbeat from the open app. Bodies may arrive via navigator.sendBeacon
// (text/plain), so parse the raw text rather than relying on the header.
export async function POST(request: Request) {
  const [supabase, session] = await Promise.all([
    createSupabaseServerClient(),
    getServerStudySession(),
  ]);

  if (!supabase || !session) {
    return new NextResponse(null, { status: 401 });
  }

  const parsed = presenceSchema.safeParse(
    await request
      .text()
      .then((text) => JSON.parse(text) as unknown)
      .catch(() => null),
  );

  if (!parsed.success) {
    return new NextResponse(null, { status: 400 });
  }

  const { error } = await supabase.rpc("touch_user_presence", {
    is_active: parsed.data.active,
  });

  if (error) {
    return new NextResponse(null, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
