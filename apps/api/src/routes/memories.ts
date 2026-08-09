import { put } from "@vercel/blob";
import { Hono } from "hono";
import {
  MEMORY_MAX_PHOTOS_PER_USER,
  MEMORY_SONGS_PER_USER,
  parseSpotifyTrackId,
  putMemorySongBodySchema,
  submitMemoryBodySchema,
  updateMemoryNoteBodySchema,
  updateMemoryTitleBodySchema,
} from "@summerhacks/shared";
import { getStore } from "../db/index.js";
import type { StoredMemoryAccess } from "../db/types.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import {
  exportMemoryPlaylist,
  exportPlaylistsOnLock,
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
}

function assertNotSubmitted(access: StoredMemoryAccess): void {
  if (access.submitted) {
    throw routeError("You already submitted — edits are locked", 409);
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

export const memoriesRoutes = new Hono<{ Variables: AuthVariables }>();

memoriesRoutes.use("*", requireAuth);

memoriesRoutes.get("/", async (c) => {
  const memories = await getStore().listLockedMemoriesForUser(c.get("userId"));
  return c.json({ memories });
});

memoriesRoutes.get("/session/:sessionId", async (c) => {
  const store = getStore();
  const userId = c.get("userId");
  const sessionId = c.req.param("sessionId");

  const session = await store.getSession(sessionId);
  if (!session) return c.json({ error: "Not found" }, 404);
  if (!session.members.some((m) => m.userId === userId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const memory = await store.getMemoryBySessionId(sessionId, userId);
  if (!memory) return c.json({ error: "Not found" }, 404);
  return c.json({ memory });
});

memoriesRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  try {
    await requireMemberAccess(c.req.param("id"), userId);
    const memory = await getStore().getMemoryById(c.req.param("id"), userId);
    if (!memory) return c.json({ error: "Not found" }, 404);
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
    assertNotSubmitted(access);
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
    assertNotSubmitted(access);

    const removed = await getStore().deleteMemoryPhoto(
      memoryId,
      userId,
      c.req.param("photoId"),
    );
    if (!removed) return c.json({ error: "Photo not found" }, 404);
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
    assertNotSubmitted(access);

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
    assertNotSubmitted(access);

    const removed = await getStore().deleteMemorySong(
      memoryId,
      userId,
      position,
    );
    if (!removed) return c.json({ error: "Song not found" }, 404);
    return c.json({ ok: true });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

/** Shared note — any member may write until the memory locks, last write wins. */
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
    return c.json({ note: updated.note });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

/** Shared title — same semantics as the note: any member, until the memory locks. */
memoriesRoutes.patch("/:id/title", async (c) => {
  const memoryId = c.req.param("id");
  const userId = c.get("userId");
  const body = updateMemoryTitleBodySchema.parse(await c.req.json());
  try {
    const access = await requireMemberAccess(memoryId, userId);
    assertOpen(access);

    const title = body.title?.trim() ? body.title.trim() : null;
    const updated = await getStore().updateMemoryTitle(memoryId, title);
    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json({ title: updated.title });
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});

memoriesRoutes.post("/:id/submit", async (c) => {
  const memoryId = c.req.param("id");
  const userId = c.get("userId");
  submitMemoryBodySchema.parse(await c.req.json());

  let locked = false;
  let memberUserIds: string[] = [];
  try {
    await requireMemberAccess(memoryId, userId);
    const result = await getStore().submitMemory(memoryId, userId);
    locked = result.locked;
    memberUserIds = result.memberUserIds;
  } catch (err) {
    return httpErrorFromStore(c, err);
  }

  // Awaited so it actually runs (a serverless function can freeze right after
  // responding). Deliberately outside the try above: this must never turn a
  // successful submit into an error response, so it swallows its own failures
  // and members left without a playlist use the manual button on the detail page.
  if (locked) {
    await exportPlaylistsOnLock(memoryId, memberUserIds);
  }

  const memory = await getStore().getMemoryById(memoryId, userId);
  return c.json({ memory });
});

memoriesRoutes.post("/:id/export-playlist", async (c) => {
  const memoryId = c.req.param("id");
  const userId = c.get("userId");
  try {
    await requireMemberAccess(memoryId, userId);
    const result = await exportMemoryPlaylist(memoryId, userId);
    return c.json(result);
  } catch (err) {
    return httpErrorFromStore(c, err);
  }
});
