# Bump — API

Hono app uses `basePath("/api")`. On Vercel and via the Vite proxy, the browser calls **same-origin** `/api/...`.

## Auth

- Guest / MVP: `Authorization: Bearer <userId>` from `POST /api/users/bootstrap`
- Neon Auth: `Authorization: Bearer <jwt>` (EdDSA, short-lived). API verifies via JWKS at `{NEON_AUTH_BASE_URL}/.well-known/jwks.json` and upserts `users` by `auth_user_id`. See [auth-neon.md](../auth-neon.md).

All authenticated routes expect `Authorization: Bearer <token>` (or `x-user-token`).

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

### `GET /api/bumps/:id/candidates`

Anonymous same-place candidates after auto-match expires (or while still eligible). Owner-only. Each item is `{ bumpId, userId, avatarUrl }` — **no displayName**.

Candidates: other unmatched intents in the same coarse place with `server_timestamp` within `BUMP_CANDIDATE_WINDOW_MS` (45s).

### `POST /api/bumps/:id/propose`

Send a "was this you?" propose from this bump to a candidate.

**Body**

```json
{ "targetBumpId": "..." }
```

**Response** (`201`) — proposal with short TTL aligned to the candidate window.

### `GET /api/bumps/proposals`

Pending incoming proposals for the current user (poll while in expired / fallback UI). Includes `fromAvatarUrl` (no displayName required).

### `POST /api/bumps/proposals/:id/accept`

Accept an incoming proposal. Creates session `pending_confirm`, marks both bumps `matched`. Response:

```json
{
  "proposalId": "...",
  "status": "accepted",
  "sessionId": "...",
  "bumpId": "...",
  "peer": { "id": "...", "displayName": "Sam", "avatarUrl": null }
}
```

### `POST /api/bumps/proposals/:id/reject`

Decline; proposal status becomes `rejected`.

## Sessions

### `GET /api/sessions`

Recent sessions for the current user (reopen without bump).

### `GET /api/sessions/:id`

Session detail: members + `payload` JSONB. Must be a member.

### `POST /api/sessions/:id/confirm`

Accept the matched peer (sets this member’s `confirmedAt`). When **every** member has confirmed, session `status` becomes `active`; otherwise it stays `pending_confirm`. Client typically navigates to `/session/:id` after its own confirm.
