import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type SupabasePublicEnv = z.infer<typeof publicEnvSchema>;

const adminEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const studySessionEnvSchema = z.object({
  SUPABASE_JWT_PRIVATE_JWK: z.string().min(1),
});

const webPushEnvSchema = z.object({
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z
    .string()
    .min(1)
    .default("mailto:notifications@mac-study.app"),
});

export type SupabaseAdminEnv = z.infer<typeof adminEnvSchema>;
export type StudySessionEnv = z.infer<typeof studySessionEnvSchema>;
export type WebPushEnv = z.infer<typeof webPushEnvSchema>;

function readRawEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    VAPID_PUBLIC_KEY:
      process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_PRIVATE_JWK: process.env.SUPABASE_JWT_PRIVATE_JWK,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  };
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  return publicEnvSchema.parse(readRawEnv());
}

export function getOptionalSupabasePublicEnv() {
  const parsed = publicEnvSchema.safeParse(readRawEnv());

  return parsed.success ? parsed.data : null;
}

export function getOptionalSupabaseAdminEnv() {
  const parsed = adminEnvSchema.safeParse(readRawEnv());

  return parsed.success ? parsed.data : null;
}

export function getOptionalStudySessionEnv() {
  const parsed = studySessionEnvSchema.safeParse(readRawEnv());

  return parsed.success ? parsed.data : null;
}

export function getOptionalWebPushEnv() {
  const parsed = webPushEnvSchema.safeParse(readRawEnv());

  return parsed.success ? parsed.data : null;
}

export function isSupabaseConfigured() {
  return getOptionalSupabasePublicEnv() !== null;
}
