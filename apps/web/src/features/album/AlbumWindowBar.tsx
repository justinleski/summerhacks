import { ALBUM_EDIT_WINDOW_MS } from "@summerhacks/shared";

const SEGMENTS = 24;

type AlbumWindowBarProps = {
  /** Absolute end of the edit window (ISO). */
  expiresAt: string;
  /** Optional absolute start; defaults to expiresAt − 24h. */
  startsAt?: string;
  now?: number;
  className?: string;
};

/**
 * 24-segment bar for the album edit window (one segment ≈ one hour).
 * Filled segments = time remaining; empty = elapsed.
 */
export function AlbumWindowBar({
  expiresAt,
  startsAt,
  now = Date.now(),
  className,
}: AlbumWindowBarProps) {
  const end = new Date(expiresAt).getTime();
  const start = startsAt
    ? new Date(startsAt).getTime()
    : end - ALBUM_EDIT_WINDOW_MS;
  const total = Math.max(1, end - start);
  const remaining = Math.max(0, Math.min(total, end - now));
  const filled = Math.round((remaining / total) * SEGMENTS);

  return (
    <div
      className={["album-window-bar", className].filter(Boolean).join(" ")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={SEGMENTS}
      aria-valuenow={filled}
      aria-label={`${filled} of ${SEGMENTS} hours left to edit`}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const lit = i < filled;
        return (
          <span
            key={i}
            className={
              lit
                ? "album-window-bar__seg album-window-bar__seg--on"
                : "album-window-bar__seg"
            }
          />
        );
      })}
    </div>
  );
}
