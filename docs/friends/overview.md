# Friends — overview

Users share a short **friend code**. Pasting someone's code sends a **pending request** to their inbox. They **Accept** or **Reject** (Discord-style). Accept creates a bidirectional friendship.

Friendship also means **calendar follow**: friends are subscribed to each other's published events. There is no separate follow graph.

## Flow

1. Open `/friends` → copy your code
2. Friend pastes code → `POST /api/friends/requests`
3. You see them in inbox → Accept
4. Both appear on each other's friend list; future publishes fan out to both calendars

## Related

- [API](api.md) · [Data model](data-model.md)
- Calendar fan-out: [docs/calendar/overview.md](../calendar/overview.md)
