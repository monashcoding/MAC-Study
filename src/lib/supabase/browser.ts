import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getStudySessionAccessToken } from "@/lib/auth/mac-auth-browser";
import { getOptionalSupabasePublicEnv } from "./env";

let browserClient: SupabaseClient | null = null;

export function createSupabaseBrowserClient() {
  const env = getOptionalSupabasePublicEnv();

  if (!env) {
    throw new Error("Supabase environment variables are not configured.");
  }

  if (browserClient) {
    return browserClient;
  }

  browserClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      accessToken: getStudySessionAccessToken,
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );

  return browserClient;
}
