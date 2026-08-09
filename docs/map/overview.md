# Map / check-ins — overview

Authenticated Leaflet map of **your pins** and **friends’ pins**. Default post-login landing is `/map` (bump / recent sessions live at `/home`).

**Location:** this surface **requests browser geolocation** to center the map and stamp check-in lat/lng. That is intentional and separate from **Bump**, which still matches on time + IP geo only and never calls `navigator.geolocation`.

## Flow

1. Open `/map` → browser may prompt for location (`getCurrentPosition`, high accuracy, 8s timeout). Denied / unsupported → center defaults to NYC `[40.7128, -74.006]`.
2. Load `GET /api/checkins/me` + `GET /api/checkins/friends` (watchlisted friends excluded from the shared feed).
3. Tap **Check in** → modal: required **region**, optional caption (≤140) + photo.
4. Optional photo → `POST /api/uploads/checkin-photo` (Blob) → `POST /api/checkins` with map-center lat/lng.
5. Creating a check-in also writes an anonymous `connections` row (IP-derived region) for the public Explore tally.

## Friend map (scoped)

From `/friends`, each friend has a **Map** link → `/friends/:friendId/map`. Check-ins only; works even if watchlisted. See [friends/overview.md](../friends/overview.md).

## Related

- [API](api.md) · [Data model](data-model.md)
- Watchlist / friend map: [friends/overview.md](../friends/overview.md)
- Public regional tallies: [explore/overview.md](../explore/overview.md)
- Theme-aware basemap: [profile/overview.md](../profile/overview.md)
