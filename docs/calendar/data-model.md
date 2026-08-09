# Calendar — data model

| Table | Purpose |
| --- | --- |
| `events` | host, title, description, image_url, starts_at, ends_at |
| `event_attendees` | PK (event_id, user_id), status going\|not_going |
| `event_comments` | body ≤280 |
| `event_subscriptions` | watchers for fan-out |
| `activity_notifications` | type event_published\|rsvp_changed\|event_comment, payload jsonb, read_at |
