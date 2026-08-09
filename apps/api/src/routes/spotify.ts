import { Hono } from "hono";
import { getStore } from "../db/index.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchSpotifyProfileId,
  signSpotifyState,
  spotifyConfigured,
  verifySpotifyState,
} from "../services/spotify.js";
import { httpErrorFromStore } from "./http-errors.js";

export const spotifyRoutes = new Hono<{ Variables: AuthVariables }>();

spotifyRoutes.get("/connect", requireAuth, async (c) => {
  if (!spotifyConfigured()) {
    return c.json(
      {
        error:
          "Spotify is not configured (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET unset). Memories still work without a playlist.",
      },
      503,
    );
  }
  try {
    const state = await signSpotifyState(c.get("userId"));
    return c.json({ authUrl: buildAuthorizeUrl(state) });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

/**
 * Spotify redirects the browser straight here, so there is no bearer token —
 * the signed `state` carries the app user id instead of `requireAuth`.
 */
spotifyRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const denied = c.req.query("error");

  if (denied) return c.redirect("/memories?spotify=denied");
  if (!code || !state) return c.redirect("/memories?spotify=error");

  const verified = await verifySpotifyState(state);
  if (!verified) return c.redirect("/memories?spotify=error");

  const store = getStore();
  const user = await store.getUser(verified.userId);
  if (!user) return c.redirect("/memories?spotify=error");

  try {
    const tokens = await exchangeCodeForTokens(code);
    const spotifyUserId = await fetchSpotifyProfileId(tokens.accessToken);
    await store.upsertSpotifyConnection(user.id, {
      spotifyUserId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
    return c.redirect("/memories?spotify=connected");
  } catch (err) {
    console.warn("Spotify callback failed", err);
    return c.redirect("/memories?spotify=error");
  }
});

spotifyRoutes.get("/status", requireAuth, async (c) => {
  const connection = await getStore().getSpotifyConnection(c.get("userId"));
  return c.json({
    connected: Boolean(connection),
    spotifyUserId: connection?.spotifyUserId ?? null,
  });
});

spotifyRoutes.delete("/disconnect", requireAuth, async (c) => {
  const removed = await getStore().deleteSpotifyConnection(c.get("userId"));
  return c.json({ ok: removed });
});
