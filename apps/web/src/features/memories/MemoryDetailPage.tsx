import { useCallback, useEffect, useState, type ReactNode } from "react";
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

/** Shared wrapper so every state on this route sits on the same cream table. */
function DetailShell({ children }: { children: ReactNode }) {
  return (
    <main className="memory-shell">
      <div className="memory-shell__inner memory-shell__inner--stack">
        {children}
      </div>
    </main>
  );
}

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
      <DetailShell>
        <p className="memory-hint">this memory is still open.</p>
        <Link
          className="memory-link"
          to={`/memories/session/${stillOpenSessionId}`}
        >
          <span className="memory-link__glyph" aria-hidden>
            +
          </span>
          add photos + songs
        </Link>
      </DetailShell>
    );
  }

  if (error && !memory) {
    return (
      <DetailShell>
        <p className="memory-error">{error}</p>
        <Link className="memory-link memory-link--muted" to="/memories">
          <span className="memory-link__glyph" aria-hidden>
            ←
          </span>
          back to memories
        </Link>
      </DetailShell>
    );
  }

  if (!memory) {
    return (
      <DetailShell>
        <p className="memory-hint">loading memory…</p>
      </DetailShell>
    );
  }

  return (
    <DetailShell>
      {error && <p className="memory-error">{error}</p>}

      <Receipt memory={memory} />

      <div className="memory-detail__group memory-detail__group--photos">
        <p className="memory-label">Photos</p>
        <PhotoboothCarousel photos={memory.photos} />
      </div>

      <div className="memory-detail__group memory-detail__group--sound">
        <p className="memory-label">Soundtrack</p>
        {/* A footnote, not a call to action. */}
        {playlistUrl ? (
          <a
            className="memory-link"
            href={playlistUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span className="memory-link__glyph" aria-hidden>
              ♪
            </span>
            open in spotify
          </a>
        ) : spotify?.connected ? (
          <button
            type="button"
            className="memory-link"
            disabled={busy}
            onClick={() => void exportPlaylist()}
          >
            <span className="memory-link__glyph" aria-hidden>
              +
            </span>
            save to spotify
          </button>
        ) : (
          <button
            type="button"
            className="memory-link"
            onClick={() => void connectSpotify()}
          >
            <span className="memory-link__glyph" aria-hidden>
              ♪
            </span>
            connect spotify to save this playlist
          </button>
        )}
      </div>

      <div className="memory-detail__group memory-detail__group--back">
        <Link className="memory-link memory-link--muted" to="/memories">
          <span className="memory-link__glyph" aria-hidden>
            ←
          </span>
          back to memories
        </Link>
      </div>
    </DetailShell>
  );
}
