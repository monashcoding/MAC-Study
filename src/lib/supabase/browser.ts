import { createBrowserClient } from "@supabase/ssr";
import { getOptionalSupabasePublicEnv } from "./env";

export function createSupabaseBrowserClient() {
  const env = getOptionalSupabasePublicEnv();

  if (!env) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
