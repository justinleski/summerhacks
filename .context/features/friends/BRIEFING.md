# Friends — agent briefing

Discord-style **friend codes**. Recipient gets a pending inbox request → Accept / Reject. Accepted friendship is **bidirectional**.

**Follow = friendship:** accepting auto-subscribes you to their **published events** (no separate follow graph). Calendar discovery is friends-only (+ FOAF via attendance — see calendar feature).

**Watchlist:** each friendship row carries `is_watchlisted` (default false). Watchlisting a friend mutes their check-ins from the shared `/map` feed (`GET /api/checkins/friends`), but you can still view that one friend's check-ins directly via the scoped `/friends/:friendId/map` route — watchlisted or not, as long as you're friends.

## API

- `GET /api/friends/me` → `{ friendCode, friends[] }` — each friend now includes `isWatchlisted`
- `POST /api/friends/requests` `{ code }`
- `GET /api/friends/inbox`
- `POST /api/friends/requests/:id/accept|reject`
- `DELETE /api/friends/:userId`
- `PATCH /api/friends/:userId/watchlist` `{ isWatchlisted }` — 404 if not friends
- `GET /api/checkins/friends` — friends' check-ins, excluding watchlisted pairs
- `GET /api/checkins/friends/:friendId` — one friend's check-ins; 403 unless accepted friendship exists

## Data

- `users.friend_code` — unique short Crockford-ish code (generated on create / backfill)
- `friend_requests` — pending unique pair
- `friendships` — `(user_a_id, user_b_id)` with `a < b`, plus `is_watchlisted boolean default false`
- `checkins` — owned by the map feature; friend-visibility governed here by `is_watchlisted`

## UI

- `/friends` — show/copy code, paste to request, inbox Accept/Reject, friend list + unfriend + watchlist toggle + "Map" link per friend
- `/friends/:friendId/map` — **scoped exception**: check-ins-only map for one friend, not a general profile page. Gated on an accepted friendship server-side.

## Non-goals

Public search, follow-without-friend, push notifications, general public profile pages (the scoped friend-map route above is check-ins only and does not open the door to profile pages).
