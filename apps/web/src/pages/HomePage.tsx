import {
  lazy,
  Suspense,
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import type { BootstrapResponse, Session } from "@summerhacks/shared";
import { OceanShaderCanvas } from "../components/ambient/OceanShaderCanvas";
import { Toast } from "../components/Toast";
import {
  EmailAuthPanel,
  type EmailAuthResult,
} from "../features/auth/EmailAuthPanel";
import { RecentSessions } from "../features/session/RecentSessions";
import {
  api,
  clearAuth,
  getAuthMode,
  getDeviceId,
  getDisplayName,
  getNeedsName,
  getToken,
  setAuth,
  setNeedsName,
} from "../lib/api";
import {
  clientCacheKeys,
  getCached,
  invalidate,
  OPEN_TTL,
  setCached,
} from "../lib/queryCache";
import {
  authClient,
  completeGoogleOAuthExchange,
  getNeonSession,
  neonAuthEnabled,
  neonSignInGoogle,
} from "../lib/neonAuth";

const BumpMode = lazy(() =>
  import("../features/bump/BumpMode").then((m) => ({ default: m.BumpMode })),
);

type Phase = "auth" | "email" | "name" | "app";

function initialPhase(): Phase {
  const token = getToken();
  const mode = getAuthMode();
  if (token && mode === "guest") {
    return getNeedsName() ? "name" : "app";
  }
  if (token && getNeedsName()) return "name";
  return "auth";
}

export function HomePage() {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [name, setName] = useState(getDisplayName() || "");
  const [nameDraft, setNameDraft] = useState("");
  const [sessions, setSessions] = useState<Session[]>(
    () => getCached<Session[]>(clientCacheKeys.sessions()) ?? [],
  );
  const [bumpOpen, setBumpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [booting, setBooting] = useState(
    neonAuthEnabled && phase === "auth",
  );
  const clearToast = useCallback(() => setToast(null), []);

  async function loadSessions() {
    const cached = getCached<Session[]>(clientCacheKeys.sessions());
    if (cached) setSessions(cached);
    const res = await api<{ sessions: Session[] }>("/sessions");
    setSessions(res.sessions);
    setCached(clientCacheKeys.sessions(), res.sessions, OPEN_TTL);
  }

  const enterFromNeonSession = useCallback(async (opts: { needsName: boolean }) => {
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
    setNeedsName(opts.needsName);
    await api("/users/sync", { method: "POST" });
    if (opts.needsName) {
      setNameDraft("");
      setPhase("name");
    } else {
      setPhase("app");
      setToast(`Welcome, ${display}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      // Already in guest/app or mid name-onboarding — don't wipe with hydrate.
      if (phase === "app" || phase === "name") {
        setBooting(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const authError = params.get("authError");
      const googleExchange = params.get("googleExchange");
      if (authError || googleExchange) {
        params.delete("authError");
        params.delete("googleExchange");
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
        window.history.replaceState({}, "", next);
      }
      if (authError) {
        setError(
          authError === "google_oauth_failed"
            ? "Google sign-in failed. Try again."
            : decodeURIComponent(authError),
        );
        setBooting(false);
        return;
      }

      if (googleExchange) {
        setAuthBusy(true);
        try {
          const { token, displayName } =
            await completeGoogleOAuthExchange(googleExchange);
          if (cancelled) return;
          setAuth(token, displayName, "guest");
          setName(displayName);
          setNeedsName(false);
          setPhase("app");
          setToast(`Welcome, ${displayName}`);
        } catch (err) {
          if (!cancelled) {
            setError(
              err instanceof Error ? err.message : "Google sign-in failed",
            );
          }
        } finally {
          if (!cancelled) {
            setAuthBusy(false);
            setBooting(false);
          }
        }
        return;
      }

      if (!neonAuthEnabled || !authClient) {
        setBooting(false);
        return;
      }
      try {
        const session = await getNeonSession();
        if (cancelled || !session) return;
        const needsName = getNeedsName();
        const display =
          session.user.name?.trim() ||
          session.user.email?.split("@")[0] ||
          "User";
        setAuth(session.jwt, display, "neon");
        setName(display);
        await api("/users/sync", { method: "POST" });
        if (!cancelled) {
          if (needsName) {
            setNameDraft("");
            setPhase("name");
          } else {
            setPhase("app");
            setToast(`Welcome, ${display}`);
          }
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
    void hydrate();
    return () => {
      cancelled = true;
    };
    // Run once on mount for OAuth return / session restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount hydrate
  }, []);

  useEffect(() => {
    if (phase !== "app") return;
    loadSessions().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load sessions"),
    );
  }, [phase]);

  async function continueAsGuest() {
    setError(null);
    setAuthBusy(true);
    try {
      const res = await api<BootstrapResponse>("/users/bootstrap", {
        method: "POST",
        body: JSON.stringify({
          displayName: "Guest",
          deviceId: getDeviceId(),
        }),
      });
      setAuth(res.token, res.user.displayName, "guest");
      setName(res.user.displayName);
      setNeedsName(true);
      setNameDraft("");
      setPhase("name");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bootstrap failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function saveDisplayName(e: FormEvent) {
    e.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setError("Enter a display name");
      return;
    }
    setError(null);
    setAuthBusy(true);
    try {
      const updated = await api<{ displayName: string }>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: trimmed }),
      });
      const token = getToken();
      const mode = getAuthMode() ?? "guest";
      if (token) setAuth(token, updated.displayName, mode);
      setName(updated.displayName);
      setNeedsName(false);
      setPhase("app");
      setToast(`Welcome, ${updated.displayName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save name");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signInGoogle() {
    setAuthBusy(true);
    setError(null);
    try {
      await neonSignInGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setAuthBusy(false);
    }
  }

  async function onEmailAuthenticated(result: EmailAuthResult) {
    await enterFromNeonSession({ needsName: result.needsName });
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
    invalidate(clientCacheKeys.sessions());
    setSessions([]);
    setName("");
    setNameDraft("");
    setPhase("auth");
  }

  if (bumpOpen) {
    return (
      <Suspense fallback={<div className="route-loading">Loading…</div>}>
        <BumpMode
          onClose={() => {
            setBumpOpen(false);
            loadSessions().catch(() => undefined);
          }}
        />
      </Suspense>
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

  if (phase === "email") {
    return (
      <main className="page home-hero">
        <p className="brand">Summerhacks</p>
        <h1>Sign in with email</h1>
        <p className="lede">Use your email and password to continue.</p>
        <EmailAuthPanel
          busy={authBusy}
          setBusy={setAuthBusy}
          onError={setError}
          onAuthenticated={onEmailAuthenticated}
        />
        <button
          type="button"
          className="ghost linkish"
          disabled={authBusy}
          onClick={() => {
            setError(null);
            setPhase("auth");
          }}
        >
          Back
        </button>
        {error && <p className="error">{error}</p>}
        <Toast message={toast} onDone={clearToast} />
      </main>
    );
  }

  if (phase === "name") {
    return (
      <main className="page home-hero">
        <p className="brand">Summerhacks</p>
        <h1>Add your name</h1>
        <p className="lede">This is how friends will see you.</p>
        <form className="bootstrap-form" onSubmit={(e) => void saveDisplayName(e)}>
          <label>
            Display name
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Alex"
              autoComplete="nickname"
              required
              maxLength={64}
              autoFocus
            />
          </label>
          <button type="submit" className="primary" disabled={authBusy}>
            Continue
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <Toast message={toast} onDone={clearToast} />
      </main>
    );
  }

  if (phase !== "app") {
    return (
      <main className="page home-hero">
        <OceanShaderCanvas />
        <p className="brand">Summerhacks</p>
        <h1>Bump to connect</h1>
        <p className="lede">
          Shake together to open a shared session — no GPS prompt, reopen anytime.
        </p>

        <div className="oauth-stack">
          {neonAuthEnabled && (
            <>
              <button
                type="button"
                className="primary oauth"
                disabled={authBusy}
                onClick={() => void signInGoogle()}
              >
                Continue with Google
              </button>
              <button
                type="button"
                className="secondary oauth"
                disabled={authBusy}
                onClick={() => {
                  setError(null);
                  setPhase("email");
                }}
              >
                Continue with email
              </button>
              <div className="divider">
                <span>or</span>
              </div>
            </>
          )}
          <button
            type="button"
            className={neonAuthEnabled ? "secondary oauth" : "primary oauth"}
            disabled={authBusy}
            onClick={() => void continueAsGuest()}
          >
            Continue as guest
          </button>
        </div>
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

      {error && <p className="error">{error}</p>}
      <RecentSessions sessions={sessions} />
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}
