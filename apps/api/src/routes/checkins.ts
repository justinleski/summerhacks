import { Hono } from "hono";
import { createCheckinBodySchema, type Checkin } from "@summerhacks/shared";
import { getStore } from "../db/index.js";
import { toIso } from "../db/types.js";
import type { StoredCheckin } from "../db/types.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

function checkinJson(row: StoredCheckin): Checkin {
  return {
    id: row.id,
    userId: row.userId,
    lat: row.lat,
    lng: row.lng,
    region: row.region,
    photoUrl: row.photoUrl,
    caption: row.caption,
    createdAt: toIso(row.createdAt),
  };
}

export const checkinsRoutes = new Hono<{ Variables: AuthVariables }>();

checkinsRoutes.use("*", requireAuth);

checkinsRoutes.post("/", async (c) => {
  const body = createCheckinBodySchema.parse(await c.req.json());
  const checkin = await getStore().createCheckin({
    userId: c.get("userId"),
    lat: body.lat,
    lng: body.lng,
    region: body.region,
    photoUrl: body.photoUrl ?? null,
    caption: body.caption ?? null,
  });
  return c.json({ checkin: checkinJson(checkin) }, 201);
});

checkinsRoutes.get("/me", async (c) => {
  const checkins = await getStore().listCheckinsForUser(c.get("userId"));
  return c.json({ checkins: checkins.map(checkinJson) });
});
