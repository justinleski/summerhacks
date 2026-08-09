import { Hono } from "hono";
import { getStore } from "../db/index.js";
import {
  buildGoogleAuthorizeUrl,
  exchangeGoogleCode,
  fetchGoogleProfile,
  googleOAuthConfigured,
  googleRedirectUri,
  safeAppOrigin,
  signGoogleExchangeToken,
  signGoogleOAuthState,
  verifyGoogleExchangeToken,
  verifyGoogleOAuthState,
} from "../services/googleAuth.js";
import { neonAuthProxyConfigured, proxyNeonAuthRequest } from "../services/neonAuthProxy.js";

/**
 * Neon Auth same-origin proxy + app-owned Google OAuth.
 * Mounted at /api/auth and /api/oauth respectively from app.ts.
 */

export const neonAuthProxyRoutes = new Hono();

neonAuthProxyRoutes.all("/*", async (c) => {
  if (!neonAuthProxyConfigured()) {
    return c.json({ error: "Neon Auth is not configured" }, 503);
  }
  const pathname = new URL(c.req.url).pathname;
  const marker = "/api/auth/";
  const idx = pathname.indexOf(marker);
  const path =
    idx >= 0
      ? pathname.slice(idx + marker.length)
      : pathname.replace(/^\/+/, "");
  if (!path) {
    return c.json({ error: "Missing auth path" }, 404);
  }
  return proxyNeonAuthRequest(c.req.raw, path);
});

export const oauthGoogleRoutes = new Hono();

oauthGoogleRoutes.get("/", async (c) => {
  if (!googleOAuthConfigured()) {
    return c.json(
      {
        error:
          "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      },
      503,
    );
  }

  const requestOrigin = new URL(c.req.url).origin;
  const returnOrigin = safeAppOrigin(
    c.req.query("returnOrigin") ?? c.req.header("referer"),
    requestOrigin,
  );
  const state = await signGoogleOAuthState(returnOrigin);
  return c.redirect(buildGoogleAuthorizeUrl(state), 302);
});

oauthGoogleRoutes.get("/callback", async (c) => {
  const requestOrigin = new URL(c.req.url).origin;
  const err = c.req.query("error");
  const code = c.req.query("code");
  const state = c.req.query("state");

  const verified = state ? await verifyGoogleOAuthState(state) : null;
  const returnOrigin = safeAppOrigin(verified?.returnOrigin, requestOrigin);

  if (err) {
    return c.redirect(
      `${returnOrigin}/?authError=${encodeURIComponent(err)}`,
      302,
    );
  }
  if (!code || !verified) {
    return c.redirect(
      `${returnOrigin}/?authError=${encodeURIComponent("google_oauth_failed")}`,
      302,
    );
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    const profile = await fetchGoogleProfile(tokens.access_token);
    const user = await getStore().upsertFromAuth({
      authUserId: `google:${profile.sub}`,
      displayName: profile.name,
      avatarUrl: profile.picture,
      email: profile.email,
    });
    const exchange = await signGoogleExchangeToken(user.id);
    const dest = new URL(returnOrigin);
    dest.searchParams.set("googleExchange", exchange);
    return c.redirect(dest.toString(), 302);
  } catch (e) {
    console.error("Google OAuth callback failed", e);
    return c.redirect(
      `${returnOrigin}/?authError=${encodeURIComponent("google_oauth_failed")}`,
      302,
    );
  }
});

/** SPA exchanges the one-time token for a session (user id bearer, same as guest). */
oauthGoogleRoutes.post("/complete", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    exchange?: string;
  } | null;
  const exchange = body?.exchange?.trim();
  if (!exchange) return c.json({ error: "Missing exchange token" }, 400);

  const userId = await verifyGoogleExchangeToken(exchange);
  if (!userId) return c.json({ error: "Invalid or expired sign-in" }, 401);

  const user = await getStore().getUser(userId);
  if (!user) return c.json({ error: "User not found" }, 401);

  return c.json({
    token: user.id,
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      email: user.email,
    },
  });
});

oauthGoogleRoutes.get("/config", (c) =>
  c.json({
    configured: googleOAuthConfigured(),
    redirectUri: googleOAuthConfigured() ? googleRedirectUri() : null,
  }),
);
