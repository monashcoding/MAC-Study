import { getSafeNextPath } from "./safe-next-path";

export const MAC_AUTH_BROWSER_URL =
  process.env.NEXT_PUBLIC_MAC_AUTH_URL ?? "https://auth.monashcoding.com";

export type MacProvider = "google" | "microsoft";

export type BrowserStudySession = {
  expiresAt: number;
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
    team: string | null;
  };
};

export class MacSignInRequiredError extends Error {
  constructor() {
    super("Sign in with MAC to continue.");
    this.name = "MacSignInRequiredError";
  }
}

let cachedSession: BrowserStudySession | null = null;
let sessionRequest: Promise<BrowserStudySession> | null = null;

export async function getStudySession() {
  const now = Math.floor(Date.now() / 1000);

  if (cachedSession && cachedSession.expiresAt > now + 30) {
    return cachedSession;
  }

  if (!sessionRequest) {
    sessionRequest = loadOrRefreshStudySession().finally(() => {
      sessionRequest = null;
    });
  }

  return sessionRequest;
}

export async function getStudySessionAccessToken() {
  return (await getStudySession()).token;
}

export async function getCurrentStudyUserId() {
  return (await getStudySession()).user.id;
}

export async function completeMacSignIn() {
  const centralToken = await getCentralMacToken();
  const response = await fetch("/api/auth/mac/session", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${centralToken}` },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await getResponseError(response, "MAC sign-in failed."));
  }

  cachedSession = (await response.json()) as BrowserStudySession;

  return cachedSession;
}

export async function startMacSignIn(provider: MacProvider, nextPath: string) {
  const callbackUrl = new URL("/auth/login", window.location.origin);
  callbackUrl.searchParams.set("complete", "1");
  callbackUrl.searchParams.set("next", getSafeNextPath(nextPath));

  const response = await fetch(
    `${MAC_AUTH_BROWSER_URL}/api/auth/sign-in/social`,
    {
      body: JSON.stringify({
        callbackURL: callbackUrl.toString(),
        provider,
      }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(
      await getResponseError(response, "Could not start MAC sign-in."),
    );
  }

  const body = (await response.json()) as { url?: string };

  if (!body.url) {
    throw new Error("MAC Auth did not return a sign-in URL.");
  }

  window.location.assign(body.url);
}

export function clearCachedStudySession() {
  cachedSession = null;
  sessionRequest = null;
}

async function loadOrRefreshStudySession() {
  const response = await fetch("/api/auth/mac/session", {
    cache: "no-store",
  });

  if (response.ok) {
    cachedSession = (await response.json()) as BrowserStudySession;
    return cachedSession;
  }

  return completeMacSignIn();
}

async function getCentralMacToken() {
  const response = await fetch(`${MAC_AUTH_BROWSER_URL}/api/auth/token`, {
    cache: "no-store",
    credentials: "include",
  });

  if (response.status === 401) {
    throw new MacSignInRequiredError();
  }

  if (!response.ok) {
    throw new Error(
      await getResponseError(response, "MAC Auth is currently unavailable."),
    );
  }

  const body = (await response.json()) as { token?: string };

  if (!body.token) {
    throw new Error("MAC Auth did not return a login token.");
  }

  return body.token;
}

async function getResponseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  return body?.message ?? fallback;
}
