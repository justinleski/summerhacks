# Friends — API

All routes require `Authorization: Bearer <token>` (`requireAuth`).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/friends/me` | `{ friendCode, friends: [{ id, displayName, avatarUrl }] }` |
| POST | `/api/friends/requests` | Body `{ code }` → pending request (404 unknown code, 409 already friends/pending) |
| GET | `/api/friends/inbox` | Incoming pending requests with `fromUser` |
| POST | `/api/friends/requests/:id/accept` | Creates friendship row |
| POST | `/api/friends/requests/:id/reject` | Marks rejected |
| DELETE | `/api/friends/:userId` | Unfriend |
