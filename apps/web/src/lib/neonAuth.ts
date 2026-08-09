import { createAuthClient } from "@neondatabase/neon-js/auth";

/**
 * Prefer same-origin `/api/auth` (Hono proxy → Neon). Absolute Neon Auth URLs
 * are third-party to the SPA and break on Safari / iOS Private.
 */
function resolveNeonAuthUrl(): string | undefined {
  const configured = (import.meta.env.VITE_NEON_AUTH_URL as string | undefined)
    ?.trim();
  if (!configured) return undefined;
  let pathOrUrl = configured;
  // Force same-origin proxy when pointing at hosted Neon Auth.
  if (
    configured.includes("neonauth.") ||
    configured.includes("/neondb/auth")
  ) {
    pathOrUrl = "/api/auth";
  }
  if (pathOrUrl.startsWith("/")) {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${pathOrUrl}`;
    }
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  return undefined;
}

export const neonAuthUrl = resolveNeonAuthUrl();

export const neonAuthEnabled = Boolean(
  (import.meta.env.VITE_NEON_AUTH_URL as string | undefined)?.trim(),
);

export const authClient = neonAuthEnabled
  ? createAuthClient(neonAuthUrl ?? "/api/auth")
  : null;

export type NeonAuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  emailVerified?: boolean;
};

type SessionPayload = {
  token?: string;
  access_token?: string;
};

function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}

function jwtFromSession(
  session: SessionPayload | null | undefined,
): string | null {
  if (!session) return null;
  // Neon Auth injects the short-lived JWT from the `set-auth-jwt` response
  // header into `session.token` (see @neondatabase/auth onSuccess hook).
  if (session.token && looksLikeJwt(session.token)) return session.token;
  if (session.access_token && looksLikeJwt(session.access_token)) {
    return session.access_token;
  }
  return null;
}

export type NeonSessionResult = {
  user: NeonAuthUser;
  jwt: string;
};

function neonErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; error?: { message?: string } };
    if (typeof e.message === "string" && e.message.trim()) return e.message;
    if (typeof e.error?.message === "string" && e.error.message.trim()) {
      return e.error.message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export class NeonAuthError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "NeonAuthError";
    this.code = code;
  }
}

function throwNeonError(
  error: { message?: string; code?: string } | null | undefined,
  fallback: string,
): never {
  throw new NeonAuthError(
    neonErrorMessage(error, fallback),
    typeof error?.code === "string" ? error.code : undefined,
  );
}

export function isNeonUserAlreadyExists(error: unknown): boolean {
  if (error instanceof NeonAuthError) {
    if (
      error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
      error.code === "USER_ALREADY_EXISTS"
    ) {
      return true;
    }
  }
  if (error && typeof error === "object") {
    const e = error as { code?: string; error?: { code?: string } };
    const code = e.code ?? e.error?.code;
    if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return true;
    if (code === "USER_ALREADY_EXISTS") return true;
  }
  const message = neonErrorMessage(error, "");
  return /already exists/i.test(message);
}

/** Absolute app origin for OAuth callbacks (avoids Neon 400 MISSING_ORIGIN). */
export function neonAppOrigin(): string {
  return window.location.origin;
}

/** One getSession() — user + JWT from set-auth-jwt / session.token. */
export async function getNeonSession(): Promise<NeonSessionResult | null> {
  if (!authClient) return null;
  const result = await authClient.getSession();
  const user = result.data?.user as NeonAuthUser | undefined;
  if (!user) return null;
  const jwt = jwtFromSession(
    result.data?.session as SessionPayload | undefined,
  );
  if (!jwt) return null;
  return { user, jwt };
}

/** Fresh JWT for API calls (short-lived). */
export async function getNeonAccessToken(): Promise<string | null> {
  if (!authClient) return null;

  const session = await getNeonSession();
  if (session?.jwt) return session.jwt;

  const tokenFn = (
    authClient as { token?: () => Promise<{ data?: { token?: string } }> }
  ).token;
  if (typeof tokenFn === "function") {
    const result = await tokenFn.call(authClient);
    const token = result?.data?.token;
    if (token && looksLikeJwt(token)) return token;
  }

  return null;
}

export async function getNeonSessionUser(): Promise<NeonAuthUser | null> {
  const session = await getNeonSession();
  return session?.user ?? null;
}

type AuthResult = {
  data?: {
    user?: NeonAuthUser;
    session?: SessionPayload & { user?: NeonAuthUser };
  } | null;
  error?: { message?: string; code?: string } | null;
};

function asAuthClient() {
  if (!authClient) throw new Error("Neon Auth is not configured");
  return authClient as typeof authClient & {
    signUp: {
      email: (body: {
        email: string;
        password: string;
        name: string;
      }) => Promise<AuthResult>;
    };
    signIn: {
      email: (body: {
        email: string;
        password: string;
      }) => Promise<AuthResult>;
      social: (body: {
        provider: "google";
        callbackURL: string;
        newUserCallbackURL?: string;
        errorCallbackURL?: string;
      }) => Promise<unknown>;
    };
    emailOtp: {
      verifyEmail: (body: {
        email: string;
        otp: string;
      }) => Promise<AuthResult>;
      sendVerificationOtp: (body: {
        email: string;
        type: "email-verification" | "sign-in" | "forget-password";
      }) => Promise<AuthResult>;
    };
    sendVerificationEmail?: (body: {
      email: string;
      callbackURL?: string;
    }) => Promise<AuthResult>;
  };
}

export async function neonSignUpEmail(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ needsVerification: boolean; user: NeonAuthUser | null }> {
  const client = asAuthClient();
  const result = await client.signUp.email(input);
  if (result.error) {
    throwNeonError(result.error, "Sign up failed");
  }
  const user = (result.data?.user ?? null) as NeonAuthUser | null;
  const needsVerification = Boolean(user && user.emailVerified === false);
  return { needsVerification, user };
}

export async function neonSignInEmail(input: {
  email: string;
  password: string;
}): Promise<void> {
  const client = asAuthClient();
  const result = await client.signIn.email(input);
  if (result.error) {
    throwNeonError(result.error, "Sign in failed");
  }
}

export async function neonSignInGoogle(): Promise<void> {
  // App-owned Google OAuth (same-origin callback). Avoids Neon shared
  // oauth callback host mismatch that 400s on iOS Safari Private.
  const cfgRes = await fetch("/api/oauth/google/config");
  const cfg = (await cfgRes.json().catch(() => null)) as {
    configured?: boolean;
  } | null;
  if (!cfg?.configured) {
    throw new Error(
      "Google sign-in is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }
  const returnOrigin = encodeURIComponent(neonAppOrigin());
  window.location.assign(`/api/oauth/google?returnOrigin=${returnOrigin}`);
}

/** Finish Google OAuth after redirect (?googleExchange=...). */
export async function completeGoogleOAuthExchange(
  exchange: string,
): Promise<{ token: string; displayName: string }> {
  const res = await fetch("/api/oauth/google/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exchange }),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || "Google sign-in failed";
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // keep
    }
    throw new Error(message);
  }
  const data = (await res.json()) as {
    token: string;
    user: { displayName: string };
  };
  return { token: data.token, displayName: data.user.displayName };
}

export async function neonVerifyEmailOtp(input: {
  email: string;
  otp: string;
}): Promise<void> {
  const client = asAuthClient();
  const result = await client.emailOtp.verifyEmail(input);
  if (result.error) {
    throwNeonError(result.error, "Invalid verification code");
  }
}

export async function neonResendVerificationOtp(email: string): Promise<void> {
  const client = asAuthClient();
  if (client.emailOtp?.sendVerificationOtp) {
    const result = await client.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    if (result.error) {
      throwNeonError(result.error, "Could not resend code");
    }
    return;
  }
  if (client.sendVerificationEmail) {
    const result = await client.sendVerificationEmail({
      email,
      callbackURL: neonAppOrigin(),
    });
    if (result.error) {
      throwNeonError(result.error, "Could not resend code");
    }
    return;
  }
  throw new Error("Resend is not available on this auth client");
}
