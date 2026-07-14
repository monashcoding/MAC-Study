import { exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import type { MacClaims } from "./mac-auth";
import {
  createStudySessionToken,
  verifyStudySessionToken,
} from "./study-session";

let privateJwkJson: string;

beforeAll(async () => {
  const keys = await generateKeyPair("ES256", { extractable: true });
  const privateJwk = await exportJWK(keys.privateKey);

  privateJwkJson = JSON.stringify({
    ...privateJwk,
    alg: "ES256",
    kid: "study-test-key",
  });
});

function macClaims(overrides: Partial<MacClaims> = {}): MacClaims {
  return {
    macUserId: "mac-user-123",
    email: "member@monashcoding.com",
    name: "MAC Member",
    roles: ["member"],
    team: null,
    ver: 1,
    exp: Math.floor(Date.now() / 1000) + 15 * 60,
    ...overrides,
  };
}

describe("study session tokens", () => {
  it("converts a MAC identity into a verified Supabase identity", async () => {
    const session = await createStudySessionToken(
      {
        internalUserId: "45482c2a-4580-4e26-b210-72423b5fc951",
        mac: macClaims(),
      },
      privateJwkJson,
    );

    await expect(
      verifyStudySessionToken(session.token, privateJwkJson),
    ).resolves.toMatchObject({
      sub: "45482c2a-4580-4e26-b210-72423b5fc951",
      role: "authenticated",
      email: "member@monashcoding.com",
      macUserId: "mac-user-123",
      roles: ["member"],
      team: null,
    });
  });

  it("never outlives the central MAC token", async () => {
    const centralExpiry = Math.floor(Date.now() / 1000) + 60;
    const session = await createStudySessionToken(
      {
        internalUserId: "45482c2a-4580-4e26-b210-72423b5fc951",
        mac: macClaims({ exp: centralExpiry }),
      },
      privateJwkJson,
    );

    expect(session.expiresAt).toBe(centralExpiry);
  });

  it("rejects an expired central MAC token", async () => {
    await expect(
      createStudySessionToken(
        {
          internalUserId: "45482c2a-4580-4e26-b210-72423b5fc951",
          mac: macClaims({ exp: Math.floor(Date.now() / 1000) - 1 }),
        },
        privateJwkJson,
      ),
    ).rejects.toThrow("expired");
  });
});
