# Friends — overview

Users share a short **friend code**. Pasting someone's code sends a **pending request** to their inbox. They **Accept** or **Reject** (Discord-style). Accept creates a bidirectional friendship.

Friendship also means **calendar follow**: friends are subscribed to each other's published events. There is no separate follow graph.

## Flow

1. Open `/friends` → copy your code
2. Friend pastes code → `POST /api/friends/requests`
3. You see them in inbox → Accept
4. Both appear on each other's friend list; future publishes fan out to both calendars

## Watchlist and the friend map

Each friendship can be **watchlisted** — a toggle on the friends list that mutes that friend's
check-ins from your shared `/map` feed. It's not unfriending: you're still friends, their events
still fan out to your calendar, you just don't want their pins cluttering the main map.

To still view a watchlisted (or any) friend's check-ins specifically, use their **Map** link on
`/friends` → `/friends/:friendId/map`. This is a narrow, check-ins-only view, not a general
profile page — public profile pages remain a non-goal for this feature; this route is a scoped
exception to that, gated server-side on an accepted friendship.

## Related

- [API](api.md) · [Data model](data-model.md)
- Calendar fan-out: [docs/calendar/overview.md](../calendar/overview.md)
- Check-ins / map: [.context/features/friends/BRIEFING.md](../../.context/features/friends/BRIEFING.md)
