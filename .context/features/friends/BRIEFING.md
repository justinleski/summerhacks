# Friends — agent briefing

Discord-style **friend codes**. Recipient gets a pending inbox request → Accept / Reject. Accepted friendship is **bidirectional**.

**Follow = friendship:** accepting auto-subscribes you to their **published events** (no separate follow graph). Calendar discovery is friends-only (+ FOAF via attendance — see calendar feature).

## API

- `GET /api/friends/me` → `{ friendCode, friends[] }`
- `POST /api/friends/requests` `{ code }`
- `GET /api/friends/inbox`
- `POST /api/friends/requests/:id/accept|reject`
- `DELETE /api/friends/:userId`

## Data

- `users.friend_code` — unique short Crockford-ish code (generated on create / backfill)
- `friend_requests` — pending unique pair
- `friendships` — `(user_a_id, user_b_id)` with `a < b`

## UI

`/friends` — show/copy code, paste to request, inbox Accept/Reject, friend list + unfriend.

## Non-goals

Public search, follow-without-friend, push notifications.
