import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  FriendRequest,
  FriendsMeResponse,
} from "@summerhacks/shared";
import { api } from "../../lib/api";

export function FriendsPage() {
  const [me, setMe] = useState<FriendsMeResponse | null>(null);
  const [inbox, setInbox] = useState<FriendRequest[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const [friendsRes, inboxRes] = await Promise.all([
      api<FriendsMeResponse>("/friends/me"),
      api<{ requests: FriendRequest[] }>("/friends/inbox"),
    ]);
    setMe(friendsRes);
    setInbox(inboxRes.requests);
  }, []);

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load friends"),
    );
  }, [load]);

  async function sendRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/friends/requests", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function respond(id: string, action: "accept" | "reject") {
    setError(null);
    setBusy(true);
    try {
      await api(`/friends/requests/${id}/${action}`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeFriend(userId: string) {
    setError(null);
    setBusy(true);
    try {
      await api(`/friends/${userId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unfriend failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!me?.friendCode) return;
    try {
      await navigator.clipboard.writeText(me.friendCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy code");
    }
  }

  return (
    <main className="page friends-page">
      <p className="eyebrow">Social</p>
      <h1>Friends</h1>
      <p className="lede">
        Share your code. Accept requests. Accepted friends auto-subscribe to
        your published events.
      </p>

      {error && <p className="error">{error}</p>}

      <section className="stack-section">
        <h2>Your friend code</h2>
        {me ? (
          <div className="friend-code-row">
            <code className="friend-code">{me.friendCode}</code>
            <button type="button" className="secondary" onClick={() => void copyCode()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </section>

      <section className="stack-section">
        <h2>Add a friend</h2>
        <form className="inline-form" onSubmit={sendRequest}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Paste their code"
            maxLength={16}
            autoComplete="off"
          />
          <button type="submit" className="primary" disabled={busy || !code.trim()}>
            Send request
          </button>
        </form>
      </section>

      <section className="stack-section">
        <h2>Inbox</h2>
        {inbox.length === 0 ? (
          <p className="muted">No pending requests.</p>
        ) : (
          <ul className="plain-list">
            {inbox.map((req) => (
              <li key={req.id} className="row-item">
                <span>{req.fromUser?.displayName ?? "Someone"}</span>
                <span className="row-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => void respond(req.id, "accept")}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => void respond(req.id, "reject")}
                  >
                    Reject
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack-section">
        <h2>Friends</h2>
        {!me ? (
          <p className="muted">Loading…</p>
        ) : me.friends.length === 0 ? (
          <p className="muted">No friends yet — share your code.</p>
        ) : (
          <ul className="plain-list">
            {me.friends.map((f) => (
              <li key={f.id} className="row-item">
                <span>{f.displayName}</span>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => void removeFriend(f.id)}
                >
                  Unfriend
                </button>
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
