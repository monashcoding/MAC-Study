import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createStudySessionToken } from "../../src/lib/auth/study-session";
import type { Database } from "../../src/lib/supabase/types";
import {
  E2E_AUTH_DIR,
  E2E_PRIVATE_GROUP,
  E2E_RUNTIME_STATE,
  E2E_USERS,
  OWNER_STORAGE_STATE,
} from "./fixtures";

export default async function globalSetup() {
  const supabaseUrl = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const privateJwk = requireEnvironment("SUPABASE_JWT_PRIVATE_JWK");
  const admin = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userIds = [E2E_USERS.owner.id, E2E_USERS.outsider.id];

  await requireSuccess(
    admin.from("study_sessions").delete().in("user_id", userIds),
    "clear prior test sessions",
  );
  await requireSuccess(
    admin.from("groups").delete().in("owner_id", userIds),
    "clear prior test groups",
  );
  await requireSuccess(
    admin.from("profiles").upsert(
      Object.values(E2E_USERS).map((user) => ({
        access_granted_at: new Date().toISOString(),
        access_granted_source: "e2e",
        access_status: "active",
        display_name: user.name,
        id: user.id,
        mac_email: user.email,
        mac_last_seen_at: new Date().toISOString(),
        mac_roles: ["member"],
        mac_team: null,
        mac_token_version: 1,
        mac_user_id: user.macUserId,
        username: user.username,
      })),
      { onConflict: "id" },
    ),
    "seed test profiles",
  );
  await requireSuccess(
    admin.from("groups").insert({
      id: E2E_PRIVATE_GROUP.id,
      invite_code: E2E_PRIVATE_GROUP.inviteCode,
      name: E2E_PRIVATE_GROUP.name,
      owner_id: E2E_USERS.owner.id,
      visibility: "invite_only",
    }),
    "seed the private RLS group",
  );
  await requireSuccess(
    admin.from("group_members").insert({
      group_id: E2E_PRIVATE_GROUP.id,
      role: "owner",
      status: "active",
      user_id: E2E_USERS.owner.id,
    }),
    "seed the private group's owner",
  );

  const ownerSession = await makeSession(E2E_USERS.owner, privateJwk);
  const outsiderSession = await makeSession(E2E_USERS.outsider, privateJwk);

  await mkdir(E2E_AUTH_DIR, { recursive: true });
  await Promise.all([
    writeStorageState(OWNER_STORAGE_STATE, ownerSession),
    writeFile(
      E2E_RUNTIME_STATE,
      JSON.stringify(
        {
          outsiderToken: outsiderSession.token,
          ownerToken: ownerSession.token,
        },
        null,
        2,
      ),
    ),
  ]);
}

async function makeSession(
  user: (typeof E2E_USERS)[keyof typeof E2E_USERS],
  privateJwk: string,
) {
  return createStudySessionToken(
    {
      internalUserId: user.id,
      mac: {
        email: user.email,
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
        macUserId: user.macUserId,
        name: user.name,
        roles: ["member"],
        team: null,
        ver: 1,
      },
    },
    privateJwk,
  );
}

async function writeStorageState(
  path: string,
  session: { expiresAt: number; token: string },
) {
  await writeFile(
    path,
    JSON.stringify(
      {
        cookies: [
          {
            domain: "127.0.0.1",
            expires: session.expiresAt,
            httpOnly: true,
            name: "mac_study_session",
            path: "/",
            sameSite: "Lax",
            secure: false,
            value: session.token,
          },
        ],
        origins: [],
      },
      null,
      2,
    ),
  );
}

async function requireSuccess<T>(
  request: PromiseLike<{ data: T; error: { message: string } | null }>,
  action: string,
) {
  const { error } = await request;

  if (error) {
    throw new Error(`Could not ${action}: ${error.message}`);
  }
}

function requireEnvironment(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for the Playwright setup.`);
  }

  return value;
}
