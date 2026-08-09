import { Hono } from "hono";
import {
  createCommentBodySchema,
  createEventBodySchema,
  rsvpBodySchema,
} from "@summerhacks/shared";
import { getStore } from "../db/index.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { httpErrorFromStore } from "./http-errors.js";

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
  const event = await getStore().rsvpEvent(
    c.get("userId"),
    c.req.param("id"),
    body.status,
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
