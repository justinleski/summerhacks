# Calendar — architecture

```text
Host publishes event
  → event row + host attendee(going) + host subscription
  → for each friend: subscription + activity(event_published)

RSVP going
  → upsert attendee + ensure actor subscribed
  → notify event subscribers (rsvp_changed)
  → for each friend of actor not subscribed: subscribe + notify (FOAF)

RSVP not_going
  → update status + notify subscribers

Comment
  → insert + notify subscribers except actor

Calendar GET
  → union hosted ∪ friends' events ∪ subscriptions ∪ FOAF going
```

Images: `POST /api/uploads/event-image` → `@vercel/blob` `put()` with `BLOB_READ_WRITE_TOKEN`. Client may create events without images if token unset.

Realtime MVP: poll activity / event detail (~2s) — same pattern as bump polling.
