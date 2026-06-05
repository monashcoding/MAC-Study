import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type SupabasePublicEnv = z.infer<typeof publicEnvSchema>;

function readRawEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  return publicEnvSchema.parse(readRawEnv());
}

export function getOptionalSupabasePublicEnv() {
  const parsed = publicEnvSchema.safeParse(readRawEnv());

  return parsed.success ? parsed.data : null;
}

export function isSupabaseConfigured() {
  return getOptionalSupabasePublicEnv() !== null;
}
