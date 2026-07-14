import { cookies } from "next/headers";
import { STUDY_SESSION_COOKIE, verifyStudySessionToken } from "./study-session";
import { getOptionalStudySessionEnv } from "@/lib/supabase/env";

export async function getServerStudySession() {
  const env = getOptionalStudySessionEnv();

  if (!env) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(STUDY_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    return await verifyStudySessionToken(token, env.SUPABASE_JWT_PRIVATE_JWK);
  } catch {
    return null;
  }
}

export async function getServerStudyAccessToken() {
  const cookieStore = await cookies();

  return cookieStore.get(STUDY_SESSION_COOKIE)?.value ?? null;
}
