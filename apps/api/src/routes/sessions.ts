import {
  albumPixelsSchema,
  coverVoteBodySchema,
  SERVER_OPEN_READ_CACHE_TTL_MS,
  SERVER_SESSION_CACHE_TTL_MS,
  updateAlbumBodySchema,
  type PixelGridSize,
  type Session,
  type SessionCoversResponse,
} from "@summerhacks/shared";
import { Hono } from "hono";
import { getStore } from "../db/index.js";
import {
  computeContestPhase,
  resolveCoverWinner,
  toAlbumView,
  toContestView,
  type Store,
  type StoredAlbum,
} from "../db/types.js";
import {
  cacheKeys,
  invalidateSessionReads,
  readCache,
} from "../lib/ttl-cache.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const sessionsRoutes = new Hono<{ Variables: AuthVariables }>();

sessionsRoutes.use("*", requireAuth);

async function getCachedSession(sessionId: string): Promise<Session | null> {
  const key = cacheKeys.session(sessionId);
  const hit = readCache.get<Session>(key);
  if (hit) return hit;
  const session = await getStore().getSession(sessionId);
  if (session) readCache.set(key, session, SERVER_SESSION_CACHE_TTL_MS);
  return session;
}

async function memberStore(
  sessionId: string,
  userId: string,
): Promise<
  | { ok: true; store: Store; memberIds: string[]; sessionMembers: { userId: string; displayName: string }[] }
  | { ok: false; status: 403 | 404; error: string }
> {
  const store = getStore();
  const session = await getCachedSession(sessionId);
  if (!session) return { ok: false, status: 404, error: "Not found" };
  if (!session.members.some((m) => m.userId === userId)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return {
    ok: true,
    store,
    memberIds: session.members.map((m) => m.userId),
    sessionMembers: session.members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
    })),
  };
}

async function buildCoversResponse(
  store: Store,
  sessionId: string,
  viewerId: string,
  memberIds: string[],
  sessionMembers: { userId: string; displayName: string }[],
): Promise<SessionCoversResponse> {
  const covers = await store.listAlbumsForSession(sessionId);
  const contestRow = await store.getAlbumContest(sessionId);
  const votes = await store.listAlbumVotes(sessionId);
  const phase = computeContestPhase({
    memberIds,
    covers,
    contest: contestRow,
  });
  const nameById = new Map(
    sessionMembers.map((m) => [m.userId, m.displayName] as const),
  );

  const revealPeers = phase !== "editing";
  const views = covers
    .filter((c) => revealPeers || c.userId === viewerId)
    .map((c) => toAlbumView(c, nameById.get(c.userId) ?? "Member"));

  // During editing, still surface placeholder slots for peers (no pixels).
  if (!revealPeers) {
    for (const m of sessionMembers) {
      if (views.some((v) => v.userId === m.userId)) continue;
      views.push({
        id: "00000000-0000-0000-0000-000000000000",
        sessionId,
        userId: m.userId,
        displayName: m.displayName,
        title: null,
        gridSize: 16,
        pixels: [],
        coverUrl: null,
        editableUntil: new Date(Date.now() + 86_400_000).toISOString(),
        readyAt: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        editable: false,
      });
    }
  }

  const mineRow = covers.find((c) => c.userId === viewerId) ?? null;
  const mine = mineRow
    ? toAlbumView(mineRow, nameById.get(viewerId) ?? "You")
    : null;

  return {
    covers: views,
    contest: toContestView(contestRow, votes, phase),
    mine,
  };
}

async function cachedCoversResponse(
  store: Store,
  sessionId: string,
  viewerId: string,
  memberIds: string[],
  sessionMembers: { userId: string; displayName: string }[],
): Promise<SessionCoversResponse> {
  const key = cacheKeys.covers(sessionId, viewerId);
  const hit = readCache.get<SessionCoversResponse>(key);
  if (hit) return hit;
  const body = await buildCoversResponse(
    store,
    sessionId,
    viewerId,
    memberIds,
    sessionMembers,
  );
  readCache.set(key, body, SERVER_OPEN_READ_CACHE_TTL_MS);
  return body;
}

function coverHasArt(cover: StoredAlbum): boolean {
  if (cover.coverUrl) return true;
  return cover.pixels.some((p) => p != null);
}

async function maybeAutoResolve(
  store: Store,
  sessionId: string,
  memberIds: string[],
  force = false,
): Promise<void> {
  const contest = await store.getAlbumContest(sessionId);
  if (contest?.winnerUserId) return;

  const covers = await store.listAlbumsForSession(sessionId);
  const phase = computeContestPhase({ memberIds, covers, contest });
  if (phase !== "voting" && !force) return;

  const votes = await store.listAlbumVotes(sessionId);
  const allVoted =
    memberIds.length > 0 &&
    memberIds.every((id) => votes.some((v) => v.voterUserId === id));

  if (!allVoted && !force) return;

  const candidates = covers.filter(coverHasArt).map((c) => c.userId);
  const { winnerUserId, method } = resolveCoverWinner({
    memberIds,
    coverUserIds: candidates.length > 0 ? candidates : memberIds,
    votes,
  });
  await store.setAlbumContestWinner(sessionId, winnerUserId, method);
}

sessionsRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const key = cacheKeys.sessionsUser(userId);
  const hit = readCache.get<Session[]>(key);
  if (hit) return c.json({ sessions: hit });
  const sessions = await getStore().listSessionsForUser(userId);
  readCache.set(key, sessions, SERVER_SESSION_CACHE_TTL_MS);
  return c.json({ sessions });
});

sessionsRoutes.get("/:id", async (c) => {
  const session = await getCachedSession(c.req.param("id"));
  if (!session) return c.json({ error: "Not found" }, 404);
  const isMember = session.members.some((m) => m.userId === c.get("userId"));
  if (!isMember) return c.json({ error: "Forbidden" }, 403);
  return c.json({ session });
});

sessionsRoutes.post("/:id/confirm", async (c) => {
  const store = getStore();
  const sessionId = c.req.param("id");
  const session = await store.confirmSession(sessionId, c.get("userId"));
  if (!session) return c.json({ error: "Not found" }, 404);
  invalidateSessionReads(
    sessionId,
    session.members.map((m) => m.userId),
  );
  return c.json({ session });
});

/** List covers + contest state for the session. */
sessionsRoutes.get("/:id/album", async (c) => {
  const sessionId = c.req.param("id");
  const userId = c.get("userId");
  const gate = await memberStore(sessionId, userId);
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);
  const body = await cachedCoversResponse(
    gate.store,
    sessionId,
    userId,
    gate.memberIds,
    gate.sessionMembers,
  );
  return c.json(body);
});

/** Idempotent create of the caller's cover. */
sessionsRoutes.post("/:id/album", async (c) => {
  const sessionId = c.req.param("id");
  const userId = c.get("userId");
  const gate = await memberStore(sessionId, userId);
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);
  try {
    const album = await gate.store.createAlbumForUser(sessionId, userId);
    invalidateSessionReads(sessionId, gate.memberIds);
    const name =
      gate.sessionMembers.find((m) => m.userId === userId)?.displayName ?? "You";
    return c.json({ album: toAlbumView(album, name) }, 201);
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 404) return c.json({ error: "Not found" }, 404);
    throw err;
  }
});

/** Update the caller's cover (while editable). */
sessionsRoutes.patch("/:id/album", async (c) => {
  const sessionId = c.req.param("id");
  const userId = c.get("userId");
  const gate = await memberStore(sessionId, userId);
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);

  let album = await gate.store.getAlbumForUser(sessionId, userId);
  if (!album) {
    album = await gate.store.createAlbumForUser(sessionId, userId);
  }

  if (album.readyAt) {
    return c.json({ error: "Cover is locked (you already marked ready)" }, 403);
  }
  if (Date.now() >= album.editableUntil.getTime()) {
    return c.json({ error: "Album cover is locked (edit window ended)" }, 403);
  }

  const body = updateAlbumBodySchema.parse(await c.req.json());
  const gridSize: PixelGridSize = body.gridSize ?? album.gridSize;
  if (body.pixels) {
    albumPixelsSchema(gridSize).parse(body.pixels);
  }

  const updated = await gate.store.updateAlbumForUser(sessionId, userId, {
    pixels: body.pixels,
    coverUrl: body.coverUrl,
    gridSize: body.gridSize,
    title: body.title,
  });
  if (!updated) return c.json({ error: "Not found" }, 404);
  invalidateSessionReads(sessionId, gate.memberIds);
  const name =
    gate.sessionMembers.find((m) => m.userId === userId)?.displayName ?? "You";
  return c.json({ album: toAlbumView(updated, name) });
});

sessionsRoutes.post("/:id/album/ready", async (c) => {
  const sessionId = c.req.param("id");
  const userId = c.get("userId");
  const gate = await memberStore(sessionId, userId);
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);

  let album = await gate.store.getAlbumForUser(sessionId, userId);
  if (!album) {
    album = await gate.store.createAlbumForUser(sessionId, userId);
  }
  if (!coverHasArt(album)) {
    return c.json({ error: "Draw something before marking ready" }, 400);
  }
  if (Date.now() >= album.editableUntil.getTime()) {
    return c.json({ error: "Edit window ended" }, 403);
  }

  const updated = await gate.store.markAlbumReady(sessionId, userId);
  if (!updated) return c.json({ error: "Not found" }, 404);

  await maybeAutoResolve(gate.store, sessionId, gate.memberIds);
  invalidateSessionReads(sessionId, gate.memberIds);

  const body = await buildCoversResponse(
    gate.store,
    sessionId,
    userId,
    gate.memberIds,
    gate.sessionMembers,
  );
  readCache.set(
    cacheKeys.covers(sessionId, userId),
    body,
    SERVER_OPEN_READ_CACHE_TTL_MS,
  );
  return c.json(body);
});

sessionsRoutes.post("/:id/album/vote", async (c) => {
  const sessionId = c.req.param("id");
  const userId = c.get("userId");
  const gate = await memberStore(sessionId, userId);
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);

  const covers = await gate.store.listAlbumsForSession(sessionId);
  const contest = await gate.store.getAlbumContest(sessionId);
  const phase = computeContestPhase({
    memberIds: gate.memberIds,
    covers,
    contest,
  });
  if (phase === "editing") {
    return c.json({ error: "Voting opens when everyone is ready (or the edit window ends)" }, 403);
  }
  if (phase === "resolved") {
    return c.json({ error: "Contest already resolved" }, 403);
  }

  const body = coverVoteBodySchema.parse(await c.req.json());
  if (body.choiceUserId != null) {
    const ok = covers.some((c) => c.userId === body.choiceUserId);
    if (!ok && !gate.memberIds.includes(body.choiceUserId)) {
      return c.json({ error: "Invalid choice" }, 400);
    }
  }

  await gate.store.upsertAlbumVote(sessionId, userId, body.choiceUserId);
  await maybeAutoResolve(gate.store, sessionId, gate.memberIds);
  invalidateSessionReads(sessionId, gate.memberIds);

  const res = await buildCoversResponse(
    gate.store,
    sessionId,
    userId,
    gate.memberIds,
    gate.sessionMembers,
  );
  readCache.set(
    cacheKeys.covers(sessionId, userId),
    res,
    SERVER_OPEN_READ_CACHE_TTL_MS,
  );
  return c.json(res);
});

/** Force resolve: unanimous vote wins, otherwise spin. */
sessionsRoutes.post("/:id/album/resolve", async (c) => {
  const sessionId = c.req.param("id");
  const userId = c.get("userId");
  const gate = await memberStore(sessionId, userId);
  if (!gate.ok) return c.json({ error: gate.error }, gate.status);

  const covers = await gate.store.listAlbumsForSession(sessionId);
  const contest = await gate.store.getAlbumContest(sessionId);
  const phase = computeContestPhase({
    memberIds: gate.memberIds,
    covers,
    contest,
  });
  if (phase === "editing") {
    return c.json(
      { error: "Wait until everyone is ready (or the edit window ends)" },
      403,
    );
  }

  await maybeAutoResolve(gate.store, sessionId, gate.memberIds, true);
  invalidateSessionReads(sessionId, gate.memberIds);

  const res = await buildCoversResponse(
    gate.store,
    sessionId,
    userId,
    gate.memberIds,
    gate.sessionMembers,
  );
  readCache.set(
    cacheKeys.covers(sessionId, userId),
    res,
    SERVER_OPEN_READ_CACHE_TTL_MS,
  );
  return c.json(res);
});
