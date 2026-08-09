# Calendar — agent briefing

Friends-only events. **Publish** → subscribe host + each friend + `event_published` activity. **RSVP going** → actor subscribed; notify watchers; FOAF friends of attendee get subscribe + notify. **Comment** → notify subscribers except actor.

**Delivery:** in-app activity + calendar queries (poll like bump). No push/WebSockets in v1.

## Visibility (calendar read)

Union of: events you host, events from friends, events you are subscribed to, events where a friend is `going` (FOAF).

## API cheat sheet

- `POST /api/events` — title≤80, description≤280, startsAt, endsAt?, imageUrl?
- `GET /api/calendar` — upcoming visible
- `GET /api/events/:id` — detail + attendees + comments
- `POST /api/events/:id/rsvp` `{ status: going|not_going }`
- `POST /api/events/:id/comments` `{ body }`
- `GET /api/activity` · `POST /api/activity/:id/read` · `POST /api/activity/read-all`
- `POST /api/uploads/event-image` — multipart `file`; needs `BLOB_READ_WRITE_TOKEN` (~4MB)

## UI

`/calendar` — month highlights, upcoming list, create form, activity strip.  
`/events/:id` — RSVP, attendees, comments, light activity poll while open.

## Ops

Set `BLOB_READ_WRITE_TOKEN` on Vercel for images; without it, create-event still works without image; upload returns 503. After schema changes: `npm run db:push -w @summerhacks/api`.
