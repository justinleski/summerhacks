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
  MEMORY_TITLE_MAX,
  isValidMemoryPhotoCount,
  type MemoryDraftResponse,
  type MemoryResponse,
  type MemorySong,
  type SpotifyStatusResponse,
} from "@summerhacks/shared";
import { api, uploadMemoryPhoto } from "../../lib/api";
import { firstNameOf, formatCountdown, joinNames } from "./format";

const ONE_HOUR_MS = 60 * 60 * 1000;
const SONG_SLOTS = Array.from({ length: MEMORY_SONGS_PER_USER }, (_, i) => i);
/** How long "all in." shows before the last submitter is sent to the receipt. */
const ALL_IN_FLASH_MS = 400;

function bannerKey(memoryId: string): string {
  return `memory:${memoryId}:spotify-banner-dismissed`;
}

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Nothing to persist to; the banner just returns next visit.
  }
}

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
  const [title, setTitle] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [note, setNote] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const [songDrafts, setSongDrafts] = useState<Record<number, string>>({});
  const [spotify, setSpotify] = useState<SpotifyStatusResponse | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [allIn, setAllIn] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Refs so the poll never clobbers text the user is mid-way through typing.
  const titleDirtyRef = useRef(false);
  titleDirtyRef.current = titleDirty;
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
    if (!titleDirtyRef.current) setTitle(res.memory.title ?? "");
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

  useEffect(() => {
    if (memory) setBannerDismissed(readDismissed(bannerKey(memory.id)));
  }, [memory?.id]);

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

  async function saveSong(position: number, rawUrl?: string) {
    const spotifyUrl = (rawUrl ?? songDrafts[position] ?? "").trim();
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

  async function saveTitle() {
    if (!memory || !titleDirty) return;
    await withBusy(async () => {
      await api(`/memories/${memory.id}/title`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.trim() || null }),
      });
      setTitleDirty(false);
      await load();
    }, "Could not save the title");
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
        // Being last to submit locks the memory — hold on "all in." a beat.
        const lockedId = res.memory.id;
        setAllIn(true);
        window.setTimeout(
          () => navigate(`/memories/${lockedId}`, { replace: true }),
          ALL_IN_FLASH_MS,
        );
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

  if (allIn) {
    return (
      <BuildShell>
        <div className="memory-wait">
          <p className="memory-wait__big">all in.</p>
        </div>
      </BuildShell>
    );
  }

  if (error && !memory) {
    return (
      <BuildShell>
        <p className="memory-error">{error}</p>
        <Link className="memory-link memory-link--muted" to="/">
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
  const songsValid = memory.mySongs.length === MEMORY_SONGS_PER_USER;
  const canSubmit = photosValid && songsValid && !busy;
  const pending = memory.members.filter((m) => !m.submitted && !m.isViewer);

  if (memory.mySubmitted) {
    return (
      <BuildShell>
        <Countdown msLeft={msLeft} urgent={urgent} />

        <div className="memory-wait">
          <p className="memory-wait__big">submitted,</p>
          <p className="memory-wait__names">
            waiting on{" "}
            {pending.length > 0
              ? joinNames(pending.map((m) => firstNameOf(m.displayName)))
              : "the last lock"}
          </p>
          <p className="memory-wait__hint">their turn to bring the songs</p>
        </div>

        {error && <p className="memory-error">{error}</p>}

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

  const showBanner = spotify != null && !spotify.connected && !bannerDismissed;

  return (
    <BuildShell>
      <Countdown msLeft={msLeft} urgent={urgent} />

      {/* Who's in — status only, never a hint at what anyone uploaded. */}
      <ul className="memory-crew">
        {memory.members.map((m) => (
          <li key={m.userId}>
            {m.avatarUrl ? (
              <img className="memory-crew__avatar" src={m.avatarUrl} alt="" />
            ) : (
              <span className="memory-crew__avatar memory-crew__avatar--empty" aria-hidden>
                {m.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="memory-crew__name">
              {firstNameOf(m.displayName)}
            </span>
            <span
              className={
                m.submitted
                  ? "memory-crew__dot memory-crew__dot--done"
                  : "memory-crew__dot memory-crew__dot--pending"
              }
              aria-label={m.submitted ? "submitted" : "still writing"}
            />
          </li>
        ))}
      </ul>

      {error && <p className="memory-error">{error}</p>}

      <div className="memory-field">
        <label className="memory-label" htmlFor="memory-title">
          Title
        </label>
        <div className="memory-field__wrap">
          <input
            id="memory-title"
            className="memory-input"
            value={title}
            maxLength={MEMORY_TITLE_MAX}
            placeholder="name this memory (optional)"
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleDirty(true);
            }}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => {
              setTitleFocused(false);
              void saveTitle();
            }}
          />
          {titleFocused && (
            <span className="memory-field__counter">
              {title.length}/{MEMORY_TITLE_MAX}
            </span>
          )}
        </div>
      </div>

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
            onFocus={() => setNoteFocused(true)}
            onBlur={() => {
              setNoteFocused(false);
              void saveNote();
            }}
          />
          {noteFocused && (
            <span className="memory-field__counter">
              {note.length}/{MEMORY_NOTE_MAX}
            </span>
          )}
        </div>
      </div>

      <section className="memory-section">
        <div className="memory-section__head">
          <p className="memory-label">Photos</p>
          <p className="memory-hint">add in pairs — 2, 4, 6, or 8</p>
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
          {photoCount < MEMORY_MAX_PHOTOS_PER_USER && (
            <label className="memory-photo-add">
              <span aria-hidden>+</span>
              <span className="sr-only">Add photos</span>
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

        <p
          className={
            photosValid ? "memory-count" : "memory-count memory-count--invalid"
          }
        >
          {photoCount} photos
          {photosValid ? " ✓" : " — add or remove one to make it even"}
        </p>
      </section>

      <section className="memory-section">
        <div className="memory-section__head">
          <p className="memory-label">Songs</p>
          <p className="memory-hint">paste three spotify track links</p>
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
                    // Pasting is the whole interaction — resolve it right away.
                    void saveSong(position, pasted);
                  }}
                  onBlur={() => void saveSong(position)}
                />
              </div>
            );
          })}
        </div>
      </section>

      {showBanner && (
        <div className="memory-banner">
          <p>connect spotify to auto-save the playlist when everyone's done</p>
          <button
            type="button"
            className="memory-link memory-link--mono"
            disabled={busy}
            onClick={() => void connectSpotify()}
          >
            connect →
          </button>
          <button
            type="button"
            className="memory-x"
            aria-label="Dismiss"
            onClick={() => {
              setBannerDismissed(true);
              writeDismissed(bannerKey(memory.id));
            }}
          >
            <span aria-hidden>×</span>
          </button>
        </div>
      )}

      <div className="memory-submit">
        <button
          type="button"
          className="memory-button"
          disabled={!canSubmit}
          onClick={() => setConfirming(true)}
        >
          Lock it in
        </button>
        {!canSubmit && (
          <p className="memory-count">
            {songsValid ? "even photo count needed" : "3 songs needed"}
          </p>
        )}
      </div>

      {confirming && (
        <div className="memory-sheet" role="dialog" aria-modal="true">
          <div className="memory-sheet__card">
            <p className="memory-sheet__lede">
              once you submit, you can't edit.
            </p>
            <p className="memory-sheet__sub">
              waiting on others until the memory locks.
            </p>
            <div className="memory-sheet__actions">
              <button
                type="button"
                className="memory-link memory-link--muted"
                onClick={() => setConfirming(false)}
              >
                not yet
              </button>
              <button
                type="button"
                className="memory-button memory-button--small"
                disabled={busy}
                onClick={() => void submit()}
              >
                Submit
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
