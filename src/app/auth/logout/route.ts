import { NextResponse, type NextRequest } from "next/server";
import { getSiteOrigin } from "@/lib/http/site-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(
    new URL("/auth/login", getSiteOrigin(request.nextUrl.origin)),
  );
}

export async function POST(request: NextRequest) {
  return GET(request);
}
