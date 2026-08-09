# Album — API

Auth: same as sessions (`Authorization: Bearer …`). Caller must be a session member.

## `GET /api/sessions/:id/album`

Returns `{ covers, contest, mine }`.

- During **editing**, peer pixel art is hidden (placeholders only).
- During **voting** / **resolved**, all covers are visible.

## `POST /api/sessions/:id/album`

Idempotent create of the caller's cover. Returns `{ album }`.

## `PATCH /api/sessions/:id/album`

Update **your** cover (at least one field):

```json
{
  "pixels": ["#a7f070", null, "..."],
  "coverUrl": "https://...",
  "gridSize": 16,
  "title": null
}
```

- `pixels` length must be `gridSize²`
- **403** when past `editableUntil` or after `readyAt`

## `POST /api/sessions/:id/album/ready`

Locks your cover and may open voting when everyone is ready.

## `POST /api/sessions/:id/album/vote`

```json
{ "choiceUserId": "<uuid>|null" }
```

`null` = abstain / can't decide. When all members have voted, server auto-resolves (unanimous → vote, else spin).

## `POST /api/sessions/:id/album/resolve`

Force resolve now (spin unless votes are unanimous).

## `POST /api/uploads/album-cover`

Multipart `file` → `{ url }` (Vercel Blob). Requires `BLOB_READ_WRITE_TOKEN`.

## Env

| Var | Purpose |
| --- | --- |
| `ALBUM_EDIT_WINDOW_MS` | Override 24h window (e.g. `60000` for tests) |
| `BLOB_READ_WRITE_TOKEN` | Cover PNG upload |
