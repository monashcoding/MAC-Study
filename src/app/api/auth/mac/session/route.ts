import { type NextRequest, NextResponse } from "next/server";
import { getOrCreateMacProfile } from "@/lib/auth/mac-profile";
import { readBearerToken, verifyMacToken } from "@/lib/auth/mac-auth";
import {
  createStudySessionToken,
  STUDY_SESSION_COOKIE,
  verifyStudySessionToken,
} from "@/lib/auth/study-session";
import { getOptionalStudySessionEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const macToken = readBearerToken(request.headers.get("authorization"));

  if (!macToken) {
    return noStoreJson({ message: "A MAC login token is required." }, 401);
  }

  const env = getOptionalStudySessionEnv();

  if (!env) {
    return noStoreJson(
      { message: "The MAC Study session bridge is not configured." },
      503,
    );
  }

  try {
    const mac = await verifyMacToken(macToken);
    const profile = await getOrCreateMacProfile(mac);
    const session = await createStudySessionToken(
      { internalUserId: profile.id, mac },
      env.SUPABASE_JWT_PRIVATE_JWK,
    );
    const response = noStoreJson({
      expiresAt: session.expiresAt,
      token: session.token,
      user: {
        id: profile.id,
        email: mac.email,
        name: mac.name,
        roles: mac.roles,
        team: mac.team,
      },
    });

    setSessionCookie(response, session.token, session.expiresAt);

    return response;
  } catch (error) {
    console.error("MAC session exchange failed", error);

    return noStoreJson({ message: "MAC login could not be verified." }, 401);
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(STUDY_SESSION_COOKIE)?.value;
  const env = getOptionalStudySessionEnv();

  if (!token || !env) {
    return clearInvalidSession(
      noStoreJson({ message: "No active MAC Study session." }, 401),
    );
  }

  try {
    const claims = await verifyStudySessionToken(
      token,
      env.SUPABASE_JWT_PRIVATE_JWK,
    );

    return noStoreJson({
      expiresAt: claims.exp,
      token,
      user: {
        id: claims.sub,
        email: claims.email,
        name: claims.name,
        roles: claims.roles,
        team: claims.team,
      },
    });
  } catch {
    return clearInvalidSession(
      noStoreJson({ message: "The MAC Study session has expired." }, 401),
    );
  }
}

export async function DELETE() {
  return clearInvalidSession(noStoreJson({ ok: true }));
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: number,
) {
  response.cookies.set(STUDY_SESSION_COOKIE, token, {
    expires: new Date(expiresAt * 1000),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function clearInvalidSession(response: NextResponse) {
  response.cookies.set(STUDY_SESSION_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
