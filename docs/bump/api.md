# Bump — API

Base URL in local/dev is typically proxied from the Vite app to the API (e.g. `/api` → Hono).

All authenticated routes expect `Authorization: Bearer <token>` from lightweight bootstrap auth, or the `x-user-id` header in local stub mode when documented.

## Users

### `POST /users/bootstrap`

Create or resume a lightweight user.

**Body**

```json
{ "displayName": "Alex", "deviceId": "optional-stable-device-key" }
```

**Response**

```json
{
  "user": { "id": "...", "displayName": "Alex", "avatarUrl": null, "createdAt": "..." },
  "token": "..."
}
```

## Bumps

### `POST /bumps`

Create a bump intent. Server attaches coarse IP geo from Vercel headers (or a local stub).

**Body**

```json
{
  "clientTimestamp": 1710000000000,
  "peakMagnitude": 18.4,
  "idempotencyKey": "uuid"
}
```

**Response**

```json
{
  "bumpId": "...",
  "status": "pending",
  "expiresAt": "..."
}
```

Idempotent on `(userId, idempotencyKey)`.

### `GET /bumps/:id`

Polled while in `searching` (~500ms).

**Response**

```json
{
  "bumpId": "...",
  "status": "pending",
  "expiresAt": "...",
  "sessionId": null,
  "peer": null
}
```

When matched:

```json
{
  "status": "matched",
  "sessionId": "...",
  "peer": { "id": "...", "displayName": "Sam", "avatarUrl": null }
}
```

Statuses: `pending` | `matched` | `expired`.

### `DELETE /bumps/:id`

Cancel when leaving Bump Mode. Marks the intent expired/cancelled if still pending.

## Sessions

### `GET /sessions`

Recent sessions for the current user (reopen without bump).

### `GET /sessions/:id`

Session detail: members + `payload` JSONB.

### `POST /sessions/:id/confirm`

Accept the matched peer. When both members have confirmed (or MVP policy activates on first confirm — see implementation), status becomes `active`.
