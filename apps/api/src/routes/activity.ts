import { Hono } from "hono";
import { getStore } from "../db/index.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const activityRoutes = new Hono<{ Variables: AuthVariables }>();

activityRoutes.use("*", requireAuth);

activityRoutes.get("/", async (c) => {
  const notifications = await getStore().listActivity(c.get("userId"));
  return c.json({ notifications });
});

activityRoutes.post("/read-all", async (c) => {
  const count = await getStore().markAllActivityRead(c.get("userId"));
  return c.json({ ok: true, count });
});

activityRoutes.post("/:id/read", async (c) => {
  const notification = await getStore().markActivityRead(
    c.get("userId"),
    c.req.param("id"),
  );
  if (!notification) return c.json({ error: "Not found" }, 404);
  return c.json({ notification });
});
