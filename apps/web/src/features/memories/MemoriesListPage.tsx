import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { MemoryListItem } from "@summerhacks/shared";
import { api } from "../../lib/api";
import { seededTilt } from "./deterministic";
import { firstNamesOf, initialsOf, memoryHeadline } from "./format";

const SPOTIFY_NOTICES: Record<string, string> = {
  connected: "Spotify connected.",
  denied: "Spotify sign-in was cancelled.",
  error: "Spotify sign-in failed. Try again.",
};

/** Cards scatter between these bounds, deterministically per memory. */
const MAX_TILT_DEGREES = 4;

/** `Aug 9 · Ada, Grace` */
function cardMeta(memory: MemoryListItem): string {
  const day = new Date(memory.hangoutAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${day} · ${firstNamesOf(memory.memberDisplayNames).join(", ")}`;
}

function MemoryCard({ memory }: { memory: MemoryListItem }) {
  const tilt = seededTilt(memory.id, MAX_TILT_DEGREES);
  const style = { "--memory-card-tilt": `${tilt}deg` } as CSSProperties;

  return (
    <Link className="memory-card" style={style} to={`/memories/${memory.id}`}>
      {memory.coverPhotoUrl ? (
        <img
          className="memory-card__cover"
          src={memory.coverPhotoUrl}
          alt=""
          loading="lazy"
        />
      ) : (
        <span className="memory-card__cover memory-card__cover--empty" aria-hidden>
          {initialsOf(firstNamesOf(memory.memberDisplayNames))}
        </span>
      )}
      <span className="memory-card__title">
        {memoryHeadline(memory.title, memory.memberDisplayNames)}
      </span>
      <span className="memory-card__meta">{cardMeta(memory)}</span>
      <span className="memory-card__badge">{memory.songCount} ♪</span>
    </Link>
  );
}

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
    <main className="memory-shell">
      <div className="memory-shell__inner memory-shell__inner--wide">
        <header className="memories-header">
          <h1 className="memories-header__title">Memories</h1>
          <p className="memories-header__sub">moments preserved from bumps</p>
        </header>

        {spotifyNotice && <p className="memory-hint">{spotifyNotice}</p>}
        {error && <p className="memory-error">{error}</p>}

        {loading ? (
          <p className="memory-hint">loading…</p>
        ) : memories.length === 0 ? (
          <div className="memory-empty">
            {/* A blank polaroid waiting to be filled. */}
            <div className="memory-empty__frame" aria-hidden />
            <p className="memory-empty__title">no memories yet</p>
            <p className="memory-empty__hint">bump someone to start one</p>
          </div>
        ) : (
          <ul className="memory-grid">
            {memories.map((m) => (
              <li key={m.id}>
                <MemoryCard memory={m} />
              </li>
            ))}
          </ul>
        )}

        <div className="memory-detail__group memory-detail__group--back">
          <Link className="memory-link memory-link--muted" to="/">
            <span className="memory-link__glyph" aria-hidden>
              ←
            </span>
            back home
          </Link>
        </div>
      </div>
    </main>
  );
}
