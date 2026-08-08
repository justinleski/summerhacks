import { Hono } from "hono";
import { bootstrapUserBodySchema } from "@summerhacks/shared";
import { getStore } from "../db/index.js";

export const usersRoutes = new Hono();

usersRoutes.post("/bootstrap", async (c) => {
  const body = bootstrapUserBodySchema.parse(await c.req.json());
  const user = await getStore().bootstrapUser(body);
  return c.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    },
    token: user.id,
  });
});

usersRoutes.get("/me", async (c) => {
  const token =
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ??
    c.req.header("x-user-token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const user = await getStore().getUser(token);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json({
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  });
});
