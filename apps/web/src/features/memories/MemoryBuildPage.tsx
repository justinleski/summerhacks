import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  MEMORY_MAX_PHOTOS_PER_USER,
  MEMORY_NOTE_MAX,
  MEMORY_POLL_INTERVAL_MS,
  MEMORY_SONGS_PER_USER,
  isValidMemoryPhotoCount,
  type MemoryDraftResponse,
  type MemoryResponse,
  type MemorySong,
  type SpotifyStatusResponse,
} from "@summerhacks/shared";
import { api, uploadMemoryPhoto } from "../../lib/api";
import { formatCountdown, joinNames } from "./format";

const ONE_HOUR_MS = 60 * 60 * 1000;
const SONG_SLOTS = Array.from({ length: MEMORY_SONGS_PER_USER }, (_, i) => i);

export function MemoryBuildPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [memory, setMemory] = useState<MemoryDraftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [songDrafts, setSongDrafts] = useState<Record<number, string>>({});
  const [spotify, setSpotify] = useState<SpotifyStatusResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const noteDirtyRef = useRef(false);
  noteDirtyRef.current = noteDirty;

  const load = useCallback(async () => {
    if (!sessionId) return;
    const res = await api<{ memory: MemoryResponse }>(
      `/memories/session/${sessionId}`,
    );
    if (res.memory.status === "locked") {
      navigate(`/memories/${res.memory.id}`, { replace: true });
      return;
    }
    setMemory(res.memory);
    // Don't clobber what the user is mid-way through typing.
    if (!noteDirtyRef.current) setNote(res.memory.note ?? "");
  }, [sessionId, navigate]);

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load memory"),
    );
  }, [load]);

  // Poll so a peer's submit (and the resulting lock) shows up without a refresh.
  useEffect(() => {
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, MEMORY_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    api<SpotifyStatusResponse>("/spotify/status")
      .then(setSpotify)
      .catch(() => setSpotify({ connected: false, spotifyUserId: null }));
  }, []);

  async function withBusy(fn: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files || !memory) return;
    const picked = Array.from(files).slice(
      0,
      MEMORY_MAX_PHOTOS_PER_USER - memory.myPhotos.length,
    );
    if (picked.length === 0) return;
    await withBusy(async () => {
      for (const file of picked) {
        await uploadMemoryPhoto(memory.id, file);
      }
      await load();
    }, "Photo upload failed");
  }

  async function removePhoto(photoId: string) {
    if (!memory) return;
    await withBusy(async () => {
      await api(`/memories/${memory.id}/photos/${photoId}`, {
        method: "DELETE",
      });
      await load();
    }, "Could not remove photo");
  }

  async function saveSong(position: number) {
    const spotifyUrl = (songDrafts[position] ?? "").trim();
    if (!memory || !spotifyUrl) return;
    await withBusy(async () => {
      const res = await api<{ song: MemorySong }>(
        `/memories/${memory.id}/songs/${position}`,
        { method: "PUT", body: JSON.stringify({ spotifyUrl }) },
      );
      setSongDrafts((prev) => ({ ...prev, [position]: "" }));
      // Optimistic: drop the resolved song in before the next poll lands.
      setMemory((prev) =>
        prev
          ? {
              ...prev,
              mySongs: [
                ...prev.mySongs.filter((s) => s.position !== position),
                res.song,
              ].sort((a, b) => a.position - b.position),
            }
          : prev,
      );
      await load();
    }, "Could not add that track");
  }

  async function removeSong(position: number) {
    if (!memory) return;
    await withBusy(async () => {
      await api(`/memories/${memory.id}/songs/${position}`, {
        method: "DELETE",
      });
      await load();
    }, "Could not remove song");
  }

  async function saveNote() {
    if (!memory || !noteDirty) return;
    await withBusy(async () => {
      await api(`/memories/${memory.id}/note`, {
        method: "PATCH",
        body: JSON.stringify({ note: note.trim() || null }),
      });
      setNoteDirty(false);
      await load();
    }, "Could not save the note");
  }

  async function submit() {
    if (!memory) return;
    setConfirming(false);
    await withBusy(async () => {
      const res = await api<{ memory: MemoryResponse }>(
        `/memories/${memory.id}/submit`,
        { method: "POST", body: JSON.stringify({ confirm: true }) },
      );
      if (res.memory.status === "locked") {
        navigate(`/memories/${res.memory.id}`, { replace: true });
        return;
      }
      setMemory(res.memory);
    }, "Submit failed");
  }

  async function connectSpotify() {
    await withBusy(async () => {
      const res = await api<{ authUrl: string }>("/spotify/connect");
      window.location.href = res.authUrl;
    }, "Could not start Spotify sign-in");
  }

  if (error && !memory) {
    return (
      <main className="page">
        <p className="error">{error}</p>
        <Link className="text-link" to="/">
          ← Home
        </Link>
      </main>
    );
  }

  if (!memory) {
    return (
      <main className="page">
        <p>Loading memory…</p>
      </main>
    );
  }

  const msLeft = new Date(memory.windowExpiresAt).getTime() - now;
  const urgent = msLeft < ONE_HOUR_MS;
  const photoCount = memory.myPhotos.length;
  const photosValid = isValidMemoryPhotoCount(photoCount);
  const songsValid = memory.mySongs.length === MEMORY_SONGS_PER_USER;
  const canSubmit = photosValid && songsValid && !busy;
  const others = memory.members.filter((m) => !m.isViewer);

  if (memory.mySubmitted) {
    return (
      <main className="page memory-build-page">
        <p className="eyebrow">Memory</p>
        <h1>Locked in</h1>
        <p className="lede">
          Waiting for {joinNames(others.map((m) => m.displayName))}
        </p>
        <p className={urgent ? "memory-countdown error" : "memory-countdown"}>
          {formatCountdown(msLeft)} left
        </p>

        <section className="stack-section">
          <ul className="plain-list">
            {memory.members.map((m) => (
              <li key={m.userId} className="row-item">
                <span>
                  {m.displayName}
                  {m.isViewer ? " (you)" : ""}
                </span>
                <span className="member-meta">
                  {m.submitted ? "submitted" : "still writing"}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted">
            Everyone's photos and songs stay hidden until the last person
            submits.
          </p>
        </section>

        {error && <p className="error">{error}</p>}
        <Link className="text-link" to={`/session/${memory.sessionId}`}>
          ← Back to session
        </Link>
      </main>
    );
  }

  return (
    <main className="page memory-build-page">
      <p className="eyebrow">Memory</p>
      <h1>Build the memory</h1>
      <p className={urgent ? "memory-countdown error" : "memory-countdown"}>
        {formatCountdown(msLeft)} until this closes
      </p>
      <p className="lede">
        3 songs and photos in pairs from everyone. Nobody sees anyone else's
        picks until the last person submits.
      </p>

      {error && <p className="error">{error}</p>}

      <section className="stack-section">
        <h2>Who's in</h2>
        <ul className="memory-members">
          {memory.members.map((m) => (
            <li key={m.userId}>
              {m.avatarUrl ? (
                <img className="memory-avatar" src={m.avatarUrl} alt="" />
              ) : (
                <span className="memory-avatar memory-avatar--empty" aria-hidden>
                  {m.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="memory-member-name">
                {m.displayName}
                {m.isViewer ? " (you)" : ""}
              </span>
              <span
                className={
                  m.submitted
                    ? "memory-dot memory-dot--done"
                    : "memory-dot memory-dot--pending"
                }
                aria-hidden
              />
              <span className="member-meta">
                {m.submitted
                  ? "submitted"
                  : m.isViewer
                    ? "still editing"
                    : "still writing"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stack-section">
        <div className="section-head">
          <h2>Photos</h2>
          <span className={photosValid ? "member-meta" : "error"}>
            {photoCount}/{MEMORY_MAX_PHOTOS_PER_USER}
            {photosValid ? " · ready" : " · need an even number"}
          </span>
        </div>
        <p className="muted">Add photos in pairs (2, 4, 6, or 8).</p>
        <div className="photo-grid">
          {memory.myPhotos.map((photo) => (
            <div className="photo-grid__item" key={photo.id}>
              <img src={photo.photoUrl} alt="" loading="lazy" />
              <button
                type="button"
                className="photo-grid__remove"
                aria-label="Remove photo"
                disabled={busy}
                onClick={() => void removePhoto(photo.id)}
              >
                ×
              </button>
            </div>
          ))}
          {photoCount < MEMORY_MAX_PHOTOS_PER_USER && (
            <label className="photo-grid__add">
              <span aria-hidden>+</span>
              <span className="member-meta">Add</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={busy}
                onChange={(e) => {
                  void addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </section>

      <section className="stack-section">
        <div className="section-head">
          <h2>Songs</h2>
          <span className={songsValid ? "member-meta" : "error"}>
            {memory.mySongs.length}/{MEMORY_SONGS_PER_USER}
          </span>
        </div>
        <div className="song-slots">
          {SONG_SLOTS.map((position) => {
            const song = memory.mySongs.find((s) => s.position === position);
            if (song) {
              return (
                <div className="song-slot song-slot--filled" key={position}>
                  {song.albumArtUrl ? (
                    <img
                      className="song-slot__art"
                      src={song.albumArtUrl}
                      alt=""
                    />
                  ) : (
                    <span
                      className="song-slot__art song-slot__art--empty"
                      aria-hidden
                    />
                  )}
                  <span className="song-slot__meta">
                    <strong>{song.trackTitle}</strong>
                    <span className="member-meta">{song.artistName}</span>
                  </span>
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => void removeSong(position)}
                  >
                    Remove
                  </button>
                </div>
              );
            }
            return (
              <div className="song-slot" key={position}>
                <span className="song-slot__index" aria-hidden>
                  {position + 1}
                </span>
                <input
                  value={songDrafts[position] ?? ""}
                  placeholder="Paste Spotify track link"
                  inputMode="url"
                  autoComplete="off"
                  disabled={busy}
                  onChange={(e) =>
                    setSongDrafts((prev) => ({
                      ...prev,
                      [position]: e.target.value,
                    }))
                  }
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    if (!pasted.trim()) return;
                    e.preventDefault();
                    setSongDrafts((prev) => ({
                      ...prev,
                      [position]: pasted.trim(),
                    }));
                  }}
                />
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !(songDrafts[position] ?? "").trim()}
                  onClick={() => void saveSong(position)}
                >
                  Add
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="stack-section">
        <div className="section-head">
          <h2>Shared note</h2>
          <span className="member-meta">
            {note.length}/{MEMORY_NOTE_MAX}
          </span>
        </div>
        <p className="muted">Anyone in this memory can edit it until it locks.</p>
        <textarea
          value={note}
          maxLength={MEMORY_NOTE_MAX}
          rows={2}
          placeholder="One line about this hangout"
          onChange={(e) => {
            setNote(e.target.value);
            setNoteDirty(true);
          }}
          onBlur={() => void saveNote()}
        />
      </section>

      <section className="stack-section">
        {spotify?.connected ? (
          <p className="muted">Spotify connected — your playlist saves on lock.</p>
        ) : (
          <div className="spotify-banner">
            <p>Want the playlist saved to your Spotify?</p>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void connectSpotify()}
            >
              Connect now
            </button>
          </div>
        )}
      </section>

      <div className="submit-bar">
        <span className="member-meta">
          {songsValid && photosValid
            ? "Ready to lock in"
            : `Need ${MEMORY_SONGS_PER_USER} songs and an even photo count`}
        </span>
        <button
          type="button"
          className="primary"
          disabled={!canSubmit}
          onClick={() => setConfirming(true)}
        >
          Submit
        </button>
      </div>

      {confirming && (
        <div className="memory-modal" role="dialog" aria-modal="true">
          <div className="memory-modal__card">
            <h2>Lock your submission?</h2>
            <p className="muted">
              This locks your submission. You can't edit after.
            </p>
            <div className="row-actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void submit()}
              >
                Yes, submit
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setConfirming(false)}
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      <Link className="text-link" to={`/session/${memory.sessionId}`}>
        ← Back to session
      </Link>
    </main>
  );
}
