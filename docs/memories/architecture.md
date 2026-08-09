# Memories — architecture

```text
Bump match (pairBumps / tryMatchBump)
  → sessions + session_members
  → seedMemory(sessionId, memberIds, sessions.created_at)
       └─ memories(open, window = created_at .. + albumEditWindowMs())
       └─ memory_submissions(submitted_at=null) per member

Client opens /session/:id
  → createAlbumForUser (covers) as needed
  → GET /memories/session/:id for interior CTA

Member contributes (window open, collaborative)
  → client compressImageForUpload → POST /memories/:id/photos → Blob
  → PUT  /memories/:id/songs/:p → Spotify metadata → upsert
  → PATCH /memories/:id/note

Mark done (optional)
  → validate 3 songs + even photo count
  → memory_submissions.submitted_at = now()
  → does NOT lock

Window expires (cron every 15 min)
  → open + window_expires_at < now()
       ├─ any photos/songs → locked + await playlist export
       └─ empty           → expired
```

## Visibility

| Status | Payload |
| --- | --- |
| `open` | `photos` / `songs` for **everyone**, plus `myPhotos` / `mySongs`, `mySubmitted`, shared `note` |
| `locked` | `photos` / `songs` + `myPlaylist` |
| `expired` | `null` → 404 |

## Polling

`MemoryBuildPage` polls every `MEMORY_POLL_INTERVAL_MS` (2s). On `locked`, redirect to `/memories/:id`. No WebSockets.

## Artifacts

Receipt, photobooth strips, and per-member Spotify playlists — same as before. Playlist auto-export runs in the **sweeper** when locking (awaited), with manual `POST /export-playlist` recovery.

## Failure modes

| Missing | Effect |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Photo upload 503 |
| Spotify vars | Song paste 503; no playlists |
| `CRON_SECRET` | Sweeper / Spotify connect degraded |
| Cron not running | Open past window until next sweep; mutations already 409 past `windowExpiresAt` |
