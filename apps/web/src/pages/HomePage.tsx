import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { BootstrapResponse, Session } from "@summerhacks/shared";
import { Toast } from "../components/Toast";
import { EmailAuthPanel } from "../features/auth/EmailAuthPanel";
import { BumpMode } from "../features/bump/BumpMode";
import { RecentSessions } from "../features/session/RecentSessions";
import {
  api,
  clearAuth,
  getAuthMode,
  getDeviceId,
  getDisplayName,
  getToken,
  setAuth,
} from "../lib/api";
import {
  authClient,
  getNeonSession,
  neonAuthEnabled,
} from "../lib/neonAuth";

export function HomePage() {
  const existingToken = getToken();
  const existingMode = getAuthMode();
  // Guest tokens are UUIDs; Neon JWTs are three-segment. Don't treat a stale
  // opaque/missing JWT as signed-in before hydrate runs.
  const [ready, setReady] = useState(
    Boolean(existingToken) && existingMode === "guest",
  );
  const [name, setName] = useState(getDisplayName() || "");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [bumpOpen, setBumpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [booting, setBooting] = useState(neonAuthEnabled);
  const clearToast = useCallback(() => setToast(null), []);

  async function loadSessions() {
    const res = await api<{ sessions: Session[] }>("/sessions");
    setSessions(res.sessions);
  }

  const enterFromNeonSession = useCallback(async () => {
    const session = await getNeonSession();
    if (!session) {
      throw new Error("Signed in, but no session JWT yet — try again");
    }
    const display =
      session.user.name?.trim() ||
      session.user.email?.split("@")[0] ||
      "User";
    setAuth(session.jwt, display, "neon");
    setName(display);
    await api("/users/sync", { method: "POST" });
    setReady(true);
    setToast(`Welcome, ${display}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrateNeon() {
      if (!neonAuthEnabled || !authClient) {
        setBooting(false);
        return;
      }
      try {
        const session = await getNeonSession();
        if (cancelled || !session) return;
        const display =
          session.user.name?.trim() ||
          session.user.email?.split("@")[0] ||
          "User";
        setAuth(session.jwt, display, "neon");
        setName(display);
        await api("/users/sync", { method: "POST" });
        if (!cancelled) {
          setReady(true);
          setToast(`Welcome, ${display}`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Sign-in restore failed",
          );
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
      setToast(`Welcome, ${res.user.displayName}`);
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
              GitHub needs OAuth credentials in the Neon Console. Email codes are
              sent by Neon Auth (~15 min expiry).
            </p>
            <div className="divider">
              <span>or email</span>
            </div>
            <EmailAuthPanel
              busy={authBusy}
              setBusy={setAuthBusy}
              onError={setError}
              onAuthenticated={enterFromNeonSession}
            />
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
          <button type="submit" className="primary" disabled={authBusy}>
            Continue as guest
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <Toast message={toast} onDone={clearToast} />
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
        <Link to="/profile">Profile</Link>
      </nav>

      {error && <p className="error">{error}</p>}
      <RecentSessions sessions={sessions} />
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}
