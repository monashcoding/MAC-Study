import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MAC_AUTH_AUDIENCE,
  MAC_AUTH_ISSUER,
  readBearerToken,
  verifyMacToken,
} from "./mac-auth";

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let localKeySet: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const keys = await generateKeyPair("EdDSA");
  privateKey = keys.privateKey;
  const publicJwk = await exportJWK(keys.publicKey);

  localKeySet = createLocalJWKSet({
    keys: [{ ...publicJwk, alg: "EdDSA", kid: "test-key" }],
  });
});

async function makeToken(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    macUserId: "mac-user-123",
    email: "member@monashcoding.com",
    name: "MAC Member",
    roles: ["member"],
    team: null,
    ver: 1,
    ...overrides,
  })
    .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
    .setIssuer(MAC_AUTH_ISSUER)
    .setAudience(MAC_AUTH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(privateKey);
}

describe("verifyMacToken", () => {
  it("accepts a valid MAC token", async () => {
    const token = await makeToken();

    await expect(verifyMacToken(token, localKeySet)).resolves.toEqual({
      macUserId: "mac-user-123",
      email: "member@monashcoding.com",
      name: "MAC Member",
      roles: ["member"],
      team: null,
      ver: 1,
      exp: expect.any(Number),
    });
  });

  it("rejects a signed token with malformed identity claims", async () => {
    const token = await makeToken({ macUserId: "", email: "not-an-email" });

    await expect(verifyMacToken(token, localKeySet)).rejects.toThrow();
  });

  it("rejects a token issued for a different audience", async () => {
    const token = await new SignJWT({
      macUserId: "mac-user-123",
      email: "member@monashcoding.com",
      name: "MAC Member",
      roles: ["member"],
      team: null,
      ver: 1,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
      .setIssuer(MAC_AUTH_ISSUER)
      .setAudience("another-app")
      .setExpirationTime("15m")
      .sign(privateKey);

    await expect(verifyMacToken(token, localKeySet)).rejects.toThrow();
  });
});

describe("readBearerToken", () => {
  it("extracts a case-insensitive bearer token", () => {
    expect(readBearerToken("bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it.each([null, "", "Basic abc", "Bearer", "Bearer one two"])(
    "rejects an invalid Authorization header: %s",
    (header) => {
      expect(readBearerToken(header)).toBeNull();
    },
  );
});
