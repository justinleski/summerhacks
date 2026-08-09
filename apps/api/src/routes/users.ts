import { Hono } from "hono";
import {
  bootstrapUserBodySchema,
  updateProfileBodySchema,
} from "@summerhacks/shared";
import { getStore } from "../db/index.js";
import {
  requireAuth,
  resolveUserIdFromToken,
  type AuthVariables,
} from "../middleware/auth.js";
import { neonAuthConfigured } from "../services/neonAuth.js";
import { httpErrorFromStore } from "./http-errors.js";

function profileJson(user: {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  email: string | null;
  friendCode: string;
  createdAt: string;
}) {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    email: user.email,
    friendCode: user.friendCode,
    createdAt: user.createdAt,
  };
}

export const usersRoutes = new Hono<{ Variables: AuthVariables }>();

usersRoutes.post("/bootstrap", async (c) => {
  const body = bootstrapUserBodySchema.parse(await c.req.json());
  const user = await getStore().bootstrapUser(body);
  return c.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      createdAt: user.createdAt,
    },
    token: user.id,
  });
});

/** Exchange a Neon Auth JWT for the app profile (also happens automatically on requireAuth). */
usersRoutes.post("/sync", async (c) => {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : c.req.header("x-user-token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  if (!neonAuthConfigured()) {
    return c.json({ error: "Neon Auth is not configured on the API" }, 503);
  }

  const userId = await resolveUserIdFromToken(token);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const user = await getStore().getUser(userId);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  return c.json({ user: profileJson(user) });
});

usersRoutes.get("/me", requireAuth, async (c) => {
  const user = await getStore().getUser(c.get("userId"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json(profileJson(user));
});

usersRoutes.patch("/me", requireAuth, async (c) => {
  const body = updateProfileBodySchema.parse(await c.req.json());
  try {
    const user = await getStore().updateProfile(c.get("userId"), body);
    return c.json(profileJson(user));
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

usersRoutes.get("/auth-config", (c) =>
  c.json({
    neonAuth: neonAuthConfigured(),
  }),
);
