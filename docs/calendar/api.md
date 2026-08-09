# Calendar — API

All routes require auth.

| Method | Path | Body / notes |
| --- | --- | --- |
| POST | `/api/events` | `{ title, description, startsAt, endsAt?, imageUrl? }` |
| GET | `/api/calendar` | `{ events }` upcoming visible |
| GET | `/api/events/:id` | detail if visible |
| POST | `/api/events/:id/rsvp` | `{ status: "going" \| "not_going" }` |
| POST | `/api/events/:id/comments` | `{ body }` ≤280 |
| GET | `/api/activity` | notification inbox |
| POST | `/api/activity/:id/read` | mark one read |
| POST | `/api/activity/read-all` | mark all read |
| POST | `/api/uploads/event-image` | multipart `file`; 503 if no blob token |
