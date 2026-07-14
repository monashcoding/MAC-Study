import { randomUUID } from "node:crypto";
import { SignJWT, importJWK, jwtVerify, type JWK } from "jose";
import { z } from "zod";
import type { MacClaims } from "./mac-auth";

export const STUDY_SESSION_COOKIE = "mac_study_session";
export const STUDY_SESSION_AUDIENCE = "authenticated";
export const STUDY_SESSION_ISSUER =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://study.monashcoding.com";

const privateJwkSchema = z.object({
  alg: z.literal("ES256"),
  crv: z.literal("P-256"),
  d: z.string().min(1),
  kid: z.string().min(1),
  kty: z.literal("EC"),
  x: z.string().min(1),
  y: z.string().min(1),
});

const studySessionClaimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.literal("authenticated"),
  email: z.string().email(),
  name: z.string(),
  macUserId: z.string().min(1),
  roles: z.array(z.string()),
  team: z.string().nullable(),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
});

export type StudySessionClaims = z.infer<typeof studySessionClaimsSchema>;

export type StudySessionIdentity = {
  internalUserId: string;
  mac: MacClaims;
};

type CachedKeys = {
  source: string;
  signingKey: Awaited<ReturnType<typeof importJWK>>;
  verificationKey: Awaited<ReturnType<typeof importJWK>>;
  kid: string;
};

let cachedKeys: CachedKeys | null = null;

export async function createStudySessionToken(
  identity: StudySessionIdentity,
  privateJwkJson: string,
) {
  const keys = await readKeys(privateJwkJson);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Math.min(identity.mac.exp, now + 15 * 60);

  if (expiresAt <= now) {
    throw new Error("The MAC login token has expired.");
  }

  const token = await new SignJWT({
    role: "authenticated",
    email: identity.mac.email,
    name: identity.mac.name,
    macUserId: identity.mac.macUserId,
    roles: identity.mac.roles,
    team: identity.mac.team,
  })
    .setProtectedHeader({ alg: "ES256", kid: keys.kid, typ: "JWT" })
    .setSubject(identity.internalUserId)
    .setIssuer(STUDY_SESSION_ISSUER)
    .setAudience(STUDY_SESSION_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(keys.signingKey);

  return { expiresAt, token };
}

export async function verifyStudySessionToken(
  token: string,
  privateJwkJson: string,
): Promise<StudySessionClaims> {
  const keys = await readKeys(privateJwkJson);
  const { payload } = await jwtVerify(token, keys.verificationKey, {
    algorithms: ["ES256"],
    audience: STUDY_SESSION_AUDIENCE,
    issuer: STUDY_SESSION_ISSUER,
  });

  return studySessionClaimsSchema.parse(payload);
}

async function readKeys(privateJwkJson: string): Promise<CachedKeys> {
  if (cachedKeys?.source === privateJwkJson) {
    return cachedKeys;
  }

  const parsed = privateJwkSchema.parse(JSON.parse(privateJwkJson));
  const publicJwk: JWK = {
    alg: parsed.alg,
    crv: parsed.crv,
    kid: parsed.kid,
    kty: parsed.kty,
    x: parsed.x,
    y: parsed.y,
  };
  const signingKey = await importJWK(parsed, "ES256");
  const verificationKey = await importJWK(publicJwk, "ES256");

  cachedKeys = {
    source: privateJwkJson,
    signingKey,
    verificationKey,
    kid: parsed.kid,
  };

  return cachedKeys;
}
