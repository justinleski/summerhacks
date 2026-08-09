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
} from "@summerhacks/shared";
import { api, uploadMemoryPhoto } from "../../lib/api";
import {
  clientCacheKeys,
  invalidateOpenAlbum,
  LOCKED_TTL,
  OPEN_TTL,
  setCached,
} from "../../lib/queryCache";
import { AlbumWindowBar } from "../album/AlbumWindowBar";
import { formatCountdown, joinNames } from "./format";
import {
  memberContributionStatus,
  shouldAutoSubmitMemory,
} from "./memberStatus";

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
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const noteDirtyRef = useRef(false);
  noteDirtyRef.current = noteDirty;
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const res = await api<{ memory: MemoryResponse }>(
      `/memories/session/${sessionId}`,
    );
    if (res.memory.status === "locked") {
      setCached(
        clientCacheKeys.memoryById(res.memory.id),
        res.memory,
        LOCKED_TTL,
        { persistLocked: true },
      );
      navigate(`/memories/${res.memory.id}`, { replace: true });
      return;
    }
    setMemory(res.memory);
    setCached(
      clientCacheKeys.memoryBySession(sessionId),
      res.memory,
      OPEN_TTL,
    );
    if (!noteDirtyRef.current) setNote(res.memory.note ?? "");
    return res.memory;
  }, [sessionId, navigate]);

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load album"),
    );
  }, [load]);

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
      invalidateOpenAlbum(memory.sessionId, memory.id);
      const draft = await load();
      if (draft) await maybeAutoSubmit(draft);
    }, "Photo upload failed");
  }

  async function removePhoto(photoId: string) {
    if (!memory) return;
    await withBusy(async () => {
      await api(`/memories/${memory.id}/photos/${photoId}`, {
        method: "DELETE",
      });
      invalidateOpenAlbum(memory.sessionId, memory.id);
      await load();
    }, "Could not remove photo");
  }

  async function saveSong(position: number, urlOverride?: string) {
    const spotifyUrl = (urlOverride ?? songDrafts[position] ?? "").trim();
    if (!memory || !spotifyUrl) return;
    await withBusy(async () => {
      const res = await api<{ song: MemorySong }>(
        `/memories/${memory.id}/songs/${position}`,
        { method: "PUT", body: JSON.stringify({ spotifyUrl }) },
      );
      setSongDrafts((prev) => ({ ...prev, [position]: "" }));
      let nextDraft: MemoryDraftResponse | null = null;
      setMemory((prev) => {
        if (!prev) return prev;
        nextDraft = {
          ...prev,
          mySongs: [
            ...prev.mySongs.filter((s) => s.position !== position),
            res.song,
          ].sort((a, b) => a.position - b.position),
          songs: [
            ...prev.songs.filter(
              (s) =>
                !(s.userId === res.song.userId && s.position === position),
            ),
            res.song,
          ],
        };
        return nextDraft;
      });
      invalidateOpenAlbum(memory.sessionId, memory.id);
      if (nextDraft) await maybeAutoSubmit(nextDraft);
    }, "Could not add that track");
  }

  async function removeSong(position: number) {
    if (!memory) return;
    await withBusy(async () => {
      await api(`/memories/${memory.id}/songs/${position}`, {
        method: "DELETE",
      });
      invalidateOpenAlbum(memory.sessionId, memory.id);
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
      invalidateOpenAlbum(memory.sessionId, memory.id);
      await load();
    }, "Could not save the note");
  }

  async function markDone(opts?: { silent?: boolean }) {
    if (!memory) return;
    if (!opts?.silent) setConfirming(false);
    const run = async () => {
      const res = await api<{ memory: MemoryResponse }>(
        `/memories/${memory.id}/submit`,
        { method: "POST", body: JSON.stringify({ confirm: true }) },
      );
      invalidateOpenAlbum(memory.sessionId, memory.id);
      if (res.memory.status === "locked") {
        setCached(
          clientCacheKeys.memoryById(res.memory.id),
          res.memory,
          LOCKED_TTL,
          { persistLocked: true },
        );
        navigate(`/memories/${res.memory.id}`, { replace: true });
        return;
      }
      if (res.memory.status === "open") setMemory(res.memory);
    };
    if (opts?.silent) {
      try {
        await run();
      } catch {
        // Soft signal — ignore transient failures; poll will catch up.
      }
      return;
    }
    await withBusy(run, "Could not mark done");
  }

  async function maybeAutoSubmit(draft: MemoryDraftResponse) {
    if (
      !shouldAutoSubmitMemory({
        mySubmitted: draft.mySubmitted,
        photoCount: draft.myPhotos.length,
        songCount: draft.mySongs.length,
      })
    ) {
      return;
    }
    // Optimistic: peer UIs pick this up on the next poll.
    setMemory((prev) =>
      prev
        ? {
            ...prev,
            mySubmitted: true,
            members: prev.members.map((m) =>
              m.isViewer ? { ...m, submitted: true } : m,
            ),
          }
        : prev,
    );
    await markDone({ silent: true });
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
        <p>Loading album…</p>
      </main>
    );
  }

  const msLeft = new Date(memory.windowExpiresAt).getTime() - now;
  const urgent = msLeft < ONE_HOUR_MS;
  const photoCount = memory.myPhotos.length;
  const photosValid = isValidMemoryPhotoCount(photoCount);
  const songsValid = memory.mySongs.length <= MEMORY_SONGS_PER_USER;
  const canMarkDone = photosValid && songsValid && !busy;
  const peerPhotos = memory.photos.filter(
    (p) => !memory.myPhotos.some((m) => m.id === p.id),
  );
  const peerSongs = memory.songs.filter(
    (s) => !memory.mySongs.some((m) => m.id === s.id),
  );
  const nameByUser = new Map(
    memory.members.map((m) => [m.userId, m.displayName] as const),
  );
  const canAddPhotos = photoCount < MEMORY_MAX_PHOTOS_PER_USER;

  return (
    <main className="page memory-build-page">
      <p className="eyebrow">Album interior</p>
      <h1>Photos & songs</h1>
      <AlbumWindowBar
        expiresAt={memory.windowExpiresAt}
        startsAt={memory.windowStartsAt}
        now={now}
      />
      <p className={urgent ? "memory-countdown error" : "memory-countdown"}>
        {formatCountdown(msLeft)} left to edit
      </p>
      <p className="lede">
        Both of you can add and change songs and photos for 24 hours after the
        bump. Everything locks when the window ends — the receipt uses this
        content with your pixel cover.
      </p>

      {error && <p className="error">{error}</p>}

      <section className="stack-section">
        <h2>Who&apos;s in</h2>
        <ul className="memory-members">
          {memory.members.map((m) => {
            const status = memberContributionStatus(
              m,
              memory.photos,
              memory.songs,
            );
            return (
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
                  status.ready
                    ? "memory-dot memory-dot--done"
                    : "memory-dot memory-dot--pending"
                }
                aria-hidden
              />
              <span className="member-meta">{status.label}</span>
            </li>
            );
          })}
        </ul>
      </section>

      <section className="stack-section">
        <div className="section-head">
          <h2>Your photos</h2>
          <span className="member-meta">
            {photoCount}/{MEMORY_MAX_PHOTOS_PER_USER} · up to{" "}
            {MEMORY_MAX_PHOTOS_PER_USER}
          </span>
        </div>
        <p className="muted">
          Add up to {MEMORY_MAX_PHOTOS_PER_USER} photos from your camera or
          gallery. Compressed before upload.
        </p>
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
        </div>
        {canAddPhotos && (
          <div className="photo-add-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
            >
              Take photo
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => galleryInputRef.current?.click()}
            >
              Pick from gallery
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              disabled={busy}
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={busy}
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </section>

      {peerPhotos.length > 0 && (
        <section className="stack-section">
          <h2>Their photos</h2>
          <div className="photo-grid">
            {peerPhotos.map((photo) => (
              <div className="photo-grid__item" key={photo.id}>
                <img src={photo.photoUrl} alt="" loading="lazy" />
                <span className="member-meta photo-grid__caption">
                  {nameByUser.get(photo.userId) ?? "Peer"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="stack-section">
        <div className="section-head">
          <h2>Your songs</h2>
          <span className="member-meta">
            {memory.mySongs.length}/{MEMORY_SONGS_PER_USER} · up to{" "}
            {MEMORY_SONGS_PER_USER}
          </span>
        </div>
        <p className="muted">
          Paste a Spotify track link into any open slot. Connecting Spotify is
          optional — only needed later to export a playlist.
        </p>
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
                    Replace
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
                    const next = pasted.trim();
                    setSongDrafts((prev) => ({
                      ...prev,
                      [position]: next,
                    }));
                    void saveSong(position, next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveSong(position);
                    }
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

      {peerSongs.length > 0 && (
        <section className="stack-section">
          <h2>Their songs</h2>
          <div className="song-slots">
            {peerSongs
              .slice()
              .sort(
                (a, b) =>
                  a.userId.localeCompare(b.userId) || a.position - b.position,
              )
              .map((song) => (
                <div className="song-slot song-slot--filled" key={song.id}>
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
                    <span className="member-meta">
                      {song.artistName} ·{" "}
                      {nameByUser.get(song.userId) ?? "Peer"}
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      <section className="stack-section">
        <div className="section-head">
          <h2>Shared note</h2>
          <span className="member-meta">
            {note.length}/{MEMORY_NOTE_MAX}
          </span>
        </div>
        <p className="muted">Anyone can edit until the 24h window ends.</p>
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

      <div className="submit-bar">
        <span className="member-meta">
          {memory.mySubmitted
            ? `Marked done — you can still edit until ${formatCountdown(msLeft)} left`
            : "Optional: mark yourself done anytime — or add a photo and a song"}
        </span>
        <button
          type="button"
          className="primary"
          disabled={!canMarkDone || memory.mySubmitted}
          onClick={() => setConfirming(true)}
        >
          {memory.mySubmitted ? "Done" : "Mark done"}
        </button>
      </div>

      {confirming && (
        <div className="memory-modal" role="dialog" aria-modal="true">
          <div className="memory-modal__card">
            <h2>Mark yourself done?</h2>
            <p className="muted">
              This tells{" "}
              {joinNames(
                memory.members
                  .filter((m) => !m.isViewer)
                  .map((m) => m.displayName),
              )}{" "}
              you&apos;re finished — you can still edit until the 24h window
              ends.
            </p>
            <div className="row-actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void markDone()}
              >
                Mark done
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
