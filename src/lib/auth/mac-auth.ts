import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

export const MAC_AUTH_URL =
  process.env.MAC_AUTH_URL ??
  process.env.AUTH_URL ??
  "https://auth.monashcoding.com";
export const MAC_AUTH_ISSUER = MAC_AUTH_URL;
export const MAC_AUTH_AUDIENCE = process.env.MAC_AUTH_AUDIENCE ?? "mac-suite";

const macClaimsSchema = z.object({
  macUserId: z.string().min(1),
  email: z.string().email(),
  name: z.string(),
  roles: z.array(z.string()),
  team: z.string().nullable(),
  ver: z.number().int().positive(),
  exp: z.number().int().positive(),
});

export type MacClaims = z.infer<typeof macClaimsSchema>;

// createRemoteJWKSet caches the downloaded public keys and refreshes them only
// when MAC Auth rotates to a key this process has not seen before.
const macJwks = createRemoteJWKSet(
  new URL("/api/auth/jwks", `${MAC_AUTH_URL}/`),
);

export async function verifyMacToken(
  token: string,
  keySet: JWTVerifyGetKey = macJwks,
): Promise<MacClaims> {
  const { payload } = await jwtVerify(token, keySet, {
    issuer: MAC_AUTH_ISSUER,
    audience: MAC_AUTH_AUDIENCE,
  });

  return macClaimsSchema.parse(payload);
}

export function readBearerToken(authorization: string | null) {
  if (!authorization) {
    return null;
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());

  return match?.[1] ?? null;
}
