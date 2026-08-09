import { put } from "@vercel/blob";
import { Hono } from "hono";
import {
  MEMORY_MAX_PHOTOS_PER_USER,
  MEMORY_SONGS_PER_USER,
  parseSpotifyTrackId,
  putMemorySongBodySchema,
  SERVER_LOCKED_MEMORY_CACHE_TTL_MS,
  SERVER_OPEN_READ_CACHE_TTL_MS,
  SERVER_SESSION_CACHE_TTL_MS,
  submitMemoryBodySchema,
  updateMemoryNoteBodySchema,
  type MemoryListItem,
  type MemoryResponse,
} from "@summerhacks/shared";
import { getStore } from "../db/index.js";
import type { StoredMemoryAccess } from "../db/types.js";
import {
  cacheKeys,
  invalidateMemoryReads,
  readCache,
} from "../lib/ttl-cache.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import {
  exportMemoryPlaylist,
} from "../services/memoryPlaylist.js";
import { resolveSpotifyTrack } from "../services/spotify.js";
import { httpErrorFromStore } from "./http-errors.js";
import { ALLOWED_TYPES, MAX_BYTES, extForType } from "./uploads.js";

function routeError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

/** Every memory route is member-only — session membership is the ACL. */
async function requireMemberAccess(
  memoryId: string,
  userId: string,
): Promise<StoredMemoryAccess> {
  const access = await getStore().getMemoryAccess(memoryId, userId);
  if (!access) throw routeError("Memory not found", 404);
  if (!access.isMember) throw routeError("Forbidden", 403);
  return access;
}

function assertOpen(access: StoredMemoryAccess): void {
  if (access.memory.status !== "open") {
    throw routeError("This memory is no longer open", 409);
  }
  if (Date.now() >= access.memory.windowExpiresAt.getTime()) {
    throw routeError("Album edit window has ended", 409);
  }
}

function parsePosition(raw: string): number {
  const position = Number(raw);
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position >= MEMORY_SONGS_PER_USER
  ) {
    throw routeError(
      `Song position must be 0-${MEMORY_SONGS_PER_USER - 1}`,
      400,
    );
  }
  return position;
}

function memoryTtl(memory: MemoryResponse): number {
  return memory.status === "locked"
    ? SERVER_LOCKED_MEMORY_CACHE_TTL_MS
    : SERVER_OPEN_READ_CACHE_TTL_MS;
}

function cacheMemory(memory: MemoryResponse, viewerId: string): void {
  const ttl = memoryTtl(memory);
  readCache.set(cacheKeys.memoryById(memory.id, viewerId), memory, ttl);
  readCache.set(
    cacheKeys.memoryBySession(memory.sessionId, viewerId),
    memory,
    ttl,
  );
}

export const memoriesRoutes = new Hono<{ Variables: AuthVariables }>();

memoriesRoutes.use("*", requireAuth);

memoriesRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const key = cacheKeys.lockedList(userId);
  const hit = readCache.get<MemoryListItem[]>(key);
  if (hit) return c.json({ memories: hit });
  const memories = await getStore().listLockedMemoriesForUser(userId);
  readCache.set(key, memories, SERVER_SESSION_CACHE_TTL_MS);
  return c.json({ memories });
});

memoriesRoutes.get("/session/:sessionId", async (c) => {
  const store = getStore();
  const userId = c.get("userId");
  const sessionId = c.req.param("sessionId");

  const sessionKey = cacheKeys.session(sessionId);
  let session = readCache.get<Awaited<ReturnType<typeof store.getSession>>>(
    sessionKey,
  );
  if (!session) {
    session = await store.getSession(sessionId);
    if (session) {
      readCache.set(sessionKey, session, SERVER_SESSION_CACHE_TTL_MS);
    }
  }
  if (!session) return c.json({ error: "Not found" }, 404);
  if (!session.members.some((m) => m.userId === userId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const memKey = cacheKeys.memoryBySession(sessionId, userId);
  const cached = readCache.get<MemoryResponse>(memKey);
  if (cached) return c.json({ memory: cached });

  const memory = await store.getMemoryBySessionId(sessionId, userId);
  if (!memory) return c.json({ error: "Not found" }, 404);
  cacheMemory(memory, userId);
  return c.json({ memory });
});

memoriesRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const memoryId = c.req.param("id");
  try {
    const memKey = cacheKeys.memoryById(memoryId, userId);
    const cached = readCache.get<MemoryResponse>(memKey);
    if (cached) return c.json({ memory: cached });

    await requireMemberAccess(memoryId, userId);
    const memory = await getStore().getMemoryById(memoryId, userId);
    if (!memory) return c.json({ error: "Not found" }, 404);
    cacheMemory(memory, userId);
    return c.json({ memory });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

memoriesRoutes.post("/:id/photos", async (c) => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return c.json(
      {
        error:
          "Photo uploads are not configured (BLOB_READ_WRITE_TOKEN unset). Ask the host to set the token.",
      },
      503,
    );
  }

  const memoryId = c.req.param("id");
  const userId = c.get("userId");
  try {
    const access = await requireMemberAccess(memoryId, userId);
    assertOpen(access);
    if (access.photoCount >= MEMORY_MAX_PHOTOS_PER_USER) {
      throw routeError(
        `You can add at most ${MEMORY_MAX_PHOTOS_PER_USER} photos`,
        400,
      );
    }

    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || !(file instanceof File)) {
      throw routeError("Expected multipart field 'file'", 400);
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      throw routeError("Only JPEG, PNG, WebP, or GIF images are allowed", 400);
    }
    if (file.size > MAX_BYTES) {
      throw routeError("Image must be 4MB or smaller", 400);
    }

    const pathname = `memories/${access.memory.sessionId}/${userId}/${Date.now()}.${extForType(file.type)}`;
    const blob = await put(pathname, file, {
      access: "public",
      token,
      contentType: file.type,
    });

    const photo = await getStore().addMemoryPhoto(memoryId, userId, blob.url);
    invalidateMemoryReads(
      memoryId,
      access.memory.sessionId,
      access.memberUserIds,
    );
    return c.json({ photo }, 201);
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

memoriesRoutes.delete("/:id/photos/:photoId", async (c) => {
  const memoryId = c.req.param("id");
  const userId = c.get("userId");
  try {
    const access = await requireMemberAccess(memoryId, userId);
    assertOpen(access);

    const removed = await getStore().deleteMemoryPhoto(
      memoryId,
      userId,
      c.req.param("photoId"),
    );
    if (!removed) return c.json({ error: "Photo not found" }, 404);
    invalidateMemoryReads(
      memoryId,
      access.memory.sessionId,
      access.memberUserIds,
    );
    return c.json({ ok: true });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

memoriesRoutes.put("/:id/songs/:position", async (c) => {
  const memoryId = c.req.param("id");
  const userId = c.get("userId");
  const body = putMemorySongBodySchema.parse(await c.req.json());
  try {
    const position = parsePosition(c.req.param("position"));
    const access = await requireMemberAccess(memoryId, userId);
    assertOpen(access);

    const trackId = parseSpotifyTrackId(body.spotifyUrl);
    if (!trackId) {
      throw routeError(
        "Paste a Spotify track link (open.spotify.com/track/... )",
        400,
      );
    }

    const metadata = await resolveSpotifyTrack(trackId);
    const song = await getStore().upsertMemorySong(
      memoryId,
      userId,
      position,
      metadata,
    );
    invalidateMemoryReads(
      memoryId,
      access.memory.sessionId,
      access.memberUserIds,
    );
    return c.json({ song });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

memoriesRoutes.delete("/:id/songs/:position", async (c) => {
  const memoryId = c.req.param("id");
  const userId = c.get("userId");
  try {
    const position = parsePosition(c.req.param("position"));
    const access = await requireMemberAccess(memoryId, userId);
    assertOpen(access);

    const removed = await getStore().deleteMemorySong(
      memoryId,
      userId,
      position,
    );
    if (!removed) return c.json({ error: "Song not found" }, 404);
    invalidateMemoryReads(
      memoryId,
      access.memory.sessionId,
      access.memberUserIds,
    );
    return c.json({ ok: true });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

/** Shared note — any member may write until the window ends, last write wins. */
memoriesRoutes.patch("/:id/note", async (c) => {
  const memoryId = c.req.param("id");
  const userId = c.get("userId");
  const body = updateMemoryNoteBodySchema.parse(await c.req.json());
  try {
    const access = await requireMemberAccess(memoryId, userId);
    assertOpen(access);

    const note = body.note?.trim() ? body.note.trim() : null;
    const updated = await getStore().updateMemoryNote(memoryId, note);
    if (!updated) return c.json({ error: "Not found" }, 404);
    invalidateMemoryReads(
      memoryId,
      access.memory.sessionId,
      access.memberUserIds,
    );
    return c.json({ note: updated.note });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

/** Soft "I'm done" — does not lock; album locks when the 24h window ends. */
memoriesRoutes.post("/:id/submit", async (c) => {
  const memoryId = c.req.param("id");
  const userId = c.get("userId");
  submitMemoryBodySchema.parse(await c.req.json());

  let access: StoredMemoryAccess;
  try {
    access = await requireMemberAccess(memoryId, userId);
    assertOpen(access);
    await getStore().submitMemory(memoryId, userId);
  } catch (err) {
    return httpErrorFromStore(c, err);
  }

  invalidateMemoryReads(
    memoryId,
    access.memory.sessionId,
    access.memberUserIds,
  );
  const memory = await getStore().getMemoryById(memoryId, userId);
  if (memory) cacheMemory(memory, userId);
  return c.json({ memory });
});

memoriesRoutes.post("/:id/export-playlist", async (c) => {
  const memoryId = c.req.param("id");
  const userId = c.get("userId");
  try {
    const access = await requireMemberAccess(memoryId, userId);
    const result = await exportMemoryPlaylist(memoryId, userId);
    // Playlist URL is part of locked payload — refresh that viewer's cache.
    invalidateMemoryReads(memoryId, access.memory.sessionId, [userId]);
    return c.json(result);
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});
