import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  ExportPlaylistResponse,
  MemoryLockedResponse,
  MemoryResponse,
  SpotifyStatusResponse,
} from "@summerhacks/shared";
import { api } from "../../lib/api";
import {
  clientCacheKeys,
  getCached,
  LOCKED_TTL,
  setCached,
} from "../../lib/queryCache";
import { PhotoboothCarousel } from "./PhotoboothCarousel";
import { Receipt } from "./Receipt";

function applyLocked(
  locked: MemoryLockedResponse,
  setMemory: (m: MemoryLockedResponse) => void,
  setPlaylistUrl: (url: string | null) => void,
) {
  setMemory(locked);
  setPlaylistUrl(locked.myPlaylist?.spotifyPlaylistUrl ?? null);
}

export function MemoryDetailPage() {
  const { id } = useParams();
  const [memory, setMemory] = useState<MemoryLockedResponse | null>(() => {
    if (!id) return null;
    const cached = getCached<MemoryLockedResponse>(
      clientCacheKeys.memoryById(id),
    );
    return cached?.status === "locked" ? cached : null;
  });
  const [stillOpenSessionId, setStillOpenSessionId] = useState<string | null>(
    null,
  );
  const [spotify, setSpotify] = useState<SpotifyStatusResponse | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(() => {
    if (!id) return null;
    const cached = getCached<MemoryLockedResponse>(
      clientCacheKeys.memoryById(id),
    );
    return cached?.status === "locked"
      ? (cached.myPlaylist?.spotifyPlaylistUrl ?? null)
      : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Locked memories are immutable — serve 7d cache and skip network on hit.
  const load = useCallback(async () => {
    if (!id) return;
    const cacheKey = clientCacheKeys.memoryById(id);
    const cached = getCached<MemoryLockedResponse>(cacheKey);
    if (cached?.status === "locked") {
      applyLocked(cached, setMemory, setPlaylistUrl);
      return;
    }

    const res = await api<{ memory: MemoryResponse }>(`/memories/${id}`);
    if (res.memory.status === "open") {
      setStillOpenSessionId(res.memory.sessionId);
      return;
    }
    setCached(cacheKey, res.memory, LOCKED_TTL, { persistLocked: true });
    applyLocked(res.memory, setMemory, setPlaylistUrl);
  }, [id]);

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load memory"),
    );
  }, [load]);

  useEffect(() => {
    api<SpotifyStatusResponse>("/spotify/status")
      .then(setSpotify)
      .catch(() => setSpotify({ connected: false, spotifyUserId: null }));
  }, []);

  async function exportPlaylist() {
    if (!memory) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<ExportPlaylistResponse>(
        `/memories/${memory.id}/export-playlist`,
        { method: "POST" },
      );
      setPlaylistUrl(res.playlistUrl);
      const updated: MemoryLockedResponse = {
        ...memory,
        myPlaylist: {
          spotifyPlaylistId:
            memory.myPlaylist?.spotifyPlaylistId ?? "exported",
          spotifyPlaylistUrl: res.playlistUrl,
        },
      };
      setMemory(updated);
      setCached(clientCacheKeys.memoryById(memory.id), updated, LOCKED_TTL, {
        persistLocked: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Playlist export failed");
    } finally {
      setBusy(false);
    }
  }

  async function connectSpotify() {
    setError(null);
    try {
      const res = await api<{ authUrl: string }>("/spotify/connect");
      window.location.href = res.authUrl;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start Spotify sign-in",
      );
    }
  }

  if (stillOpenSessionId) {
    return (
      <main className="page">
        <p className="lede">This album is still open for edits.</p>
        <Link className="primary" to={`/memories/session/${stillOpenSessionId}`}>
          Edit photos + songs
        </Link>
      </main>
    );
  }

  if (error && !memory) {
    return (
      <main className="page">
        <p className="error">{error}</p>
        <Link className="text-link" to="/memories">
          ← All albums
        </Link>
      </main>
    );
  }

  if (!memory) {
    return (
      <main className="page">
        <p>Loading receipt…</p>
      </main>
    );
  }

  return (
    <main className="page memory-detail-page">
      <p className="eyebrow">Album receipt</p>
      <h1>{memory.members.map((m) => m.displayName).join(" & ")}</h1>
      <p className="muted">
        Locked album interior — cover lives on the session; receipt, photobooth,
        and playlist below.
      </p>

      {error && <p className="error">{error}</p>}

      <Receipt memory={memory} />

      <section className="stack-section">
        <h2>Photobooth</h2>
        <p className="muted">Tap or swipe the strip to shuffle.</p>
        <PhotoboothCarousel photos={memory.photos} />
      </section>

      <section className="stack-section playlist-card">
        <h2>Playlist</h2>
        {playlistUrl ? (
          <a
            className="primary"
            href={playlistUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in Spotify
          </a>
        ) : spotify?.connected ? (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void exportPlaylist()}
          >
            Save to Spotify
          </button>
        ) : (
          <button
            type="button"
            className="secondary"
            onClick={() => void connectSpotify()}
          >
            Connect Spotify to save this playlist
          </button>
        )}
        <p className="muted">
          {memory.songs.length} tracks from {memory.members.length} people.
        </p>
      </section>

      <Link className="text-link" to={`/session/${memory.sessionId}`}>
        ← Back to session
      </Link>
      <Link className="text-link" to="/memories">
        ← All albums
      </Link>
    </main>
  );
}
