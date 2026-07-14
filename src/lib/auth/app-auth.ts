import { redirect } from "next/navigation";
import {
  getProfileById,
  needsProfileSetup,
  type Profile,
} from "@/lib/supabase/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerStudySession } from "./server-session";

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

export async function getAppAuthState(
  nextPath = "/app",
): Promise<AppAuthState> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      mode: "demo",
      user: null,
      profile: null,
    };
  }

  const session = await getServerStudySession();

  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }

  const profile = await getProfileById(supabase, session.sub);

  if (needsProfileSetup(profile)) {
    redirect(`/auth/profile?next=${encodeURIComponent(nextPath)}`);
  }

  if (!profile || profile.access_status !== "active") {
    redirect(`/auth/access?next=${encodeURIComponent(nextPath)}`);
  }

  return {
    mode: "authenticated",
    user: {
      id: session.sub,
      email: session.email,
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

  const session = await getServerStudySession();

  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }

  const profile = await getProfileById(supabase, session.sub);

  if (needsProfileSetup(profile)) {
    redirect(`/auth/profile?next=${encodeURIComponent(nextPath)}`);
  }

  return {
    mode: "authenticated" as const,
    user: {
      id: session.sub,
      email: session.email,
    },
    profile,
  };
}
