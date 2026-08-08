import { type FormEvent, useEffect, useState } from "react";
import type { BootstrapResponse, Session } from "@summerhacks/shared";
import { BumpMode } from "../features/bump/BumpMode";
import { RecentSessions } from "../features/session/RecentSessions";
import {
  api,
  getDeviceId,
  getDisplayName,
  getToken,
  setAuth,
} from "../lib/api";

export function HomePage() {
  const [ready, setReady] = useState(Boolean(getToken()));
  const [name, setName] = useState(getDisplayName() || "");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [bumpOpen, setBumpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSessions() {
    const res = await api<{ sessions: Session[] }>("/sessions");
    setSessions(res.sessions);
  }

  useEffect(() => {
    if (!ready) return;
    loadSessions().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load sessions"),
    );
  }, [ready]);

  async function bootstrap(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<BootstrapResponse>("/users/bootstrap", {
        method: "POST",
        body: JSON.stringify({
          displayName: name.trim() || "Guest",
          deviceId: getDeviceId(),
        }),
      });
      setAuth(res.token, res.user.displayName);
      setName(res.user.displayName);
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bootstrap failed");
    }
  }

  if (bumpOpen) {
    return (
      <BumpMode
        onClose={() => {
          setBumpOpen(false);
          loadSessions().catch(() => undefined);
        }}
      />
    );
  }

  if (!ready) {
    return (
      <main className="page home-hero">
        <p className="brand">Summerhacks</p>
        <h1>Bump to connect</h1>
        <p className="lede">
          Shake together to open a shared session — no GPS prompt, reopen anytime.
        </p>
        <form className="bootstrap-form" onSubmit={bootstrap}>
          <label>
            Display name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex"
              autoComplete="nickname"
            />
          </label>
          <button type="submit" className="primary">
            Continue
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  return (
    <main className="page home">
      <header className="home-header">
        <div>
          <p className="brand">Summerhacks</p>
          <h1>Hey, {name}</h1>
        </div>
        <button type="button" className="primary" onClick={() => setBumpOpen(true)}>
          Bump
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      <RecentSessions sessions={sessions} />
    </main>
  );
}
