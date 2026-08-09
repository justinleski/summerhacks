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
