# Memories — data model

Six tables, all added to `apps/api/src/db/schema.ts`. Push-only — there is no migrations table:

```bash
npm run db:push -w @summerhacks/api
```

> `apps/api/drizzle/0000_init.sql` is stale and unused. Do not edit it; `schema.ts` is the only source of truth.

## `memories`

| Column | Notes |
| --- | --- |
| id | uuid |
| session_id | FK sessions, **unique** — one memory per session |
| status | `open` \| `locked` \| `expired` |
| note | text, nullable, ≤140 chars enforced in Zod. Shared, any member writes |
| window_starts_at | mirrors `sessions.created_at` (the hangout timestamp) |
| window_expires_at | `window_starts_at` + 24h, server-authoritative |
| locked_at | set when the last member submits |
| created_at | timestamptz |

## `memory_submissions`

Composite PK `(memory_id, user_id)`. One row seeded per session member at creation with `submitted_at = null`; submitting stamps it. A non-null `submitted_at` means "locked in".

Membership itself is read from **`session_members`**, not from this table, so a memory stays correct if a session ever gains members.

## `memory_photos`

| Column | Notes |
| --- | --- |
| id | uuid |
| memory_id / user_id | FK |
| photo_url | Vercel Blob public URL |
| upload_order | 0-based per member; drives the round-robin interleave |

Max 8 per member, and a member may only submit on an even count (2/4/6/8).

## `memory_songs`

| Column | Notes |
| --- | --- |
| id | uuid |
| memory_id / user_id | FK |
| spotify_url | canonical `https://open.spotify.com/track/{id}` |
| spotify_track_id / track_title / artist_name | resolved server-side via client credentials |
| album_art_url | nullable |
| position | 0-2 |

Unique index `memory_songs_user_position_idx` on `(memory_id, user_id, position)` — makes "replace the track in slot 1" a real upsert instead of a read-modify-write race.

## `memory_playlists`

Composite PK `(memory_id, user_id)`. One private playlist per member per memory. Presence of a row is the idempotency check for export.

## `spotify_connections`

PK `user_id`. Stores `spotify_user_id`, `access_token`, `refresh_token`, `expires_at`. Refreshed in place when within 60s of expiry.

> Tokens are stored in plaintext, same as every other credential in this MVP. Rotate the Neon database if it is ever exposed.

## Verify SQL

```sql
-- memory created with every bump session
select m.id, m.status, m.window_expires_at, count(sm.user_id) as members
from memories m
join session_members sm on sm.session_id = m.session_id
group by m.id order by m.window_starts_at desc limit 5;

-- who still owes a submission
select m.id, u.display_name, ms.submitted_at
from memories m
join session_members sm on sm.session_id = m.session_id
join users u on u.id = sm.user_id
left join memory_submissions ms on ms.memory_id = m.id and ms.user_id = sm.user_id
where m.status = 'open';

-- contributions per member
select user_id, count(*) filter (where true) as photos from memory_photos group by user_id;
select memory_id, count(*) as songs from memory_songs group by memory_id;
```
