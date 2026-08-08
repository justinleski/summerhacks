import { Hono } from "hono";
import {
  BUMP_EXPIRY_MS,
  createBumpBodySchema,
  type BumpResponse,
  type PeerSummary,
} from "@summerhacks/shared";
import { getStore } from "../db/index.js";
import type { StoredBumpIntent, StoredUser } from "../db/types.js";
import { toIso } from "../db/types.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { geoFromRequest } from "../services/geoFromRequest.js";

function peerSummary(user: StoredUser): PeerSummary {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

function bumpResponse(
  bump: StoredBumpIntent,
  peer: StoredUser | null = null,
): BumpResponse {
  return {
    bumpId: bump.id,
    status: bump.status,
    expiresAt: toIso(bump.expiresAt),
    sessionId: bump.sessionId,
    peer: peer ? peerSummary(peer) : null,
  };
}

export const bumpsRoutes = new Hono<{ Variables: AuthVariables }>();

bumpsRoutes.use("*", requireAuth);

bumpsRoutes.post("/", async (c) => {
  const body = createBumpBodySchema.parse(await c.req.json());
  const store = getStore();
  const userId = c.get("userId");
  const geo = geoFromRequest(c);
  const expiresAt = new Date(Date.now() + BUMP_EXPIRY_MS);

  const bump = await store.createBump({
    userId,
    clientTimestamp: new Date(body.clientTimestamp),
    peakMagnitude: body.peakMagnitude ?? null,
    idempotencyKey: body.idempotencyKey,
    geo,
    expiresAt,
  });

  const matched = await store.tryMatchBump(bump.id);
  return c.json(bumpResponse(matched.bump, matched.peer), 201);
});

bumpsRoutes.get("/:id", async (c) => {
  const store = getStore();
  const userId = c.get("userId");
  const bump = await store.getBump(c.req.param("id"));
  if (!bump || bump.userId !== userId) {
    return c.json({ error: "Not found" }, 404);
  }

  // Re-attempt match on poll so the second arriver can pair the first
  const matched = await store.tryMatchBump(bump.id);
  let peer: StoredUser | null = matched.peer;
  if (!peer && matched.bump.matchedBumpId) {
    const partner = await store.getBump(matched.bump.matchedBumpId);
    if (partner) peer = await store.getUser(partner.userId);
  }

  return c.json(bumpResponse(matched.bump, peer));
});

bumpsRoutes.delete("/:id", async (c) => {
  const store = getStore();
  const userId = c.get("userId");
  const bump = await store.getBump(c.req.param("id"));
  if (!bump || bump.userId !== userId) {
    return c.json({ error: "Not found" }, 404);
  }
  const expired = await store.expireBump(bump.id);
  return c.json(bumpResponse(expired!));
});
