import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type NeonAuthClaims = JWTPayload & {
  email?: string;
  name?: string;
  image?: string;
  picture?: string;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export function neonAuthConfigured(): boolean {
  return Boolean(process.env.NEON_AUTH_BASE_URL?.trim());
}

function authBaseUrl(): string {
  const url = process.env.NEON_AUTH_BASE_URL?.trim();
  if (!url) throw new Error("NEON_AUTH_BASE_URL is not set");
  return url.replace(/\/$/, "");
}

function getJwks() {
  if (!jwks) {
    const explicit = process.env.NEON_AUTH_JWKS_URL?.trim();
    const jwksUrl = explicit || `${authBaseUrl()}/.well-known/jwks.json`;
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwks;
}

export function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}

/** Verify a Neon Auth access token (EdDSA JWT). */
export async function verifyNeonAccessToken(
  token: string,
): Promise<NeonAuthClaims | null> {
  if (!neonAuthConfigured()) return null;
  try {
    const base = authBaseUrl();
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: new URL(base).origin,
      algorithms: ["EdDSA"],
    });
    if (!payload.sub) return null;
    return payload as NeonAuthClaims;
  } catch (err) {
    console.warn("Neon Auth JWT verify failed", err);
    return null;
  }
}

export function displayNameFromClaims(claims: NeonAuthClaims): string {
  if (typeof claims.name === "string" && claims.name.trim()) {
    return claims.name.trim().slice(0, 64);
  }
  if (typeof claims.email === "string" && claims.email.includes("@")) {
    return claims.email.split("@")[0]!.slice(0, 64);
  }
  return "User";
}

export function avatarFromClaims(claims: NeonAuthClaims): string | null {
  const raw = claims.image ?? claims.picture;
  return typeof raw === "string" && raw.startsWith("http") ? raw : null;
}
