# Album — agent briefing

**Per-member pixel covers** for a bump session. Each person draws their own cover; then reveal → vote → optional CS2-style spin if contested / no selection. No PartyKit / websockets.

## Product

- Create/open your cover from `/session/:id` after bump.
- Edit window: **24h from `sessions.created_at`** (`ALBUM_EDIT_WINDOW_MS`).
- Mark **I'm ready** → locks your cover. When all members ready (or window ends) → **voting**.
- Voting: pick a cover, **Can't decide**, or **Spin now**.
- Unanimous non-null votes → that cover wins (`method: vote`).
- Split votes, abstains, or force resolve → server picks random winner (`method: spin`); client plays decelerating highlight animation.
- Grid: **16×16** shipped; **32** in types for later.

## Architecture

- **Neon `albums`**: one row per `(session_id, user_id)` — `pixels`, `cover_url`, `ready_at`, `editable_until`.
- **`album_votes` / `album_contests`**: votes + winner.
- **Blob**: PNG preview on Save.
- **Polling** (`COVER_CONTEST_POLL_MS`) while editing/voting — no live paint sync.

## APIs

- `GET /api/sessions/:id/album` → `{ covers, contest, mine }`
- `POST /api/sessions/:id/album` → create mine
- `PATCH /api/sessions/:id/album` → update mine
- `POST /api/sessions/:id/album/ready`
- `POST /api/sessions/:id/album/vote` `{ choiceUserId }`
- `POST /api/sessions/:id/album/resolve`
- `POST /api/uploads/album-cover`

## Local

```bash
npm run dev
# optional: ALBUM_EDIT_WINDOW_MS=60000
# Neon schema: apply apps/api/drizzle/0001_album_covers.sql or db:push
```

## Extension points

- Album interior (songs/photos/receipt) lives in `memories*` tables — see `.context/features/memories/` and `docs/memories/`. Same `session_id` + 24h window as covers.
- `grid_size` 32 UI when ready.

## Non-goals

Live collaborative paint; WebRTC; always-on WS.
