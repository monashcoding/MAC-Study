import { redirect } from "next/navigation";
import { ensureProfile, type Profile } from "@/lib/supabase/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppAuthState =
  | {
      mode: "demo";
      user: null;
      profile: null;
    }
  | {
      mode: "authenticated";
      user: {
        id: string;
        email: string | null;
      };
      profile: Profile;
    };

export async function getAppAuthState(nextPath = "/app"): Promise<AppAuthState> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      mode: "demo",
      user: null,
      profile: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }

  const profile = await ensureProfile(supabase, user);

  if (!profile || profile.access_status !== "active") {
    redirect(`/auth/access?next=${encodeURIComponent(nextPath)}`);
  }

  return {
    mode: "authenticated",
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    profile,
  };
}

export async function getPendingAuthState(nextPath = "/app") {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      mode: "demo" as const,
      user: null,
      profile: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }

  const profile = await ensureProfile(supabase, user);

  return {
    mode: "authenticated" as const,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    profile,
  };
}
