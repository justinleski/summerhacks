# Memories — data model (album interior)

Six tables in `apps/api/src/db/schema.ts`. Push-only:

```bash
npm run db:push -w @summerhacks/api
```

**Album aggregate** = `session_id`:

- Covers: `albums` / `album_votes` / `album_contests` (one cover per member)
- Interior: `memories` (one per session) → `memory_photos` / `memory_songs` / …

## `memories`

| Column | Notes |
| --- | --- |
| id | uuid |
| session_id | FK sessions, **unique** — joins covers + interior |
| status | `open` \| `locked` \| `expired` |
| note | shared, ≤140 via Zod |
| window_starts_at | = `sessions.created_at` |
| window_expires_at | = start + `albumEditWindowMs()` (same as cover `editable_until`) |
| locked_at | set by sweeper when window ends with content |

## `memory_submissions`

Composite PK `(memory_id, user_id)`. Soft **“marked done”** via `submitted_at` — does **not** block edits. Membership is always from `session_members`.

## `memory_photos`

Blob URL + `upload_order`. Max 8/member; even counts for “ready” validation. Clients compress before upload; API still enforces ≤4MB.

## `memory_songs`

3 slots/member (`position` 0–2). Unique `(memory_id, user_id, position)`.

## `memory_playlists` / `spotify_connections`

Per-member playlist rows; OAuth tokens for export. Metadata paste uses client-credentials (no user OAuth required to add a track).

## Verify SQL

```sql
select m.id, m.status, m.window_expires_at,
       (select count(*) from albums a where a.session_id = m.session_id) as covers
from memories m
order by m.window_starts_at desc limit 5;
```
