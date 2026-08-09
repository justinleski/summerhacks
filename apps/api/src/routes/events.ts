import { Hono } from "hono";
import {
  createCommentBodySchema,
  createEventBodySchema,
  createEventPhotoBodySchema,
  rsvpBodySchema,
  type EventPhoto,
} from "@summerhacks/shared";
import { getStore } from "../db/index.js";
import { toIso, type StoredEventPhoto } from "../db/types.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { geoFromRequest } from "../services/geoFromRequest.js";
import { httpErrorFromStore } from "./http-errors.js";

function photoJson(row: StoredEventPhoto): EventPhoto {
  return {
    id: row.id,
    eventId: row.eventId,
    photoUrl: row.photoUrl,
    createdAt: toIso(row.createdAt),
  };
}

export const eventsRoutes = new Hono<{ Variables: AuthVariables }>();

eventsRoutes.use("*", requireAuth);

eventsRoutes.post("/", async (c) => {
  const body = createEventBodySchema.parse(await c.req.json());
  const startsAt = new Date(body.startsAt);
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (Number.isNaN(startsAt.getTime())) {
    return c.json({ error: "Invalid startsAt" }, 400);
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return c.json({ error: "Invalid endsAt" }, 400);
  }
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    return c.json({ error: "endsAt must be after startsAt" }, 400);
  }

  const event = await getStore().createEvent({
    hostUserId: c.get("userId"),
    title: body.title,
    description: body.description,
    imageUrl: body.imageUrl ?? null,
    startsAt,
    endsAt,
  });
  return c.json({ event }, 201);
});

eventsRoutes.get("/:id", async (c) => {
  const event = await getStore().getEventDetail(
    c.get("userId"),
    c.req.param("id"),
  );
  if (!event) return c.json({ error: "Not found" }, 404);
  return c.json({ event });
});

eventsRoutes.post("/:id/rsvp", async (c) => {
  const body = rsvpBodySchema.parse(await c.req.json());
  const geo = geoFromRequest(c);
  const region = geo.city ?? geo.region ?? geo.country ?? "Unknown";
  const event = await getStore().rsvpEvent(
    c.get("userId"),
    c.req.param("id"),
    body.status,
    region,
  );
  if (!event) return c.json({ error: "Not found" }, 404);
  return c.json({ event });
});

eventsRoutes.post("/:id/comments", async (c) => {
  const body = createCommentBodySchema.parse(await c.req.json());
  try {
    const comment = await getStore().addEventComment(
      c.get("userId"),
      c.req.param("id"),
      body.body,
    );
    return c.json({ comment }, 201);
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

/** Host-only, and only once the event has passed (endsAt if set, else startsAt). */
eventsRoutes.post("/:id/photos", async (c) => {
  const eventId = c.req.param("id");
  const userId = c.get("userId");
  const store = getStore();

  const event = await store.getEventDetail(userId, eventId);
  if (!event) return c.json({ error: "Not found" }, 404);
  if (event.hostUserId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const cutoff = new Date(event.endsAt ?? event.startsAt);
  if (cutoff.getTime() > Date.now()) {
    return c.json(
      { error: "Photos can only be added after the event has passed" },
      400,
    );
  }

  const body = createEventPhotoBodySchema.parse(await c.req.json());
  const photo = await store.addEventPhoto({ eventId, photoUrl: body.photoUrl });
  return c.json({ photo: photoJson(photo) }, 201);
});

/** Gated like RSVP-status checks elsewhere: host, or an attendee with status "going". */
eventsRoutes.get("/:id/photos", async (c) => {
  const eventId = c.req.param("id");
  const userId = c.get("userId");
  const store = getStore();

  const event = await store.getEventDetail(userId, eventId);
  if (!event) return c.json({ error: "Not found" }, 404);
  if (event.hostUserId !== userId && event.myRsvp !== "going") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const photos = await store.listEventPhotos(eventId);
  return c.json({ photos: photos.map(photoJson) });
});
