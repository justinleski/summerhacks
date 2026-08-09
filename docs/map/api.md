# Map / check-ins — API

All check-in routes require `Authorization: Bearer <token>` (`requireAuth`).

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/checkins` | Body `{ lat, lng, region, caption?, photoUrl? }` → `{ checkin }`. Also inserts anonymous `connections` row (`type=checkin`, region from IP geo). |
| GET | `/api/checkins/me` | Caller’s check-ins |
| GET | `/api/checkins/friends` | Friends’ check-ins with `ownerDisplayName` / `ownerAvatarUrl`; excludes watchlisted pairs |
| GET | `/api/checkins/friends/:friendId` | One friend’s check-ins + friend summary; **403** unless accepted friendship (watchlist ignored) |
| POST | `/api/uploads/checkin-photo` | Multipart `file` → `{ url }`; needs `BLOB_READ_WRITE_TOKEN` (503 without) |

Watchlist mutations live on friends: `PATCH /api/friends/:userId/watchlist`.
