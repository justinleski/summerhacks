# Memories — overview (album receipt interior)

**Album** for a bump session = pixel **cover** ([album docs](../album/overview.md)) + **interior** (this feature: songs, photos, note → Receiptify receipt).

Tables are still named `memories*` — product language is “album interior / receipt.” One interior per bump session (`memories.session_id` unique). Same **24h** window as covers (`ALBUM_EDIT_WINDOW_MS` / `MEMORY_WINDOW_MS` alias).

Bump-only. Calendar events never get a memory. Pre-feature sessions have no memory row.

## Flow

1. Two phones bump → session created → **memory row** + per-member cover rows as clients open `/session/:id`
2. `/session/:id` — draw **album cover** + CTA **Edit photos + songs** (shared countdown)
3. `/memories/session/:sessionId` — both members see everyone’s contributions; each adds **3 songs** + **photos in pairs** (2/4/6/8) + optional **shared note**
4. Photos are **JPEG-compressed client-side** before Blob upload
5. Optional **Mark done** is a soft signal only — **does not lock**
6. When the window ends, cron **locks** interiors that have any photos/songs (receipt + playlists); empty ones **expire**
7. `/memories/:id` — receipt, photobooth, playlist; `/memories` lists locked albums

## Lock and expiry

| Condition | Result |
| --- | --- |
| Window still open | Collaborative edits; mutations allowed |
| Window ends + any photos/songs | `locked`, `locked_at = now()`, playlist export awaited in sweeper |
| Window ends + empty | `expired`, invisible |

No early lock on submit. Cover `readyAt` only affects the cover contest, not receipt edits.

## N members

`session_members` supports N; bump still inserts 2. Memory code loops over members — **no pair hardcodes**.

## Privacy

Private to session members (403 otherwise). During the open window, **all members see all photos/songs** (collaborative album).

## Without Spotify

Receipt and strips still work. Song paste and playlists need Spotify env vars.

## Related

- [API](api.md) · [Data model](data-model.md) · [Architecture](architecture.md)
- Covers: [docs/album/overview.md](../album/overview.md)
- Bump: [docs/bump/overview.md](../bump/overview.md)
- Env + cron: [docs/deploy-vercel.md](../deploy-vercel.md)
