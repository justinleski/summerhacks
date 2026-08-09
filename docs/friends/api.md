# Friends — API

All routes require `Authorization: Bearer <token>` (`requireAuth`).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/friends/me` | `{ friendCode, friends: [{ id, displayName, avatarUrl, isWatchlisted }] }` |
| POST | `/api/friends/requests` | Body `{ code }` → pending request (404 unknown code, 409 already friends/pending) |
| GET | `/api/friends/inbox` | Incoming pending requests with `fromUser` |
| POST | `/api/friends/requests/:id/accept` | Creates friendship row |
| POST | `/api/friends/requests/:id/reject` | Marks rejected |
| DELETE | `/api/friends/:userId` | Unfriend |
| PATCH | `/api/friends/:userId/watchlist` | Body `{ isWatchlisted }` → sets the flag on your friendship row (404 if not friends) |
| GET | `/api/checkins/friends` | Friends' check-ins, excluding any pair where `is_watchlisted = true` |
| GET | `/api/checkins/friends/:friendId` | One friend's check-ins regardless of watchlist state → `{ friend: { id, displayName, avatarUrl }, checkins: [...] }` (403 unless an accepted friendship exists) |
