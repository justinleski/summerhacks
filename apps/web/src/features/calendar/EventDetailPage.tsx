import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ACTIVITY_POLL_INTERVAL_MS,
  type EventDetail,
  type RsvpStatus,
} from "@summerhacks/shared";
import { api } from "../../lib/api";

export function EventDetailPage() {
  const { id } = useParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const res = await api<{ event: EventDetail }>(`/events/${id}`);
    setEvent(res.event);
  }, [id]);

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load event"),
    );
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, ACTIVITY_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [id, load]);

  async function rsvp(status: RsvpStatus) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ event: EventDetail }>(`/events/${id}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setEvent(res.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "RSVP failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!id || !comment.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/events/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: comment.trim() }),
      });
      setComment("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comment failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !event) {
    return (
      <main className="page">
        <p className="error">{error}</p>
        <Link to="/calendar">← Calendar</Link>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="page">
        <p>Loading event…</p>
      </main>
    );
  }

  return (
    <main className="page event-page">
      <p className="eyebrow">Event</p>
      <h1>{event.title}</h1>
      <p className="lede">
        Hosted by {event.hostDisplayName} ·{" "}
        {new Date(event.startsAt).toLocaleString()}
        {event.endsAt
          ? ` – ${new Date(event.endsAt).toLocaleString()}`
          : ""}
      </p>

      {error && <p className="error">{error}</p>}

      {event.imageUrl && (
        <img className="event-image" src={event.imageUrl} alt="" />
      )}

      <section className="stack-section">
        <h2>About</h2>
        <p>{event.description}</p>
      </section>

      <section className="stack-section">
        <h2>RSVP</h2>
        <p className="muted">
          Your status:{" "}
          {event.myRsvp ? event.myRsvp.replace("_", " ") : "not set"}
        </p>
        <div className="row-actions">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void rsvp("going")}
          >
            Going
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void rsvp("not_going")}
          >
            Not going
          </button>
        </div>
      </section>

      <section className="stack-section">
        <h2>Attendees</h2>
        <ul className="plain-list">
          {event.attendees.map((a) => (
            <li key={a.userId} className="row-item">
              <span>{a.displayName}</span>
              <span className="member-meta">{a.status.replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stack-section">
        <h2>Comments</h2>
        <ul className="plain-list">
          {event.comments.length === 0 ? (
            <li className="muted">No comments yet.</li>
          ) : (
            event.comments.map((c) => (
              <li key={c.id}>
                <strong>{c.displayName}</strong>
                <p>{c.body}</p>
                <span className="member-meta">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </li>
            ))
          )}
        </ul>
        <form className="inline-form" onSubmit={submitComment}>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment"
            maxLength={280}
          />
          <button
            type="submit"
            className="primary"
            disabled={busy || !comment.trim()}
          >
            Post
          </button>
        </form>
      </section>

      <Link className="text-link" to="/calendar">
        ← Calendar
      </Link>
    </main>
  );
}
