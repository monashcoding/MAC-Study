"use server";

import { redirect } from "next/navigation";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import { getServerStudySession } from "@/lib/auth/server-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function redeemInvite(formData: FormData) {
  const nextValue = formData.get("next");
  const next = getSafeNextPath(
    typeof nextValue === "string" ? nextValue : undefined,
  );
  const inviteCode = `${formData.get("inviteCode") ?? ""}`.trim();

  if (!inviteCode) {
    redirect(`/auth/access?error=missing&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(next);
  }

  const session = await getServerStudySession();

  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const { data, error } = await supabase.rpc("redeem_access_invite", {
    invite_code: inviteCode,
  });

  if (error || data !== true) {
    redirect(`/auth/access?error=invalid&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}
