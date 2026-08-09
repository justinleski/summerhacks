import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const ACCOUNTS = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const STATE_TTL = "10m";
const SCOPES = "openid email profile";

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
};

function googleError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

function clientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!value) throw googleError("Google sign-in is not configured", 503);
  return value;
}

function clientSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!value) throw googleError("Google sign-in is not configured", 503);
  return value;
}

/**
 * Prefer GOOGLE_REDIRECT_URI. Otherwise:
 * - Vercel: https://$VERCEL_PROJECT_PRODUCTION_URL/api/oauth/google/callback
 * - Local: http://localhost:$PORT/api/oauth/google/callback
 */
export function googleRedirectUri(): string {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    const host = vercelHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}/api/oauth/google/callback`;
  }

  const port = process.env.PORT?.trim() || "8787";
  return `http://localhost:${port}/api/oauth/google/callback`;
}

function stateSecret(): Uint8Array {
  const value =
    process.env.CRON_SECRET?.trim() ||
    process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!value) {
    throw googleError("CRON_SECRET is not set on the API", 503);
  }
  return new TextEncoder().encode(value);
}

export async function signGoogleOAuthState(returnOrigin: string): Promise<string> {
  return new SignJWT({ returnOrigin, nonce: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(STATE_TTL)
    .sign(stateSecret());
}

export async function verifyGoogleOAuthState(
  state: string,
): Promise<{ returnOrigin: string } | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret(), {
      algorithms: ["HS256"],
    });
    return typeof payload.returnOrigin === "string"
      ? { returnOrigin: payload.returnOrigin }
      : null;
  } catch (err) {
    console.warn("Google OAuth state verify failed", err);
    return null;
  }
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: googleRedirectUri(),
    scope: SCOPES,
    state,
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
  });
  return `${ACCOUNTS}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
};

export async function exchangeGoogleCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Google token exchange failed", res.status, text);
    throw googleError("Google sign-in failed", 400);
  }
  return (await res.json()) as TokenResponse;
}

export async function fetchGoogleProfile(
  accessToken: string,
): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Google userinfo failed", res.status, text);
    throw googleError("Could not load Google profile", 400);
  }
  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!data.sub || !data.email) {
    throw googleError("Google profile missing email", 400);
  }
  return {
    sub: data.sub,
    email: data.email,
    emailVerified: Boolean(data.email_verified),
    name: data.name?.trim() || data.email.split("@")[0] || "User",
    picture: data.picture ?? null,
  };
}

/** One-time exchange token so the SPA can claim the session without putting user id in the URL long-term. */
export async function signGoogleExchangeToken(userId: string): Promise<string> {
  return new SignJWT({ userId, purpose: "google_oauth_exchange" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(stateSecret());
}

export async function verifyGoogleExchangeToken(
  token: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, stateSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.purpose !== "google_oauth_exchange") return null;
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
}

export function safeAppOrigin(
  candidate: string | null | undefined,
  fallback: string,
): string {
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}
