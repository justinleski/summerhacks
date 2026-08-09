import { createAuthClient } from "@neondatabase/neon-js/auth";

export const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL as
  | string
  | undefined;

export const neonAuthEnabled = Boolean(neonAuthUrl?.trim());

export const authClient = neonAuthEnabled
  ? createAuthClient(neonAuthUrl!.trim())
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
    throw new Error(neonErrorMessage(result.error, "Sign up failed"));
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
    throw new Error(neonErrorMessage(result.error, "Sign in failed"));
  }
}

export async function neonVerifyEmailOtp(input: {
  email: string;
  otp: string;
}): Promise<void> {
  const client = asAuthClient();
  const result = await client.emailOtp.verifyEmail(input);
  if (result.error) {
    throw new Error(neonErrorMessage(result.error, "Invalid verification code"));
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
      throw new Error(neonErrorMessage(result.error, "Could not resend code"));
    }
    return;
  }
  if (client.sendVerificationEmail) {
    const result = await client.sendVerificationEmail({
      email,
      callbackURL: window.location.origin,
    });
    if (result.error) {
      throw new Error(neonErrorMessage(result.error, "Could not resend code"));
    }
    return;
  }
  throw new Error("Resend is not available on this auth client");
}
