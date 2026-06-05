"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function redeemInvite(formData: FormData) {
  const next = getSafeNextPath(formData.get("next"));
  const inviteCode = `${formData.get("inviteCode") ?? ""}`.trim();

  if (!inviteCode) {
    redirect(`/auth/access?error=missing&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(next);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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

function getSafeNextPath(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/app";

  if (!next.startsWith("/") || next.startsWith("//")) {
    return "/app";
  }

  return next;
}
