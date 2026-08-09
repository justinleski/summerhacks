import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  ActivityNotification,
  CalendarEvent,
} from "@summerhacks/shared";
import { api, uploadEventImage } from "../../lib/api";

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

export function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [activity, setActivity] = useState<ActivityNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [endsAt, setEndsAt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    const [cal, act] = await Promise.all([
      api<{ events: CalendarEvent[] }>("/calendar"),
      api<{ notifications: ActivityNotification[] }>("/activity"),
    ]);
    setEvents(cal.events);
    setActivity(act.notifications.slice(0, 8));
  }, []);

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load calendar"),
    );
  }, [load]);

  const highlightDays = useMemo(() => {
    const set = new Set<number>();
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}`;
    for (const e of events) {
      if (monthKey(e.startsAt) !== key) continue;
      set.add(new Date(e.startsAt).getDate());
    }
    return set;
  }, [events]);

  const monthLabel = useMemo(() => {
    const now = new Date();
    return now.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, []);

  const daysInMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }, []);

  async function createEvent(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        try {
          imageUrl = await uploadEventImage(imageFile);
        } catch (uploadErr) {
          setError(
            uploadErr instanceof Error
              ? uploadErr.message
              : "Image upload failed",
          );
          setBusy(false);
          return;
        }
      }
      await api("/events", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          imageUrl,
        }),
      });
      setTitle("");
      setDescription("");
      setEndsAt("");
      setImageFile(null);
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    try {
      await api("/activity/read-all", { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark read");
    }
  }

  return (
    <main className="page calendar-page">
      <p className="eyebrow">Plans</p>
      <h1>Calendar</h1>
      <p className="lede">
        Events from friends, and events friends are going to. Activity updates
        land in your feed.
      </p>

      {error && <p className="error">{error}</p>}

      <section className="stack-section">
        <div className="section-head">
          <h2>{monthLabel}</h2>
          <button
            type="button"
            className="primary"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? "Cancel" : "Create event"}
          </button>
        </div>
        <div className="month-grid" aria-hidden>
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const active = highlightDays.has(day);
            return (
              <span
                key={day}
                className={active ? "month-day month-day--hot" : "month-day"}
              >
                {day}
              </span>
            );
          })}
        </div>
      </section>

      {showCreate && (
        <section className="stack-section">
          <h2>New event</h2>
          <form className="stack-form" onSubmit={createEvent}>
            <label>
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                required
              />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={280}
                rows={3}
                required
              />
            </label>
            <label>
              Starts
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </label>
            <label>
              Ends (optional)
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
            <label>
              Image (optional)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              Publish
            </button>
          </form>
        </section>
      )}

      <section className="stack-section">
        <h2>Upcoming</h2>
        {events.length === 0 ? (
          <p className="muted">No upcoming events yet.</p>
        ) : (
          <ul className="plain-list">
            {events.map((ev) => (
              <li key={ev.id}>
                <Link className="event-link" to={`/events/${ev.id}`}>
                  <span className="event-link__title">{ev.title}</span>
                  <span className="event-link__meta">
                    {new Date(ev.startsAt).toLocaleString()} · {ev.hostDisplayName}
                    {ev.myRsvp ? ` · ${ev.myRsvp.replace("_", " ")}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack-section">
        <div className="section-head">
          <h2>Activity</h2>
          {activity.some((a) => !a.readAt) && (
            <button type="button" className="ghost" onClick={() => void markAllRead()}>
              Mark all read
            </button>
          )}
        </div>
        {activity.length === 0 ? (
          <p className="muted">No notifications yet.</p>
        ) : (
          <ul className="plain-list">
            {activity.map((n) => (
              <li key={n.id} className={n.readAt ? "muted" : undefined}>
                <Link to={`/events/${n.eventId}`}>
                  {n.actorDisplayName} · {n.type.replaceAll("_", " ")}
                </Link>
                <span className="member-meta">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
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
