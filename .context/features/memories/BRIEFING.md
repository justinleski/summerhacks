# Memories — agent briefing (album receipt interior)

**Album** = pixel covers (`albums`) + receipt interior (`memories` + photos/songs). One interior per bump session, created in `pairBumps` / `tryMatchBump` right after session + members. Window = `sessions.created_at` + `albumEditWindowMs()` (same as cover `editable_until`; `MEMORY_WINDOW_MS` aliases `ALBUM_EDIT_WINDOW_MS`).

Each member: **3 Spotify tracks** + **photos in pairs (2/4/6/8)** + optional shared note. **Collaborative** — everyone sees everyone’s content while `open`. **Hard lock only at window end** (sweeper). Soft “Mark done” does not lock or block edits.

## Locked rules

- Trigger: memory row at bump match, not on `confirmSession`
- Edits allowed while `status === open` and `now < windowExpiresAt`
- Visibility while open: all photos/songs serialized
- Window end + content → `locked` + playlist export; empty → `expired`
- Cover ready/vote is independent; does not lock receipt content
- Photos: client `compressImageForUpload` before Blob

## API cheat sheet

- `GET /api/memories` — locked list
- `GET /api/memories/session/:sessionId` · `GET /api/memories/:id`
- `POST /api/memories/:id/photos` · `DELETE .../photos/:photoId`
- `PUT|DELETE /api/memories/:id/songs/:position`
- `PATCH /api/memories/:id/note`
- `POST /api/memories/:id/submit` — soft done only
- `POST /api/memories/:id/export-playlist`
- Spotify connect/status/callback/disconnect
- `GET|POST /api/internal/sweep-memories` → `{ locked, expired, deletedPhotos }`

Mutations → **409** when not open or past window (not on soft submit).

## Gotchas

- Spotify callback must not use `requireAuth` (signed `state`)
- Vercel Cron is GET; register both methods
- Track metadata = client-credentials; playlist export needs user OAuth
- Await Blob cleanup + playlist export in sweeper (serverless freeze)
- Membership from `session_members`, not `memory_submissions`

## UI

`/session/:id` — cover + “Edit photos + songs”
`/memories/session/:sessionId` — collaborative build, countdown, optional mark done
`/memories/:id` — receipt + photobooth + playlist
`/memories` — locked list

## Ops

`npm run db:push -w @summerhacks/api`. Env: Spotify + `CRON_SECRET` + `BLOB_READ_WRITE_TOKEN`. Optional `ALBUM_EDIT_WINDOW_MS=60000` for short windows.
