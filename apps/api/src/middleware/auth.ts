import { createMiddleware } from "hono/factory";
import { getStore } from "../db/index.js";
import {
  avatarFromClaims,
  displayNameFromClaims,
  looksLikeJwt,
  neonAuthConfigured,
  verifyNeonAccessToken,
} from "../services/neonAuth.js";

export type AuthVariables = {
  userId: string;
};

function bearerToken(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return c.req.header("x-user-token") ?? null;
}

export async function resolveUserIdFromToken(
  token: string,
): Promise<string | null> {
  const store = getStore();

  if (neonAuthConfigured() && looksLikeJwt(token)) {
    const claims = await verifyNeonAccessToken(token);
    if (!claims?.sub) return null;
    const user = await store.upsertFromAuth({
      authUserId: claims.sub,
      displayName: displayNameFromClaims(claims),
      avatarUrl: avatarFromClaims(claims),
      email: typeof claims.email === "string" ? claims.email : null,
    });
    return user.id;
  }

  // Guest / legacy MVP: token is the app user id
  const user = await store.getUser(token);
  return user?.id ?? null;
}

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const token = bearerToken(c);
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = await resolveUserIdFromToken(token);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("userId", userId);
    await next();
  },
);
