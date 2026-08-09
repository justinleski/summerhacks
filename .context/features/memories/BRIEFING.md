# Memories — agent briefing

One memory per **bump session**, created **inside `tryMatchBump`** right after the `sessions` + `session_members` inserts — so it exists before the client polls. 24h window from `sessions.created_at`, server-authoritative. Every session member contributes **3 Spotify tracks** + **photos in pairs (2/4/6/8)** + an optional **shared note (≤140)**. Submitting locks that member forever. The **last** submit locks the memory and reveals everything.

Bump-only — never attach to calendar events. Pre-feature sessions have no memory row and render the old session view.

## Locked rules

- Trigger: memory row at bump match, **not** on `confirmSession`
- Membership: **every** `session_members` row must submit
- Pre-lock visibility: own photos/songs only; the note is shared and visible; peer content is **never serialized**
- Lock: instantly on last submit (or at window close if all submitted)
- Expiry: window closes with anyone missing → `expired`, invisible everywhere, Blob photos deleted best-effort
- No unlock, ever

## N-generic

`session_members` supports N; `tryMatchBump` only ever inserts 2. All memory code loops over members — **no `members.length !== 2` checks anywhere**. Keep it that way.

## API cheat sheet

- `GET /api/memories` — locked only, newest hangout first
- `GET /api/memories/session/:sessionId` · `GET /api/memories/:id` — draft while open, full reveal when locked, 404 when expired
- `POST /api/memories/:id/photos` — multipart `file`, ≤4MB, max 8/member
- `PUT|DELETE /api/memories/:id/songs/:position` — position 0-2, body `{ spotifyUrl }`
- `PATCH /api/memories/:id/note` — `{ note }`, any member, last write wins
- `POST /api/memories/:id/submit` — `{ confirm: true }`
- `POST /api/memories/:id/export-playlist` — idempotent, locked only
- `GET /api/spotify/connect|status|callback` · `DELETE /api/spotify/disconnect`
- `GET|POST /api/internal/sweep-memories` — cron

Every route re-checks `session_members` → **403** for non-members. Mutations → **409** once not `open` or once the caller submitted.

## Gotchas

- `/api/spotify/callback` **must not** use `requireAuth` — the browser arrives with no bearer token; the signed `state` (HS256 over `CRON_SECRET`) carries the user id
- Vercel Cron sends **GET**, not POST, and auto-sends `Authorization: Bearer $CRON_SECRET` — both methods are registered
- Track metadata uses a cached **client-credentials** token, so adding a song needs no user OAuth
- `memory_songs` has a unique index on `(memory_id, user_id, position)` — that is what makes slot replacement a real upsert
- Blob cleanup in the sweeper **and** playlist auto-export on lock are **awaited** (a serverless function can freeze right after responding). Both swallow their own errors — the export loop sits outside the submit handler's `try`, so submit returns **200** even if every Spotify call fails; members recover with the manual `POST /export-playlist`
- Membership comes from `session_members`, not `memory_submissions`

## UI

`/memories/session/:sessionId` — countdown, member dots (no peer content), photo grid, 3 song slots, shared note, Spotify banner, sticky submit + confirm modal. Polls every 2s and redirects on lock.
`/memories/:id` — receipt, photobooth carousel, playlist card. Loads once, no polling.
`/memories` — list, newest hangout first.

Styling is plain CSS in `apps/web/src/styles.css` with `--var`s. Receipt fonts are component-scoped `--receipt-font-*`; do not touch global `--font-display` / `--font-body`. Photobooth shuffle is gated behind `prefers-reduced-motion`.

## Ops

`npm run db:push -w @summerhacks/api` after pulling. Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN` on Vercel Preview + Production, and register both redirect URIs in the Spotify dashboard. Without Spotify vars everything still works except song paste and playlists.
