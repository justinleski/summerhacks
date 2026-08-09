# Memories — API

All `/api/memories/*` require auth **and** session membership (403 otherwise).

## Memories

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/memories` | Locked only |
| GET | `/api/memories/session/:sessionId` | Open: collaborative draft; locked: full; expired/absent: 404 |
| GET | `/api/memories/:id` | Same |
| POST | `/api/memories/:id/photos` | Multipart `file`, ≤4MB. Prefer client compress first |
| DELETE | `/api/memories/:id/photos/:photoId` | Owner only |
| PUT | `/api/memories/:id/songs/:position` | `{ spotifyUrl }`, position 0–2 |
| DELETE | `/api/memories/:id/songs/:position` | |
| PATCH | `/api/memories/:id/note` | `{ note }` ≤140 or null |
| POST | `/api/memories/:id/submit` | `{ confirm: true }` — soft “marked done”; **does not lock** |
| POST | `/api/memories/:id/export-playlist` | Locked only; idempotent |

Mutations → **409** when not `open` or past `windowExpiresAt`. Submit no longer blocks further edits.

### Open response

```jsonc
{ "status": "open", "photos": [...], "songs": [...],
  "myPhotos": [...], "mySongs": [...], "mySubmitted": false,
  "members": [...], "note", "windowExpiresAt", ... }
```

### Locked response

```jsonc
{ "status": "locked", "lockedAt", "photos": [...], "songs": [...],
  "myPlaylist": { "spotifyPlaylistId", "spotifyPlaylistUrl" } | null }
```

## Spotify / Internal

Unchanged connect/callback/status/disconnect. Sweeper:

| Method | Path | Returns |
| --- | --- | --- |
| GET/POST | `/api/internal/sweep-memories` | `{ locked, expired, deletedPhotos }` |

Locks contentful past-window memories (exports playlists), expires empty ones.
