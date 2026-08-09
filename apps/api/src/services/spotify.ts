import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { MemorySongInput } from "@summerhacks/shared";
import { getStore } from "../db/index.js";

const ACCOUNTS_BASE = "https://accounts.spotify.com";
const API_BASE = "https://api.spotify.com/v1";
const SCOPES = "playlist-modify-private playlist-modify-public user-read-email";
/** Refresh a little early so a request never races the expiry. */
const REFRESH_SKEW_MS = 60_000;
const STATE_TTL = "10m";

function spotifyError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

function clientId(): string {
  const value = process.env.SPOTIFY_CLIENT_ID?.trim();
  if (!value) throw spotifyError("Spotify is not configured on the API", 503);
  return value;
}

function clientSecret(): string {
  const value = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!value) throw spotifyError("Spotify is not configured on the API", 503);
  return value;
}

function redirectUri(): string {
  const value = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (!value) {
    throw spotifyError("SPOTIFY_REDIRECT_URI is not set on the API", 503);
  }
  return value;
}

export function spotifyConfigured(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID?.trim() &&
      process.env.SPOTIFY_CLIENT_SECRET?.trim() &&
      process.env.SPOTIFY_REDIRECT_URI?.trim(),
  );
}

/** OAuth `state` is signed with CRON_SECRET (single shared secret for MVP). */
function stateSecret(): Uint8Array {
  const value = process.env.CRON_SECRET?.trim();
  if (!value) {
    throw spotifyError("CRON_SECRET is not set on the API", 503);
  }
  return new TextEncoder().encode(value);
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64")}`;
}

export async function signSpotifyState(userId: string): Promise<string> {
  return new SignJWT({ userId, nonce: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(STATE_TTL)
    .sign(stateSecret());
}

export async function verifySpotifyState(
  state: string,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret(), {
      algorithms: ["HS256"],
    });
    return typeof payload.userId === "string"
      ? { userId: payload.userId }
      : null;
  } catch (err) {
    console.warn("Spotify state verify failed", err);
    return null;
  }
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    scope: SCOPES,
    redirect_uri: redirectUri(),
    state,
  });
  return `${ACCOUNTS_BASE}/authorize?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(`${ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn("Spotify token request failed", res.status, text);
    throw spotifyError("Spotify token request failed", 502);
  }
  return (await res.json()) as TokenResponse;
}

// --- Client credentials (no user auth) — used for track metadata ---

let clientToken: { token: string; expiresAtMs: number } | null = null;

async function getClientCredentialsToken(): Promise<string> {
  if (clientToken && clientToken.expiresAtMs > Date.now() + REFRESH_SKEW_MS) {
    return clientToken.token;
  }
  const json = await postToken(
    new URLSearchParams({ grant_type: "client_credentials" }),
  );
  clientToken = {
    token: json.access_token,
    expiresAtMs: Date.now() + json.expires_in * 1000,
  };
  return clientToken.token;
}

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
};

/**
 * Resolve pasted-track metadata server-side. Uses a cached client-credentials
 * token, so members never need to connect Spotify just to add a song.
 */
export async function resolveSpotifyTrack(
  trackId: string,
): Promise<MemorySongInput> {
  const token = await getClientCredentialsToken();
  const res = await fetch(`${API_BASE}/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) {
    throw spotifyError("That Spotify track was not found", 404);
  }
  if (!res.ok) {
    const text = await res.text();
    console.warn("Spotify track lookup failed", res.status, text);
    throw spotifyError("Could not read that track from Spotify", 502);
  }

  const track = (await res.json()) as SpotifyTrack;
  return {
    // Canonical URL so the stored value is always a valid https link.
    spotifyUrl: `https://open.spotify.com/track/${track.id}`,
    spotifyTrackId: track.id,
    trackTitle: track.name,
    artistName: track.artists[0]?.name ?? "Unknown artist",
    albumArtUrl: track.album?.images?.[0]?.url ?? null,
  };
}

// --- User tokens ---

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const json = await postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
  );
  if (!json.refresh_token) {
    throw spotifyError("Spotify did not return a refresh token", 502);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}

/** Refreshes and persists when the stored token is at/near expiry. */
export async function getValidAccessToken(userId: string): Promise<string> {
  const store = getStore();
  const connection = await store.getSpotifyConnection(userId);
  if (!connection) {
    throw spotifyError("Connect Spotify first", 400);
  }
  if (connection.expiresAt.getTime() > Date.now() + REFRESH_SKEW_MS) {
    return connection.accessToken;
  }

  const json = await postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    }),
  );
  const updated = await store.upsertSpotifyConnection(userId, {
    spotifyUserId: connection.spotifyUserId,
    accessToken: json.access_token,
    // Spotify may omit refresh_token on refresh — keep the existing one.
    refreshToken: json.refresh_token ?? connection.refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  });
  return updated.accessToken;
}

export async function fetchSpotifyProfileId(
  accessToken: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn("Spotify profile lookup failed", res.status, text);
    throw spotifyError("Could not read your Spotify profile", 502);
  }
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** Creates a private playlist in the user's own account and fills it. */
export async function createPlaylistWithTracks(input: {
  userId: string;
  spotifyUserId: string;
  name: string;
  description: string;
  trackIds: string[];
}): Promise<{ playlistId: string; playlistUrl: string }> {
  const accessToken = await getValidAccessToken(input.userId);

  const createRes = await fetch(
    `${API_BASE}/users/${encodeURIComponent(input.spotifyUserId)}/playlists`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        public: false,
        collaborative: false,
      }),
    },
  );
  if (!createRes.ok) {
    const text = await createRes.text();
    console.warn("Spotify playlist create failed", createRes.status, text);
    throw spotifyError("Could not create the Spotify playlist", 502);
  }

  const playlist = (await createRes.json()) as {
    id: string;
    external_urls?: { spotify?: string };
  };

  if (input.trackIds.length > 0) {
    const addRes = await fetch(`${API_BASE}/playlists/${playlist.id}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: input.trackIds.map((id) => `spotify:track:${id}`),
      }),
    });
    if (!addRes.ok) {
      const text = await addRes.text();
      console.warn("Spotify add tracks failed", addRes.status, text);
      throw spotifyError("Could not add tracks to the playlist", 502);
    }
  }

  return {
    playlistId: playlist.id,
    playlistUrl:
      playlist.external_urls?.spotify ??
      `https://open.spotify.com/playlist/${playlist.id}`,
  };
}
