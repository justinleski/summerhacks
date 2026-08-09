# Friends — data model

## `users.friend_code`

Unique nullable text; generated on user create and backfilled on read if missing (8-char Crockford alphabet).

## `friend_requests`

| Column | Notes |
| --- | --- |
| id | uuid |
| from_user_id / to_user_id | FK users |
| status | `pending` \| `accepted` \| `rejected` |
| created_at / updated_at | timestamptz |

Unique partial index on `(from_user_id, to_user_id)` where `status = 'pending'`.

## `friendships`

Canonical pair: `user_a_id < user_b_id`, composite PK. Created on accept.

| Column | Notes |
| --- | --- |
| user_a_id / user_b_id | FK users, `a < b` |
| is_watchlisted | boolean, default `false`. One flag per pair — set by either side via `PATCH /api/friends/:userId/watchlist`, effective for both (there's no per-direction column). When true, that friend's check-ins are excluded from `GET /api/checkins/friends`; a single-friend view is still reachable at `GET /api/checkins/friends/:friendId` regardless of this flag. |
| created_at | timestamptz |

## `checkins` (map feature — referenced here for friend visibility)

Owned by the map/check-ins feature (`.context/features/` doesn't have a dedicated map spec yet;
see `apps/api/src/db/schema.ts`). Each row belongs to one user (`user_id`, `lat`, `lng`, `region`,
`photo_url`, `caption`, `created_at`). Friends visibility of another user's check-ins is governed
entirely by the `friendships.is_watchlisted` flag above, checked in the store layer
(`listFriendCheckins` / `listCheckinsForFriend` in `apps/api/src/db/{memory,neon}-store.ts`), not
by any column on `checkins` itself.
