import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { firstNameOf, formatCountdown, joinNames } from "./format";
import {
  memberContributionStatus,
  shouldAutoSubmitMemory,
} from "./memberStatus";

const ONE_HOUR_MS = 60 * 60 * 1000;
const SONG_SLOTS = Array.from({ length: MEMORY_SONGS_PER_USER }, (_, i) => i);

function BuildShell({ children }: { children: ReactNode }) {
  return (
    <main className="memory-shell">
      <div className="memory-shell__inner memory-shell__inner--column">
        {children}
      </div>
    </main>
  );
}

function Countdown({ msLeft, urgent }: { msLeft: number; urgent: boolean }) {
  return (
    <div className="memory-build__countdown">
      <p
        className={
          urgent ? "memory-clock memory-clock--urgent" : "memory-clock"
        }
      >
        {formatCountdown(msLeft)}
      </p>
      <p className="memory-build__caption">until this window closes</p>
    </div>
  );
}

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
      <BuildShell>
        <p className="memory-error">{error}</p>
        <Link className="memory-link memory-link--muted" to="/home">
          <span className="memory-link__glyph" aria-hidden>
            ←
          </span>
          back home
        </Link>
      </BuildShell>
    );
  }

  if (!memory) {
    return (
      <BuildShell>
        <p className="memory-hint">loading memory…</p>
      </BuildShell>
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
    <BuildShell>
      <Countdown msLeft={msLeft} urgent={urgent} />
      <AlbumWindowBar
        expiresAt={memory.windowExpiresAt}
        startsAt={memory.windowStartsAt}
        now={now}
      />

      <ul className="memory-crew">
        {memory.members.map((m) => {
          const status = memberContributionStatus(
            m,
            memory.photos,
            memory.songs,
          );
          return (
            <li key={m.userId}>
              {m.avatarUrl ? (
                <img className="memory-crew__avatar" src={m.avatarUrl} alt="" />
              ) : (
                <span
                  className="memory-crew__avatar memory-crew__avatar--empty"
                  aria-hidden
                >
                  {m.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="memory-crew__name">
                {firstNameOf(m.displayName)}
                {m.isViewer ? " (you)" : ""}
              </span>
              <span
                className={
                  status.ready
                    ? "memory-crew__dot memory-crew__dot--done"
                    : "memory-crew__dot memory-crew__dot--pending"
                }
                aria-label={status.label}
              />
            </li>
          );
        })}
      </ul>

      {error && <p className="memory-error">{error}</p>}

      <div className="memory-field">
        <label className="memory-label" htmlFor="memory-note">
          Note
        </label>
        <div className="memory-field__wrap">
          <textarea
            id="memory-note"
            className="memory-textarea"
            value={note}
            maxLength={MEMORY_NOTE_MAX}
            rows={3}
            placeholder="something about this hangout (optional)"
            onChange={(e) => {
              setNote(e.target.value);
              setNoteDirty(true);
            }}
            onBlur={() => void saveNote()}
          />
          <span className="memory-field__counter">
            {note.length}/{MEMORY_NOTE_MAX}
          </span>
        </div>
      </div>

      <section className="memory-section">
        <div className="memory-section__head">
          <p className="memory-label">Your photos</p>
          <p className="memory-hint">
            {photoCount}/{MEMORY_MAX_PHOTOS_PER_USER}
          </p>
        </div>
        <div className="memory-photos">
          {memory.myPhotos.map((photo) => (
            <div className="memory-photo" key={photo.id}>
              <img src={photo.photoUrl} alt="" loading="lazy" />
              <button
                type="button"
                className="memory-x"
                aria-label="Remove photo"
                disabled={busy}
                onClick={() => void removePhoto(photo.id)}
              >
                <span aria-hidden>×</span>
              </button>
            </div>
          ))}
          {canAddPhotos && (
            <>
              <button
                type="button"
                className="memory-photo-add"
                disabled={busy}
                onClick={() => cameraInputRef.current?.click()}
              >
                <span aria-hidden>+</span>
                <span className="sr-only">Take photo</span>
              </button>
              <button
                type="button"
                className="memory-photo-add"
                disabled={busy}
                onClick={() => galleryInputRef.current?.click()}
              >
                <span aria-hidden>▦</span>
                <span className="sr-only">Pick from gallery</span>
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
            </>
          )}
        </div>
      </section>

      {peerPhotos.length > 0 && (
        <section className="memory-section">
          <div className="memory-section__head">
            <p className="memory-label">Their photos</p>
          </div>
          <div className="memory-photos">
            {peerPhotos.map((photo) => (
              <div className="memory-photo" key={photo.id}>
                <img src={photo.photoUrl} alt="" loading="lazy" />
                <span className="memory-hint">
                  {nameByUser.get(photo.userId) ?? "Peer"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="memory-section">
        <div className="memory-section__head">
          <p className="memory-label">Your songs</p>
          <p className="memory-hint">
            {memory.mySongs.length}/{MEMORY_SONGS_PER_USER}
          </p>
        </div>
        <div className="memory-songs">
          {SONG_SLOTS.map((position) => {
            const song = memory.mySongs.find((s) => s.position === position);
            if (song) {
              return (
                <div className="memory-song" key={position}>
                  {song.albumArtUrl ? (
                    <img
                      className="memory-song__art"
                      src={song.albumArtUrl}
                      alt=""
                    />
                  ) : (
                    <span className="memory-song__art" aria-hidden />
                  )}
                  <span className="memory-song__meta">
                    <span className="memory-song__title">{song.trackTitle}</span>
                    <span className="memory-song__artist">
                      {song.artistName}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="memory-x"
                    aria-label={`Remove ${song.trackTitle}`}
                    disabled={busy}
                    onClick={() => void removeSong(position)}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
              );
            }
            return (
              <div className="memory-song memory-song--empty" key={position}>
                <input
                  value={songDrafts[position] ?? ""}
                  placeholder="paste spotify link"
                  aria-label={`Spotify link for slot ${position + 1}`}
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
                    const pasted = e.clipboardData.getData("text").trim();
                    if (!pasted) return;
                    e.preventDefault();
                    setSongDrafts((prev) => ({ ...prev, [position]: pasted }));
                    void saveSong(position, pasted);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveSong(position);
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>

      {peerSongs.length > 0 && (
        <section className="memory-section">
          <div className="memory-section__head">
            <p className="memory-label">Their songs</p>
          </div>
          <div className="memory-songs">
            {peerSongs
              .slice()
              .sort(
                (a, b) =>
                  a.userId.localeCompare(b.userId) || a.position - b.position,
              )
              .map((song) => (
                <div className="memory-song" key={song.id}>
                  {song.albumArtUrl ? (
                    <img
                      className="memory-song__art"
                      src={song.albumArtUrl}
                      alt=""
                    />
                  ) : (
                    <span className="memory-song__art" aria-hidden />
                  )}
                  <span className="memory-song__meta">
                    <span className="memory-song__title">{song.trackTitle}</span>
                    <span className="memory-song__artist">
                      {song.artistName} ·{" "}
                      {nameByUser.get(song.userId) ?? "Peer"}
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      <div className="memory-submit">
        <button
          type="button"
          className="memory-button"
          disabled={!canMarkDone || memory.mySubmitted}
          onClick={() => setConfirming(true)}
        >
          {memory.mySubmitted ? "Done" : "Mark done"}
        </button>
        <p className="memory-count">
          {memory.mySubmitted
            ? `marked done; edit until ${formatCountdown(msLeft)} left`
            : "optional: you can still edit until the window ends"}
        </p>
      </div>

      {confirming && (
        <div className="memory-sheet" role="dialog" aria-modal="true">
          <div className="memory-sheet__card">
            <p className="memory-sheet__lede">Mark yourself done?</p>
            <p className="memory-sheet__sub">
              This tells{" "}
              {joinNames(
                memory.members
                  .filter((m) => !m.isViewer)
                  .map((m) => m.displayName),
              )}{" "}
              you&apos;re finished; you can still edit until the 24h window
              ends.
            </p>
            <div className="memory-sheet__actions">
              <button
                type="button"
                className="memory-link memory-link--muted"
                onClick={() => setConfirming(false)}
              >
                keep editing
              </button>
              <button
                type="button"
                className="memory-button memory-button--small"
                disabled={busy}
                onClick={() => void markDone()}
              >
                Mark done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="memory-detail__group memory-detail__group--back">
        <Link
          className="memory-link memory-link--muted"
          to={`/session/${memory.sessionId}`}
        >
          <span className="memory-link__glyph" aria-hidden>
            ←
          </span>
          back to session
        </Link>
      </div>
    </BuildShell>
  );
}
