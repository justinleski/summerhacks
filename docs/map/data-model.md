# Map / check-ins — data model

## `checkins`

| Column | Notes |
| --- | --- |
| id | uuid PK |
| user_id | FK users, cascade delete |
| lat / lng | float8 from client (map center at check-in) |
| region | text; user-entered place label (required at API) |
| photo_url | nullable Blob URL |
| caption | nullable, ≤140 at API |
| created_at | timestamptz |

Friend visibility is **not** a column on `checkins` — `friendships.is_watchlisted` filters `listFriendCheckins` in the store.

## `connections` (tally side-effect)

Anonymous rows for Explore. On check-in create: `type = 'checkin'`, `region` = IP-derived city/region/country (`geoFromRequest`), not the user’s typed label. See [explore/data-model.md](../explore/data-model.md).
