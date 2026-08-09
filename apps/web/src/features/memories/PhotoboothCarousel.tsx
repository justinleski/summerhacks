import { useMemo, useRef, useState, type TouchEvent } from "react";
import {
  PHOTOBOOTH_SLOTS_PER_STRIP,
  type MemoryPhoto,
} from "@summerhacks/shared";
import { buildStrips } from "./interleave";

const SWIPE_THRESHOLD_PX = 40;
/** Keep in sync with the .photobooth__strip--* transition in styles.css. */
const SHUFFLE_MS = 300;

type Direction = "next" | "prev";

export function PhotoboothCarousel({ photos }: { photos: MemoryPhoto[] }) {
  const strips = useMemo(() => buildStrips(photos), [photos]);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<Direction | null>(null);
  const touchStartX = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  function shuffle(direction: Direction) {
    if (strips.length < 2 || leaving) return;
    setLeaving(direction);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setIndex((prev) => {
        const next = direction === "next" ? prev + 1 : prev - 1;
        return (next + strips.length) % strips.length;
      });
      setLeaving(null);
    }, SHUFFLE_MS);
  }

  function onTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(e: TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const delta = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    shuffle(delta < 0 ? "next" : "prev");
  }

  if (strips.length === 0) {
    return <p className="muted">No photos in this memory.</p>;
  }

  const strip = strips[index]!;
  const stripClass = leaving
    ? `photobooth__strip photobooth__strip--leaving-${leaving}`
    : "photobooth__strip photobooth__strip--entering";

  return (
    <div className="photobooth">
      <div
        className="photobooth__stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          className="photobooth__tap"
          onClick={() => shuffle("next")}
          aria-label={`Show next strip (${index + 1} of ${strips.length})`}
        >
          {/* key forces a remount so the enter transition replays each shuffle */}
          <div className={stripClass} key={index}>
            {strip.map((photo, slot) => (
              <div
                className={
                  photo
                    ? "photobooth__slot"
                    : "photobooth__slot photobooth__slot--empty"
                }
                key={photo?.id ?? `empty-${slot}`}
              >
                {photo && <img src={photo.photoUrl} alt="" loading="lazy" />}
              </div>
            ))}
          </div>
        </button>
      </div>

      <div className="photobooth__pager">
        <span className="member-meta">
          Strip {index + 1}/{strips.length} ·{" "}
          {PHOTOBOOTH_SLOTS_PER_STRIP} per strip
        </span>
        {strips.length > 1 && (
          <span className="photobooth__dots">
            {strips.map((_, i) => (
              <button
                type="button"
                key={i}
                className={
                  i === index
                    ? "photobooth__dot photobooth__dot--on"
                    : "photobooth__dot"
                }
                aria-label={`Show strip ${i + 1}`}
                aria-current={i === index}
                onClick={() => {
                  if (i === index) return;
                  shuffle(i > index ? "next" : "prev");
                  // Jump straight to the tapped strip after the slide out.
                  if (timerRef.current != null) {
                    window.clearTimeout(timerRef.current);
                  }
                  timerRef.current = window.setTimeout(() => {
                    setIndex(i);
                    setLeaving(null);
                  }, SHUFFLE_MS);
                }}
              />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
