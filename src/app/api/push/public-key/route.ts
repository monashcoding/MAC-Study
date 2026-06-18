import { NextResponse } from "next/server";
import { getOptionalWebPushEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

export function GET() {
  const pushEnv = getOptionalWebPushEnv();

  if (!pushEnv) {
    return NextResponse.json(
      { message: "Web Push is not configured." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { publicKey: pushEnv.VAPID_PUBLIC_KEY },
    { headers: { "Cache-Control": "no-store" } },
  );
}
