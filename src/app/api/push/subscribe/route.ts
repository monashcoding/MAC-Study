import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerStudySession } from "@/lib/auth/server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    auth: z.string().min(1),
    p256dh: z.string().min(1),
  }),
});

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
      { message: "Sign in to enable nudges." },
      { status: 401 },
    );
  }

  const parsed = subscriptionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid push subscription." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      auth: parsed.data.keys.auth,
      endpoint: parsed.data.endpoint,
      last_seen_at: new Date().toISOString(),
      p256dh: parsed.data.keys.p256dh,
      revoked_at: null,
      user_agent: request.headers.get("user-agent"),
      user_id: session.sub,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
