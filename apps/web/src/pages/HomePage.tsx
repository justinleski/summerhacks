import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { BootstrapResponse, Session } from "@summerhacks/shared";
import { BumpMode } from "../features/bump/BumpMode";
import { RecentSessions } from "../features/session/RecentSessions";
import {
  api,
  clearAuth,
  getDeviceId,
  getDisplayName,
  getToken,
  setAuth,
} from "../lib/api";
import {
  authClient,
  getNeonAccessToken,
  getNeonSessionUser,
  neonAuthEnabled,
} from "../lib/neonAuth";

export function HomePage() {
  const [ready, setReady] = useState(Boolean(getToken()));
  const [name, setName] = useState(getDisplayName() || "");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [bumpOpen, setBumpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [booting, setBooting] = useState(neonAuthEnabled);

  async function loadSessions() {
    const res = await api<{ sessions: Session[] }>("/sessions");
    setSessions(res.sessions);
  }

  useEffect(() => {
    let cancelled = false;
    async function hydrateNeon() {
      if (!neonAuthEnabled || !authClient) {
        setBooting(false);
        return;
      }
      try {
        const user = await getNeonSessionUser();
        if (cancelled) return;
        if (user) {
          const jwt = await getNeonAccessToken();
          if (!jwt) {
            setBooting(false);
            return;
          }
          const display =
            user.name?.trim() ||
            user.email?.split("@")[0] ||
            "User";
          setAuth(jwt, display, "neon");
          setName(display);
          await api("/users/sync", { method: "POST" });
          if (!cancelled) setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn(err);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void hydrateNeon();
    return () => {
      cancelled = true;
    };
  }, []);

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
      setAuth(res.token, res.user.displayName, "guest");
      setName(res.user.displayName);
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bootstrap failed");
    }
  }

  async function signInSocial(provider: "google" | "github") {
    if (!authClient) return;
    setAuthBusy(true);
    setError(null);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: window.location.origin,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `${provider} sign-in failed`,
      );
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setError(null);
    try {
      if (neonAuthEnabled && authClient) {
        await authClient.signOut();
      }
    } catch {
      // ignore
    }
    clearAuth();
    setReady(false);
    setSessions([]);
    setName("");
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

  if (booting) {
    return (
      <main className="page home-hero">
        <p className="brand">Summerhacks</p>
        <p className="lede">Checking sign-in…</p>
      </main>
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

        {neonAuthEnabled && (
          <div className="oauth-stack">
            <button
              type="button"
              className="primary oauth"
              disabled={authBusy}
              onClick={() => void signInSocial("google")}
            >
              Continue with Google
            </button>
            <button
              type="button"
              className="secondary oauth"
              disabled={authBusy}
              onClick={() => void signInSocial("github")}
            >
              Continue with GitHub
            </button>
            <p className="muted oauth-note">
              GitHub needs OAuth credentials in the Neon Console (Google works
              with shared credentials for testing).
            </p>
            <div className="divider">
              <span>or guest</span>
            </div>
          </div>
        )}

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
            Continue as guest
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <Link className="text-link" to="/explore">
          Or view public activity, no login needed →
        </Link>
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
        <div className="home-actions">
          <button type="button" className="primary" onClick={() => setBumpOpen(true)}>
            Bump
          </button>
          <button type="button" className="ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="home-nav" aria-label="Primary">
        <Link to="/friends">Friends</Link>
        <Link to="/calendar">Calendar</Link>
        <Link to="/map">Map</Link>
        <Link to="/explore">Explore</Link>
        <Link to="/profile">Profile</Link>
      </nav>

      {error && <p className="error">{error}</p>}
      <RecentSessions sessions={sessions} />
    </main>
  );
}
