import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Session } from "@summerhacks/shared";
import { OceanShaderCanvas } from "../../components/ambient/OceanShaderCanvas";
import { api } from "../../lib/api";

export function SessionView() {
  const { id } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api<{ session: Session }>(`/sessions/${id}`)
      .then((res) => setSession(res.session))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load"),
      );
  }, [id]);

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

  return (
    <main className="page session-page">
      <OceanShaderCanvas />
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
    </main>
  );
}
