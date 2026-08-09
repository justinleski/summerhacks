import { Hono } from "hono";
import {
  createCheckinBodySchema,
  type Checkin,
  type FriendCheckin,
} from "@summerhacks/shared";
import { getStore } from "../db/index.js";
import { toIso } from "../db/types.js";
import type { StoredCheckin, StoredFriendCheckin } from "../db/types.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { geoFromRequest } from "../services/geoFromRequest.js";

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

function friendCheckinJson(row: StoredFriendCheckin): FriendCheckin {
  return {
    ...checkinJson(row),
    ownerDisplayName: row.ownerDisplayName,
    ownerAvatarUrl: row.ownerAvatarUrl,
  };
}

export const checkinsRoutes = new Hono<{ Variables: AuthVariables }>();

checkinsRoutes.use("*", requireAuth);

checkinsRoutes.post("/", async (c) => {
  const body = createCheckinBodySchema.parse(await c.req.json());
  const geo = geoFromRequest(c);
  const connectionRegion = geo.city ?? geo.region ?? geo.country ?? "Unknown";
  const checkin = await getStore().createCheckin({
    userId: c.get("userId"),
    lat: body.lat,
    lng: body.lng,
    region: body.region,
    connectionRegion,
    photoUrl: body.photoUrl ?? null,
    caption: body.caption ?? null,
  });
  return c.json({ checkin: checkinJson(checkin) }, 201);
});

checkinsRoutes.get("/me", async (c) => {
  const checkins = await getStore().listCheckinsForUser(c.get("userId"));
  return c.json({ checkins: checkins.map(checkinJson) });
});

/** Friends' check-ins, excluding any pair marked is_watchlisted. */
checkinsRoutes.get("/friends", async (c) => {
  const checkins = await getStore().listFriendCheckins(c.get("userId"));
  return c.json({ checkins: checkins.map(friendCheckinJson) });
});

/** A single friend's check-ins — requires an accepted friendship, watchlisted or not. */
checkinsRoutes.get("/friends/:friendId", async (c) => {
  const store = getStore();
  const friendId = c.req.param("friendId");
  const rows = await store.listCheckinsForFriend(c.get("userId"), friendId);
  if (rows === null) return c.json({ error: "Not friends" }, 403);
  const friend = await store.getUser(friendId);
  if (!friend) return c.json({ error: "Not found" }, 404);
  return c.json({
    friend: {
      id: friend.id,
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl,
    },
    checkins: rows.map(checkinJson),
  });
});
