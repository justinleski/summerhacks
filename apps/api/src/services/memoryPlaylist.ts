import { getStore } from "../db/index.js";
import { createPlaylistWithTracks } from "./spotify.js";

function playlistError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

function monthDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Creates (or returns) the current user's private playlist for a locked memory.
 * Idempotent: an existing `memory_playlists` row short-circuits the Spotify calls.
 */
export async function exportMemoryPlaylist(
  memoryId: string,
  userId: string,
): Promise<{ playlistUrl: string }> {
  const store = getStore();
  const memory = await store.getMemoryById(memoryId, userId);
  if (!memory) throw playlistError("Memory not found", 404);
  if (memory.status !== "locked") {
    throw playlistError("Memory is not locked yet", 400);
  }
  if (memory.myPlaylist) {
    return { playlistUrl: memory.myPlaylist.spotifyPlaylistUrl };
  }

  const connection = await store.getSpotifyConnection(userId);
  if (!connection) throw playlistError("Connect Spotify first", 400);

  const otherNames = memory.members
    .filter((m) => !m.isViewer)
    .map((m) => m.displayName);
  const name = `hangout w/ ${otherNames.join(", ")}: ${monthDay(memory.hangoutAt)}`;

  const { playlistId, playlistUrl } = await createPlaylistWithTracks({
    userId,
    spotifyUserId: connection.spotifyUserId,
    name,
    description: memory.note ?? "",
    trackIds: memory.songs.map((s) => s.spotifyTrackId),
  });

  await store.upsertMemoryPlaylist(memoryId, userId, playlistId, playlistUrl);
  return { playlistUrl };
}

export type OnLockExportResult = {
  /** Members whose playlist was created (or already existed). */
  exported: string[];
  /** Members with a Spotify connection whose export threw. */
  failed: string[];
  /** Members with no Spotify connection — nothing to do, not a failure. */
  skipped: string[];
};

/**
 * Exports a playlist for every member that already connected Spotify.
 *
 * Awaited by the submit handler rather than detached, because a serverless
 * function can freeze right after responding and silently drop the work.
 * This never throws: every member is wrapped individually, so one bad token
 * cannot stop the others and cannot fail the submit response. Anyone in
 * `failed` still has the manual "Save to Spotify" button on the detail page.
 */
export async function exportPlaylistsOnLock(
  memoryId: string,
  memberUserIds: string[],
): Promise<OnLockExportResult> {
  const store = getStore();
  const result: OnLockExportResult = {
    exported: [],
    failed: [],
    skipped: [],
  };

  for (const userId of memberUserIds) {
    try {
      const connection = await store.getSpotifyConnection(userId);
      if (!connection) {
        result.skipped.push(userId);
        continue;
      }
      await exportMemoryPlaylist(memoryId, userId);
      result.exported.push(userId);
    } catch (err) {
      result.failed.push(userId);
      console.warn("Playlist export on lock failed", memoryId, userId, err);
    }
  }
  return result;
}
