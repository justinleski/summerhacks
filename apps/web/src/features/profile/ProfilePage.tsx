import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  PROFILE_BIO_MAX,
  type MeProfile,
} from "@summerhacks/shared";
import {
  api,
  clearAuth,
  getAuthMode,
  getToken,
  setAuth,
  uploadAvatar,
} from "../../lib/api";
import {
  authClient,
  neonAuthEnabled,
} from "../../lib/neonAuth";
import {
  getTheme,
  setTheme,
  type ThemeMode,
} from "../../lib/theme";
import { PixelAvatarEditor } from "./PixelAvatarEditor";

export function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pixelOpen, setPixelOpen] = useState(false);

  const load = useCallback(async () => {
    const me = await api<MeProfile>("/users/me");
    setProfile(me);
    setDisplayName(me.displayName);
    setBio(me.bio ?? "");
  }, []);

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load profile"),
    );
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api<MeProfile>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim() || null,
        }),
      });
      setProfile(updated);
      setAuth(getToken() ?? updated.id, updated.displayName, getAuthMode() ?? "guest");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyAvatar(file: File) {
    setBusy(true);
    setError(null);
    try {
      const url = await uploadAvatar(file);
      const updated = await api<MeProfile>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ avatarUrl: url }),
      });
      setProfile(updated);
      setSaved(true);
      setPixelOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Avatar upload failed");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function copyFriendCode() {
    if (!profile?.friendCode) return;
    try {
      await navigator.clipboard.writeText(profile.friendCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy code");
    }
  }

  function toggleTheme() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  async function logout() {
    setError(null);
    try {
      if (neonAuthEnabled && authClient) {
        await authClient.signOut();
      }
    } catch {
      // ignore
    }
    clearAuth();
    navigate("/");
  }

  return (
    <main className="page profile-page">
      <p className="eyebrow">You</p>
      <h1>Profile</h1>
      <p className="lede">Avatar, bio, theme, and sign out.</p>

      {error && <p className="error">{error}</p>}
      {saved && <p className="muted">Saved.</p>}

      <section className="stack-section profile-avatar-block">
        {profile?.avatarUrl ? (
          <img className="avatar-lg" src={profile.avatarUrl} alt="" />
        ) : (
          <div className="avatar-lg avatar-lg--empty" aria-hidden>
            {(displayName || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="profile-avatar-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setPixelOpen(true)}
          >
            {profile?.avatarUrl ? "Edit pixel avatar" : "Draw avatar"}
          </button>
        </div>
      </section>

      <form className="stack-form" onSubmit={save}>
        <label>
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={64}
            required
          />
        </label>
        <label>
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={PROFILE_BIO_MAX}
            rows={4}
            placeholder="A short line about you"
          />
          <span className="member-meta">
            {bio.length}/{PROFILE_BIO_MAX}
          </span>
        </label>
        {profile?.friendCode && (
          <div className="friend-code-row">
            <span className="muted">Friend code</span>
            <code className="friend-code">{profile.friendCode}</code>
            <button
              type="button"
              className="secondary"
              onClick={() => void copyFriendCode()}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}
        <button type="submit" className="primary" disabled={busy}>
          Save profile
        </button>
      </form>

      <section className="stack-section">
        <h2>Appearance</h2>
        <button type="button" className="secondary" onClick={toggleTheme}>
          {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        </button>
      </section>

      <section className="stack-section">
        <h2>Session</h2>
        <button type="button" className="ghost" onClick={() => void logout()}>
          Log out
        </button>
      </section>

      <Link className="text-link" to="/">
        ← Home
      </Link>

      <PixelAvatarEditor
        open={pixelOpen}
        busy={busy}
        onCancel={() => setPixelOpen(false)}
        onSave={applyAvatar}
      />
    </main>
  );
}
