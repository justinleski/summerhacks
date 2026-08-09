import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  COVER_CONTEST_POLL_MS,
  MEMORY_POLL_INTERVAL_MS,
  type AlbumCover,
  type CoverContest,
  type MeProfile,
  type MemoryResponse,
  type Session,
  type SessionCoversResponse,
} from "@summerhacks/shared";
import { api } from "../../lib/api";
import {
  clientCacheKeys,
  getCached,
  invalidate,
  LOCKED_TTL,
  OPEN_TTL,
  setCached,
} from "../../lib/queryCache";
import { AlbumCoverEditor } from "../album/AlbumCoverEditor";
import { AlbumWindowBar } from "../album/AlbumWindowBar";
import { CoverSpin } from "../album/CoverSpin";
import { formatCountdown } from "../memories/format";
import { memberContributionStatus } from "../memories/memberStatus";

/** `null` = no memory row (sessions from before Memories shipped). */
type MemoryState = MemoryResponse | null;

function formatRemaining(editableUntil: string): string {
  const ms = new Date(editableUntil).getTime() - Date.now();
  if (ms <= 0) return "Edit window ended";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left to edit`;
  if (h > 0) return `${h}h ${m}m left to edit`;
  return `${Math.max(1, m)}m left to edit`;
}

function coverPreview(cover: AlbumCover | null | undefined) {
  if (!cover) {
    return (
      <div className="album-cover-preview album-cover-preview--empty" aria-hidden>
        …
      </div>
    );
  }
  if (cover.coverUrl) {
    return (
      <img
        className="album-cover-preview"
        src={cover.coverUrl}
        alt={`${cover.displayName}'s cover`}
      />
    );
  }
  return (
    <div className="album-cover-preview album-cover-preview--empty" aria-hidden>
      No cover yet
    </div>
  );
}

export function SessionView() {
  const { id } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [covers, setCovers] = useState<AlbumCover[]>([]);
  const [mine, setMine] = useState<AlbumCover | null>(null);
  const [contest, setContest] = useState<CoverContest | null>(null);
  const [memory, setMemory] = useState<MemoryState>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const spinPlayedRef = useRef(false);

  const applyCovers = useCallback(
    (res: SessionCoversResponse, sessionId?: string) => {
      setCovers(res.covers);
      setMine(res.mine);
      setContest(res.contest);
      if (sessionId) {
        setCached(clientCacheKeys.covers(sessionId), res, OPEN_TTL);
      }
      if (
        res.contest.phase === "resolved" &&
        res.contest.method === "spin" &&
        !spinPlayedRef.current
      ) {
        setSpinning(true);
      }
    },
    [],
  );

  const loadCovers = useCallback(
    async (sessionId: string, opts?: { bypassCache?: boolean }) => {
      try {
        if (!opts?.bypassCache) {
          const cached = getCached<SessionCoversResponse>(
            clientCacheKeys.covers(sessionId),
          );
          if (cached) applyCovers(cached, sessionId);
        }
        const res = await api<SessionCoversResponse>(
          `/sessions/${sessionId}/album`,
        );
        applyCovers(res, sessionId);
        if (!res.mine) {
          const created = await api<{ album: AlbumCover }>(
            `/sessions/${sessionId}/album`,
            { method: "POST" },
          );
          setMine(created.album);
          invalidate(clientCacheKeys.covers(sessionId));
          const again = await api<SessionCoversResponse>(
            `/sessions/${sessionId}/album`,
          );
          applyCovers(again, sessionId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load covers");
      }
    },
    [applyCovers],
  );

  useEffect(() => {
    if (!id) return;
    void api<MeProfile>("/users/me")
      .then((me) => setMeId(me.id))
      .catch(() => setMeId(null));

    const cachedSession = getCached<Session>(clientCacheKeys.session(id));
    if (cachedSession) setSession(cachedSession);

    api<{ session: Session }>(`/sessions/${id}`)
      .then(async (res) => {
        setSession(res.session);
        setCached(clientCacheKeys.session(id), res.session, OPEN_TTL);
        await loadCovers(res.session.id);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [id, loadCovers]);

  useEffect(() => {
    if (!id) return;
    const cached = getCached<MemoryResponse>(
      clientCacheKeys.memoryBySession(id),
    );
    if (cached) setMemory(cached);

    // 404 here just means this session predates Memories, or the window expired.
    const loadMemory = () =>
      api<{ memory: MemoryResponse }>(`/memories/session/${id}`)
        .then((res) => {
          setMemory(res.memory);
          const ttl =
            res.memory.status === "locked" ? LOCKED_TTL : OPEN_TTL;
          setCached(clientCacheKeys.memoryBySession(id), res.memory, ttl);
          if (res.memory.status === "locked") {
            setCached(
              clientCacheKeys.memoryById(res.memory.id),
              res.memory,
              ttl,
              { persistLocked: true },
            );
          }
        })
        .catch(() => setMemory(null));

    void loadMemory();
    const timer = window.setInterval(() => {
      // Locked albums are immutable — stop once we know.
      setMemory((current) => {
        if (current?.status === "locked") return current;
        void loadMemory();
        return current;
      });
    }, MEMORY_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Poll for peer ready / votes — skip while the pixel editor is open so
  // drawing stays fully client-side until Save. Once resolved (incl. during
  // the local spin reveal), stop — polling was restarting CoverSpin forever.
  useEffect(() => {
    if (!id || !contest || editorOpen) return;
    if (contest.phase === "resolved") return;
    const t = setInterval(() => {
      void loadCovers(id, { bypassCache: true });
    }, COVER_CONTEST_POLL_MS);
    return () => clearInterval(t);
  }, [id, contest, loadCovers, editorOpen]);

  async function markReady() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      invalidate(clientCacheKeys.covers(id));
      const res = await api<SessionCoversResponse>(
        `/sessions/${id}/album/ready`,
        { method: "POST" },
      );
      applyCovers(res, id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark ready");
    } finally {
      setBusy(false);
    }
  }

  async function castVote(choiceUserId: string | null) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      invalidate(clientCacheKeys.covers(id));
      const res = await api<SessionCoversResponse>(
        `/sessions/${id}/album/vote`,
        {
          method: "POST",
          body: JSON.stringify({ choiceUserId }),
        },
      );
      applyCovers(res, id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setBusy(false);
    }
  }

  async function forceResolve() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      invalidate(clientCacheKeys.covers(id));
      const res = await api<SessionCoversResponse>(
        `/sessions/${id}/album/resolve`,
        { method: "POST" },
      );
      applyCovers(res, id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !session) {
    return (
      <main className="page">
        <p className="error">{error}</p>
        <Link to="/">Back home</Link>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="page">
        <p>Loading session…</p>
      </main>
    );
  }

  const phase = contest?.phase ?? "editing";
  const myVote = contest?.votes.find((v) => v.voterUserId === meId);
  const winner = covers.find((c) => c.userId === contest?.winnerUserId);
  const showReveal = phase === "voting" || phase === "resolved";
  const msLeft = memory
    ? new Date(memory.windowExpiresAt).getTime() - now
    : 0;
  const windowClosed = Boolean(memory) && msLeft <= 0;
  const windowExpiresAt =
    memory?.windowExpiresAt ?? mine?.editableUntil ?? null;
  const windowStartsAt = memory?.windowStartsAt;
  const peersReady = covers.filter(
    (c) => c.userId !== meId && c.readyAt,
  ).length;
  const peersTotal = covers.filter((c) => c.userId !== meId).length;
  const editingCovers = covers.length > 0 ? covers : mine ? [mine] : [];

  return (
    <main className="page session-page">
      <p className="eyebrow">Shared session</p>
      <h1>Connected</h1>
      <p className="lede">
        Status: <strong>{session.status}</strong> · opened via bump
      </p>

      <section className="members">
        <h2>People</h2>
        <ul>
          {session.members.map((m) => (
            <li key={m.userId}>
              <span className="member-name">{m.displayName}</span>
              <span className="member-meta">
                {m.confirmedAt ? "confirmed" : "joined"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stack-section album-cover-block">
        <h2>Album cover</h2>
        {windowExpiresAt && (
          <AlbumWindowBar
            expiresAt={windowExpiresAt}
            startsAt={windowStartsAt}
            now={now}
          />
        )}
        <p className="muted">
          {phase === "editing" &&
            (mine
              ? mine.editable
                ? formatRemaining(mine.editableUntil)
                : mine.readyAt
                  ? peersReady >= peersTotal && peersTotal > 0
                    ? "Everyone is ready — opening reveal…"
                    : `Ready — waiting for others (${peersReady}/${peersTotal})`
                  : "Edit window ended — voting opens soon."
              : "Loading your cover…")}
          {phase === "voting" && "Reveal — vote for your favorite, or spin."}
          {phase === "resolved" &&
            !spinning &&
            (contest?.method === "vote"
              ? "Winner by vote."
              : "Winner by spin.")}
        </p>

        {error && <p className="error">{error}</p>}

        {spinning && contest?.winnerUserId && (
          <CoverSpin
            covers={covers}
            winnerUserId={contest.winnerUserId}
            onDone={() => {
              spinPlayedRef.current = true;
              setSpinning(false);
            }}
          />
        )}

        {!spinning && (
          <div className="cover-grid">
            {(showReveal ? covers : editingCovers).map((c) => {
              const isMine = c.userId === meId;
              const isWinner =
                phase === "resolved" && c.userId === contest?.winnerUserId;
              const peerHidden = phase === "editing" && !isMine;
              return (
                <article
                  key={c.userId}
                  className={
                    "cover-card" + (isWinner ? " cover-card--winner" : "")
                  }
                >
                  <p className="cover-card__name">
                    {isMine ? "You" : c.displayName}
                    {c.readyAt && phase === "editing" ? " · ready" : ""}
                    {isWinner ? " · winner" : ""}
                  </p>
                  {peerHidden ? (
                    <div
                      className="album-cover-preview album-cover-preview--empty"
                      aria-hidden
                    >
                      {c.readyAt ? "Ready" : "Drawing…"}
                    </div>
                  ) : (
                    coverPreview(c)
                  )}
                  {phase === "voting" && !myVote && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void castVote(c.userId)}
                    >
                      Vote for this
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {phase === "editing" && mine && (
          <div className="cover-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setEditorOpen(true)}
            >
              {mine.editable
                ? mine.coverUrl
                  ? "Edit your cover"
                  : "Draw your cover"
                : "View your cover"}
            </button>
            {mine.editable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void markReady()}
              >
                I&apos;m ready
              </button>
            )}
          </div>
        )}

        {phase === "voting" && !myVote && (
          <div className="cover-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void castVote(null)}
            >
              Can&apos;t decide
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void forceResolve()}
            >
              Spin now
            </button>
          </div>
        )}

        {phase === "voting" && myVote && (
          <p className="muted">
            Vote in — waiting for others, or{" "}
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => void forceResolve()}
            >
              spin now
            </button>
            .
          </p>
        )}

        {phase === "resolved" && !spinning && winner && (
          <p className="lede">
            Session cover: <strong>{winner.displayName}</strong>
          </p>
        )}
      </section>

      {memory?.status === "open" && !windowClosed && (
        <section className="stack-section memory-cta">
          <h2>Album photos & songs</h2>
          <AlbumWindowBar
            expiresAt={memory.windowExpiresAt}
            startsAt={memory.windowStartsAt}
            now={now}
          />
          <p className="lede">{formatCountdown(msLeft)} left to edit</p>
          <p className="muted">
            Inside this album: Spotify tracks and photos that become the
            receipt after the window locks.
          </p>
          <Link className="primary" to={`/memories/session/${session.id}`}>
            Edit photos + songs
          </Link>
          <ul className="plain-list">
            {memory.members.map((m) => {
              const status = memberContributionStatus(
                m,
                memory.photos,
                memory.songs,
              );
              return (
                <li key={m.userId} className="row-item">
                  <span>
                    {m.displayName}
                    {m.isViewer ? " (you)" : ""}
                  </span>
                  <span className="member-meta">{status.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {memory?.status === "locked" && (
        <section className="stack-section memory-cta">
          <h2>Album receipt</h2>
          <p className="muted">Locked — photos, songs, and receipt are final.</p>
          <Link className="primary" to={`/memories/${memory.id}`}>
            View receipt
          </Link>
        </section>
      )}

      {(!memory || (windowClosed && memory.status === "open")) && (
        <section className="stack-section">
          <h2>Album interior</h2>
          <p className="muted">
            {windowClosed
              ? "Edit window ended — receipt locks when the sweeper runs."
              : "No album interior for this session."}
          </p>
        </section>
      )}

      <section className="payload">
        <h2>Shared info</h2>
        {session.payload.notes && <p>{session.payload.notes}</p>}
        <ul className="profile-list">
          {session.payload.profiles.map((p) => (
            <li key={p.userId}>
              <strong>{p.displayName}</strong>
              <span>
                {p.photoUrls.length
                  ? `${p.photoUrls.length} photos`
                  : "No photos yet"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Link className="text-link" to="/">
        ← Recent connections
      </Link>

      {mine && (
        <AlbumCoverEditor
          sessionId={session.id}
          album={mine}
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          onAlbumUpdated={(album) => {
            invalidate(clientCacheKeys.covers(session.id));
            setMine(album);
            setCovers((prev) => {
              const others = prev.filter((c) => c.userId !== album.userId);
              return [...others, album];
            });
          }}
        />
      )}
    </main>
  );
}
