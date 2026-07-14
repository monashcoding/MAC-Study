import { NextResponse, type NextRequest } from "next/server";
import { getSiteOrigin } from "@/lib/http/site-origin";
import { ensureProfile, needsProfileSetup } from "@/lib/supabase/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl;
  const siteOrigin = getSiteOrigin(requestUrl.origin);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));
  const error = requestUrl.searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error)}`, siteOrigin),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login", siteOrigin));
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/auth/login", siteOrigin));
  }

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      new URL(
        `/auth/login?error=${encodeURIComponent(exchangeError.message)}`,
        siteOrigin,
      ),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await ensureProfile(supabase, user);

    if (needsProfileSetup(profile)) {
      return NextResponse.redirect(
        new URL(`/auth/profile?next=${encodeURIComponent(next)}`, siteOrigin),
      );
    }
  }

  return NextResponse.redirect(new URL(next, siteOrigin));
}

function getSafeNextPath(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/app";
  }

  return next;
}
