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
};

/** Fresh JWT for API calls (short-lived). */
export async function getNeonAccessToken(): Promise<string | null> {
  if (!authClient) return null;

  // Prefer explicit token endpoint when available
  const tokenFn = (
    authClient as { token?: () => Promise<{ data?: { token?: string } }> }
  ).token;
  if (typeof tokenFn === "function") {
    const result = await tokenFn.call(authClient);
    if (result?.data?.token) return result.data.token;
  }

  const session = await authClient.getSession();
  const access =
    session.data?.session &&
    (session.data.session as { access_token?: string }).access_token;
  return access ?? null;
}

export async function getNeonSessionUser(): Promise<NeonAuthUser | null> {
  if (!authClient) return null;
  const session = await authClient.getSession();
  const user = session.data?.user;
  if (!user) return null;
  return user as NeonAuthUser;
}
