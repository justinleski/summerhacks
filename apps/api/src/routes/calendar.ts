import { Hono } from "hono";
import { getStore } from "../db/index.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const calendarRoutes = new Hono<{ Variables: AuthVariables }>();

calendarRoutes.use("*", requireAuth);

calendarRoutes.get("/", async (c) => {
  const events = await getStore().listCalendar(c.get("userId"));
  return c.json({ events });
});
