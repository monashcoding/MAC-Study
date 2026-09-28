import "client-only";

import { getCurrentStudyUserId } from "@/lib/auth/mac-auth-browser";

export async function getRemoteUserId() {
  try {
    return await getCurrentStudyUserId();
  } catch {
    return null;
  }
}

export async function getResponseError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  return body?.message ?? "That request could not be completed.";
}
