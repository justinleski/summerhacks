import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ACTIVITY_POLL_INTERVAL_MS,
  type EventDetail,
  type EventPhoto,
  type MeProfile,
  type RsvpStatus,
} from "@summerhacks/shared";
import { api, uploadEventPhoto } from "../../lib/api";

export function EventDetailPage() {
  const { id } = useParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    api<MeProfile>("/users/me")
      .then((me) => setMyId(me.id))
      .catch(() => undefined);
  }, []);

  const isHost = Boolean(myId && event && myId === event.hostUserId);
  const isPast = Boolean(
    event &&
      new Date(event.endsAt ?? event.startsAt).getTime() <= Date.now(),
  );
  const canUpload = isHost && isPast;
  const canViewPhotos = isHost || event?.myRsvp === "going";

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

  useEffect(() => {
    if (!id || !canViewPhotos) {
      setPhotos([]);
      return;
    }
    api<{ photos: EventPhoto[] }>(`/events/${id}/photos`)
      .then((res) => setPhotos(res.photos))
      .catch(() => undefined);
  }, [id, canViewPhotos]);

  async function submitPhoto(e: FormEvent) {
    e.preventDefault();
    if (!id || !photoFile) return;
    setPhotoBusy(true);
    setError(null);
    try {
      const photoUrl = await uploadEventPhoto(photoFile);
      const res = await api<{ photo: EventPhoto }>(`/events/${id}/photos`, {
        method: "POST",
        body: JSON.stringify({ photoUrl }),
      });
      setPhotos((prev) => [res.photo, ...prev]);
      setPhotoFile(null);
      setPhotoInputKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setPhotoBusy(false);
    }
  }

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

      {canViewPhotos && (
        <section className="stack-section">
          <h2>Photos</h2>
          {canUpload && (
            <form className="inline-form" onSubmit={submitPhoto}>
              <input
                key={photoInputKey}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="submit"
                className="primary"
                disabled={photoBusy || !photoFile}
              >
                {photoBusy ? "Adding…" : "Add photo"}
              </button>
            </form>
          )}
          {photos.length === 0 ? (
            <p className="muted">No photos yet.</p>
          ) : (
            <div className="photo-grid">
              {photos.map((p) => (
                <img key={p.id} src={p.photoUrl} alt="" />
              ))}
            </div>
          )}
        </section>
      )}

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
