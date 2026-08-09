# Memories — architecture

```text
Bump match (tryMatchBump)
  → sessions row + session_members rows
  → createMemoryForSession(sessionId, memberIds, sessions.created_at)
       └─ memories(status=open, window = created_at .. +24h)
       └─ memory_submissions(submitted_at=null) per member
  ↑ all inside tryMatchBump, so the row exists before the client polls

Member contributes (window open)
  → POST /memories/:id/photos   → Blob put → memory_photos(upload_order = max+1)
  → PUT  /memories/:id/songs/:p → parse track id → Spotify /v1/tracks (client creds)
                                → memory_songs upsert on (memory, user, position)
  → PATCH /memories/:id/note    → shared, last write wins

Member submits
  → validate exactly 3 songs + photo count in {2,4,6,8}
  → memory_submissions.submitted_at = now()
  → if every session_member has submitted:
        memories.status = locked, locked_at = now()
        await playlist export for each member with a connection
          (per-member try/catch — failures logged, submit still 200)

Window expires (cron, every 15 min)
  → open + window_expires_at < now()
       ├─ everyone submitted → lock (boundary case)
       └─ otherwise          → status = expired, del() the Blob photos
```

## Visibility

One store method shapes both views, so the API cannot leak by accident:

| Status | Payload |
| --- | --- |
| `open` | `myPhotos` / `mySongs` (viewer only) + `members[].submitted` + shared `note` |
| `locked` | `photos` / `songs` for everyone + `myPlaylist` for the viewer |
| `expired` | `null` → 404 |

Peer content is never serialized pre-lock — the reveal is enforced server-side, not by hiding fields in React.

## Polling, not sockets

`MemoryBuildPage` polls `GET /memories/session/:sessionId` every `MEMORY_POLL_INTERVAL_MS` (2s) — the same pattern as bump and event detail. On a status flip to `locked` it redirects to `/memories/:id`, which loads once (locked state is terminal, so no polling there). No WebSockets or SSE anywhere.

## Artifacts

**Receipt** (`Receipt.tsx`) — all 3N songs as line items: `QTY` is the zero-padded running index, `ITEM` is `TITLE - ARTIST` truncated, `AMT` is the slot within that contributor's three. Barcode bars are derived from a hash of the memory id, so they are stable but decorative. Fonts are component-scoped `--receipt-font-*` vars; the global `--font-display` / `--font-body` are untouched.

**Photobooth strips** (`PhotoboothCarousel.tsx`) — photos are grouped by member, then round-robin interleaved by `upload_order`, then paginated 4 per strip. A short final strip keeps `null` slots so they render as blank frames. Shuffle is a CSS slide + ~8° tilt, gated behind `prefers-reduced-motion: no-preference`. No motion library.

**Playlist** — per-member and private (`public: false`, `collaborative: false`), titled `hangout w/ {others} — {MMM d}`. Members who never connect Spotify still get the full receipt, because titles and album art come from the client-credentials lookup at paste time.

Auto-export runs **inside** the submit request that locks the memory, and is `await`ed — detaching it would let the serverless function freeze before the work finished. Each member is wrapped in its own try/catch and the whole loop sits outside the handler's error mapping, so:

- one member's bad token cannot stop the others
- a total Spotify outage still returns **200** with `status: "locked"`
- failures are `console.warn`ed, never surfaced to the client
- anyone left without a playlist uses the manual **Save to Spotify** button on `/memories/:id`, which is idempotent

The trade-off is latency: the locking submit waits on up to N Spotify round trips. With N=2 that is acceptable; if bump ever gains large N-way matching, move this to a queue.

## Failure modes

| Missing | Effect |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Photo upload 503; songs, note, receipt still work |
| Spotify vars | Song paste 503, no playlists; lock/receipt/strips unaffected |
| `CRON_SECRET` | Sweeper only accepts `x-vercel-cron`; Spotify connect 503 (it signs `state`) |
| Cron not running | Stale memories linger as `open` past their window; the UI clamps the countdown at `00:00:00` and stops offering the CTA |
