import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MemoryResponse, Session } from "@summerhacks/shared";
import { api } from "../../lib/api";
import { formatCountdown } from "../memories/format";

/** `null` = no memory row (sessions from before Memories shipped). */
type MemoryState = MemoryResponse | null;

export function SessionView() {
  const { id } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [memory, setMemory] = useState<MemoryState>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!id) return;
    api<{ session: Session }>(`/sessions/${id}`)
      .then((res) => setSession(res.session))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [id]);

  useEffect(() => {
    if (!id) return;
    // 404 here just means this session predates Memories, or the window expired.
    api<{ memory: MemoryResponse }>(`/memories/session/${id}`)
      .then((res) => setMemory(res.memory))
      .catch(() => setMemory(null));
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (error) {
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

  const msLeft = memory
    ? new Date(memory.windowExpiresAt).getTime() - now
    : 0;
  const windowClosed = Boolean(memory) && msLeft <= 0;

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

      {memory?.status === "open" && !windowClosed && (
        <section className="stack-section memory-cta">
          <h2>Memory of this hangout</h2>
          <p className="lede">{formatCountdown(msLeft)} left</p>
          <Link className="primary" to={`/memories/session/${session.id}`}>
            Add photos + songs
          </Link>
          <ul className="plain-list">
            {memory.members.map((m) => (
              <li key={m.userId} className="row-item">
                <span>
                  {m.displayName}
                  {m.isViewer ? " (you)" : ""}
                </span>
                <span className="member-meta">
                  {m.isViewer
                    ? m.submitted
                      ? "you've submitted"
                      : "still editing"
                    : m.submitted
                      ? "submitted"
                      : "still writing"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {memory?.status === "locked" && (
        <section className="stack-section memory-cta">
          <h2>Memory locked</h2>
          <Link className="primary" to={`/memories/${memory.id}`}>
            View memory
          </Link>
        </section>
      )}

      {(!memory || windowClosed) && (
        <section className="stack-section">
          <h2>Memory</h2>
          <p className="muted">
            {windowClosed
              ? "Memory window closed."
              : "No memory for this session."}
          </p>
        </section>
      )}

      {session.payload.notes && (
        <section className="payload">
          <h2>Shared info</h2>
          <p>{session.payload.notes}</p>
        </section>
      )}

      <Link className="text-link" to="/">
        ← Recent connections
      </Link>
    </main>
  );
}
