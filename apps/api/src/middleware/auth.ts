import { createMiddleware } from "hono/factory";
import { getStore } from "../db/index.js";

export type AuthVariables = {
  userId: string;
};

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const header = c.req.header("authorization");
    const token = header?.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : c.req.header("x-user-token");

    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // MVP token = user id (replace with signed JWT later)
    const user = await getStore().getUser(token);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("userId", user.id);
    await next();
  },
);
