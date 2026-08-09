# Memories — API

All `/api/memories/*` routes require `Authorization: Bearer <token>` (`requireAuth`) **and** membership of the memory's session — non-members get 403.

## Memories

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/memories` | Locked memories only, newest hangout first: `{ id, sessionId, hangoutAt, lockedAt, memberDisplayNames, coverPhotoUrl, songCount }` |
| GET | `/api/memories/session/:sessionId` | Memory for a session. Draft while `open`, full reveal once `locked`, 404 when `expired` or absent |
| GET | `/api/memories/:id` | Same shape, keyed by memory id |
| POST | `/api/memories/:id/photos` | Multipart `file`. ≤4MB, JPEG/PNG/WebP/GIF, max 8 per member. 503 without `BLOB_READ_WRITE_TOKEN` |
| DELETE | `/api/memories/:id/photos/:photoId` | Owner only |
| PUT | `/api/memories/:id/songs/:position` | `position` 0-2. Body `{ spotifyUrl }` → resolved server-side, upserts that slot |
| DELETE | `/api/memories/:id/songs/:position` | Clears that slot |
| PATCH | `/api/memories/:id/note` | Body `{ note }` ≤140 chars or `null`. Any member, last write wins |
| POST | `/api/memories/:id/submit` | Body `{ confirm: true }`. Validates 3 songs + even photo count. Locks if last submitter, then awaits playlist export for every connected member |
| POST | `/api/memories/:id/export-playlist` | Creates the caller's private playlist. Idempotent. 400 unless locked |

On the submit that locks, playlist export runs awaited inside the request but **cannot affect the status code** — a total Spotify failure still returns **200** with `status: "locked"` and `myPlaylist: null`. Failures are logged server-side; the client recovers via `POST /export-playlist`.

Mutating routes return **409** once the memory is not `open`, or once the caller has submitted.

### Response shapes

`status` discriminates the union (`memoryResponseSchema` in `packages/shared`):

```jsonc
// status: "open" — viewer-scoped
{ "id", "sessionId", "status": "open", "note", "hangoutAt", "windowStartsAt",
  "windowExpiresAt", "lockedAt": null, "mySubmitted": false,
  "myPhotos": [...], "mySongs": [...],
  "members": [{ "userId", "displayName", "avatarUrl", "submitted", "isViewer" }] }

// status: "locked" — everyone revealed
{ ..., "status": "locked", "lockedAt", "photos": [...], "songs": [...],
  "myPlaylist": { "spotifyPlaylistId", "spotifyPlaylistUrl" } | null }
```

Peer photos and songs are absent from the `open` payload — they are never sent, not merely hidden in the UI.

## Spotify

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/spotify/connect` | → `{ authUrl }`. `state` is a JWT signed with `CRON_SECRET`. 503 if unconfigured |
| GET | `/api/spotify/callback` | **No `requireAuth`** — the browser arrives without a bearer token, so the signed `state` carries the user id. Redirects to `/memories?spotify=connected\|denied\|error` |
| GET | `/api/spotify/status` | → `{ connected, spotifyUserId }` |
| DELETE | `/api/spotify/disconnect` | Drops the connection row |

Scopes: `playlist-modify-private playlist-modify-public user-read-email`.

Track metadata uses a cached **client-credentials** token, so members never need to connect Spotify just to add a song.

## Internal

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/internal/sweep-memories` | What Vercel Cron actually calls (cron is always GET) |
| POST | `/api/internal/sweep-memories` | Same handler, for manual runs |

Authorized by `x-cron-secret: $CRON_SECRET`, `Authorization: Bearer $CRON_SECRET` (Vercel sends this automatically when the env var is set), or the presence of `x-vercel-cron`. Returns `{ expired, deletedPhotos }`.
