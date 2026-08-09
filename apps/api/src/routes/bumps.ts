import { Hono } from "hono";
import {
  BUMP_EXPIRY_MS,
  createBumpBodySchema,
  proposeBumpBodySchema,
  type BumpProposal,
  type BumpResponse,
  type PeerSummary,
} from "@summerhacks/shared";
import { getStore } from "../db/index.js";
import type { StoredBumpIntent, StoredBumpProposal, StoredUser } from "../db/types.js";
import { toIso } from "../db/types.js";
import { cacheKeys, readCache } from "../lib/ttl-cache.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { geoFromRequest } from "../services/geoFromRequest.js";
import { httpErrorFromStore } from "./http-errors.js";

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

/** Drop stale home-session lists when a match creates a session. */
function invalidateSessionsForMatch(
  bump: StoredBumpIntent,
  peer: StoredUser | null,
): void {
  if (!bump.sessionId) return;
  readCache.delete(cacheKeys.sessionsUser(bump.userId));
  if (peer) readCache.delete(cacheKeys.sessionsUser(peer.id));
  readCache.delete(cacheKeys.session(bump.sessionId));
}

function proposalResponse(proposal: StoredBumpProposal): Omit<
  BumpProposal,
  "fromAvatarUrl"
> {
  return {
    id: proposal.id,
    fromBumpId: proposal.fromBumpId,
    toBumpId: proposal.toBumpId,
    fromUserId: proposal.fromUserId,
    toUserId: proposal.toUserId,
    status: proposal.status,
    sessionId: proposal.sessionId,
    expiresAt: toIso(proposal.expiresAt),
    createdAt: toIso(proposal.createdAt),
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
  invalidateSessionsForMatch(matched.bump, matched.peer);
  return c.json(bumpResponse(matched.bump, matched.peer), 201);
});

/** Incoming "was this you?" proposals — register before /:id */
bumpsRoutes.get("/proposals", async (c) => {
  const proposals = await getStore().listPendingBumpProposals(c.get("userId"));
  return c.json({ proposals });
});

bumpsRoutes.post("/proposals/:id/accept", async (c) => {
  try {
    const result = await getStore().acceptBumpProposal(
      c.req.param("id"),
      c.get("userId"),
    );
    return c.json({
      proposalId: result.proposal.id,
      status: "accepted" as const,
      sessionId: result.session.id,
      bumpId: result.bump.id,
      peer: result.peer,
    });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

bumpsRoutes.post("/proposals/:id/reject", async (c) => {
  try {
    const proposal = await getStore().rejectBumpProposal(
      c.req.param("id"),
      c.get("userId"),
    );
    return c.json(proposalResponse(proposal));
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

bumpsRoutes.get("/:id/candidates", async (c) => {
  const store = getStore();
  const userId = c.get("userId");
  const bump = await store.getBump(c.req.param("id"));
  if (!bump || bump.userId !== userId) {
    return c.json({ error: "Not found" }, 404);
  }
  const candidates = await store.listBumpCandidates(bump.id);
  return c.json({ candidates });
});

bumpsRoutes.post("/:id/propose", async (c) => {
  const body = proposeBumpBodySchema.parse(await c.req.json());
  try {
    const proposal = await getStore().createBumpProposal(
      c.req.param("id"),
      body.targetBumpId,
      c.get("userId"),
    );
    return c.json(proposalResponse(proposal), 201);
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
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

  invalidateSessionsForMatch(matched.bump, peer);
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
