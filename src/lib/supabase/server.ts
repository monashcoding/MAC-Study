import { createClient } from "@supabase/supabase-js";
import { getServerStudyAccessToken } from "@/lib/auth/server-session";
import {
  getOptionalSupabaseAdminEnv,
  getOptionalSupabasePublicEnv,
} from "./env";
import type { Database } from "./types";

export async function createSupabaseServerClient() {
  const env = getOptionalSupabasePublicEnv();

  if (!env) {
    return null;
  }

  const accessToken = await getServerStudyAccessToken();

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      accessToken: async () => accessToken,
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}

export function createSupabaseAdminClient() {
  const env = getOptionalSupabaseAdminEnv();

  if (!env) {
    return null;
  }

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
