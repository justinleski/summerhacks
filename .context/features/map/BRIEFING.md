# Map / check-ins — agent briefing

Authenticated **Leaflet / CARTO** map at `/map` (default landing after auth). Shows own check-ins + non-watchlisted friends’ pins. **Requests browser geolocation** to center + stamp lat/lng; fallback NYC. Separate from Bump (Bump = motion + IP geo only; no `navigator.geolocation`).

## Flow

1. `/map` → `getCurrentPosition` (or NYC) → load me + friends check-ins
2. Check in modal: required region, optional caption ≤140 + photo
3. Photo → `POST /api/uploads/checkin-photo` → `POST /api/checkins` with center lat/lng
4. Store also inserts anonymous `connections` (`type=checkin`, IP region) for Explore tally

## API

- `POST /api/checkins` `{ lat, lng, region, caption?, photoUrl? }`
- `GET /api/checkins/me`
- `GET /api/checkins/friends` — excludes watchlisted
- `GET /api/checkins/friends/:friendId` — friendship required; watchlist ignored
- `POST /api/uploads/checkin-photo` — needs `BLOB_READ_WRITE_TOKEN`

## UI

- `/map` — Map + Check in; eyebrow “Explore”
- `/friends/:friendId/map` — scoped friend pins (friends feature owns the route)
- Basemap follows client theme (`currentCartoTileUrl`)

## Non-goals

Bump GPS matching; public anonymous map; editing/deleting check-ins (not implemented).
