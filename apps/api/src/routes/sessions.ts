import { Hono } from "hono";
import { getStore } from "../db/index.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const sessionsRoutes = new Hono<{ Variables: AuthVariables }>();

sessionsRoutes.use("*", requireAuth);

sessionsRoutes.get("/", async (c) => {
  const sessions = await getStore().listSessionsForUser(c.get("userId"));
  return c.json({ sessions });
});

sessionsRoutes.get("/:id", async (c) => {
  const store = getStore();
  const session = await store.getSession(c.req.param("id"));
  if (!session) return c.json({ error: "Not found" }, 404);
  const isMember = session.members.some((m) => m.userId === c.get("userId"));
  if (!isMember) return c.json({ error: "Forbidden" }, 403);
  return c.json({ session });
});

sessionsRoutes.post("/:id/confirm", async (c) => {
  const store = getStore();
  const session = await store.confirmSession(c.req.param("id"), c.get("userId"));
  if (!session) return c.json({ error: "Not found" }, 404);
  return c.json({ session });
});
