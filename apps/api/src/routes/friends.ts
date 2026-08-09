import { Hono } from "hono";
import { createFriendRequestBodySchema } from "@summerhacks/shared";
import { getStore } from "../db/index.js";
import { toIso } from "../db/types.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { httpErrorFromStore } from "./http-errors.js";

export const friendsRoutes = new Hono<{ Variables: AuthVariables }>();

friendsRoutes.use("*", requireAuth);

friendsRoutes.get("/me", async (c) => {
  const result = await getStore().getFriendsMe(c.get("userId"));
  return c.json(result);
});

friendsRoutes.post("/requests", async (c) => {
  const body = createFriendRequestBodySchema.parse(await c.req.json());
  try {
    const request = await getStore().createFriendRequest(
      c.get("userId"),
      body.code,
    );
    return c.json(
      {
        id: request.id,
        fromUserId: request.fromUserId,
        toUserId: request.toUserId,
        status: request.status,
        createdAt: toIso(request.createdAt),
        updatedAt: toIso(request.updatedAt),
      },
      201,
    );
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

friendsRoutes.get("/inbox", async (c) => {
  const requests = await getStore().listFriendInbox(c.get("userId"));
  return c.json({ requests });
});

friendsRoutes.post("/requests/:id/accept", async (c) => {
  try {
    const request = await getStore().acceptFriendRequest(
      c.get("userId"),
      c.req.param("id"),
    );
    return c.json({
      id: request.id,
      fromUserId: request.fromUserId,
      toUserId: request.toUserId,
      status: request.status,
      createdAt: toIso(request.createdAt),
      updatedAt: toIso(request.updatedAt),
    });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

friendsRoutes.post("/requests/:id/reject", async (c) => {
  try {
    const request = await getStore().rejectFriendRequest(
      c.get("userId"),
      c.req.param("id"),
    );
    return c.json({
      id: request.id,
      fromUserId: request.fromUserId,
      toUserId: request.toUserId,
      status: request.status,
      createdAt: toIso(request.createdAt),
      updatedAt: toIso(request.updatedAt),
    });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

friendsRoutes.delete("/:userId", async (c) => {
  const otherUserId = c.req.param("userId");
  if (otherUserId === c.get("userId")) {
    return c.json({ error: "Cannot unfriend yourself" }, 400);
  }
  const ok = await getStore().unfriend(c.get("userId"), otherUserId);
  if (!ok) return c.json({ error: "Not friends" }, 404);
  return c.json({ ok: true });
});
