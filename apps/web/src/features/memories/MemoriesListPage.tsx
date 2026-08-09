import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { MemoryListItem } from "@summerhacks/shared";
import { api } from "../../lib/api";
import { formatMemoryDate, initialsOf } from "./format";

const SPOTIFY_NOTICES: Record<string, string> = {
  connected: "Spotify connected.",
  denied: "Spotify sign-in was cancelled.",
  error: "Spotify sign-in failed. Try again.",
};

export function MemoriesListPage() {
  const [searchParams] = useSearchParams();
  const [memories, setMemories] = useState<MemoryListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const spotifyNotice = SPOTIFY_NOTICES[searchParams.get("spotify") ?? ""];

  const load = useCallback(async () => {
    const res = await api<{ memories: MemoryListItem[] }>("/memories");
    setMemories(res.memories);
  }, []);

  useEffect(() => {
    load()
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load memories"),
      )
      .finally(() => setLoading(false));
  }, [load]);

  return (
    <main className="page memories-page">
      <p className="eyebrow">Keepsakes</p>
      <h1>Memories</h1>
      <p className="lede">
        Locked-in hangouts — receipt, photobooth strips, and the playlist.
      </p>

      {spotifyNotice && <p className="muted">{spotifyNotice}</p>}
      {error && <p className="error">{error}</p>}

      <section className="stack-section">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : memories.length === 0 ? (
          <p className="muted">No memories yet. Bump someone to start one.</p>
        ) : (
          <ul className="plain-list">
            {memories.map((m) => (
              <li key={m.id}>
                <Link className="memory-row" to={`/memories/${m.id}`}>
                  {m.coverPhotoUrl ? (
                    <img
                      className="memory-row__cover"
                      src={m.coverPhotoUrl}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="memory-row__cover memory-row__cover--empty"
                      aria-hidden
                    >
                      {initialsOf(m.memberDisplayNames)}
                    </span>
                  )}
                  <span className="memory-row__body">
                    <span className="memory-row__title">
                      {m.memberDisplayNames.join(" & ")}
                    </span>
                    <span className="member-meta">
                      {formatMemoryDate(m.hangoutAt)}
                    </span>
                  </span>
                  <span className="memory-row__badge">{m.songCount} ♪</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link className="text-link" to="/">
        ← Home
      </Link>
    </main>
  );
}
