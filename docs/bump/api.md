# Bump — API

Hono app uses `basePath("/api")`. On Vercel and via the Vite proxy, the browser calls **same-origin** `/api/...`.

Auth: `Authorization: Bearer <token>` (or `X-User-Token`). MVP **token = user id** from bootstrap. All bump and session routes require auth except health and bootstrap.

## Health

### `GET /api/health`

```json
{ "ok": true, "store": "neon" }
```

`store` is `"neon"` when `DATABASE_URL` is set, else `"memory"`.

## Users

### `POST /api/users/bootstrap`

Create or resume a lightweight user. If `deviceId` matches an existing row, that user is resumed (display name may update).

**Body**

```json
{ "displayName": "Alex", "deviceId": "optional-stable-device-key" }
```

**Response**

```json
{
  "user": {
    "id": "...",
    "displayName": "Alex",
    "avatarUrl": null,
    "createdAt": "..."
  },
  "token": "..."
}
```

`token` is the user id for MVP.

## Bumps

### `POST /api/bumps`

Create a bump intent. Server attaches coarse IP geo from Vercel headers (or local `DEV_GEO_*` stub). Immediately runs `tryMatchBump`.

**Body**

```json
{
  "clientTimestamp": 1710000000000,
  "peakMagnitude": 18.4,
  "idempotencyKey": "uuid"
}
```

**Response** (`201`)

```json
{
  "bumpId": "...",
  "status": "pending",
  "expiresAt": "...",
  "sessionId": null,
  "peer": null
}
```

When the partner already exists (or this request wins the match):

```json
{
  "bumpId": "...",
  "status": "matched",
  "expiresAt": "...",
  "sessionId": "...",
  "peer": { "id": "...", "displayName": "Sam", "avatarUrl": null }
}
```

Idempotent on `(userId, idempotencyKey)`.

### `GET /api/bumps/:id`

Polled while searching (~500ms). Re-runs match attempt. Owner-only.

Statuses: `pending` | `matched` | `expired`.

### `DELETE /api/bumps/:id`

Cancel when leaving Bump Mode. Marks the intent expired if still pending.

## Sessions

### `GET /api/sessions`

Recent sessions for the current user (reopen without bump).

### `GET /api/sessions/:id`

Session detail: members + `payload` JSONB. Must be a member.

### `POST /api/sessions/:id/confirm`

Accept the matched peer (sets this member’s `confirmedAt`). When **every** member has confirmed, session `status` becomes `active`; otherwise it stays `pending_confirm`. Client typically navigates to `/session/:id` after its own confirm.
