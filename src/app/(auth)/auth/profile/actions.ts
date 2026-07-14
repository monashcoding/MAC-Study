"use server";

import { redirect } from "next/navigation";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import { getServerStudySession } from "@/lib/auth/server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function saveProfileIdentity(formData: FormData) {
  const nextValue = formData.get("next");
  const safeNext = getSafeNextPath(
    typeof nextValue === "string" ? nextValue : undefined,
  );
  const next = safeNext.startsWith("/auth/profile") ? "/app" : safeNext;
  const displayName = `${formData.get("displayName") ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  const username = normalizeUsername(`${formData.get("username") ?? ""}`);

  if (!displayName || !username) {
    redirect(`/auth/profile?error=missing&next=${encodeURIComponent(next)}`);
  }

  if (displayName.length < 2 || displayName.length > 60) {
    redirect(`/auth/profile?error=name&next=${encodeURIComponent(next)}`);
  }

  if (username.length < 3 || username.length > 24) {
    redirect(`/auth/profile?error=username&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(next);
  }

  const session = await getServerStudySession();

  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      username,
    })
    .eq("id", session.sub);

  if (error?.code === "23505") {
    redirect(`/auth/profile?error=taken&next=${encodeURIComponent(next)}`);
  }

  if (error) {
    redirect(`/auth/profile?error=save&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

function normalizeUsername(value: string) {
  return value
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}
