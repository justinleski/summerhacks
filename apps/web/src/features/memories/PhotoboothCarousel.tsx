import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import type { MemoryPhoto } from "@summerhacks/shared";
import { buildStrips } from "./interleave";
import { usePrefersReducedMotion } from "./useMediaQuery";

const SWIPE_THRESHOLD_PX = 40;
/** Keep in sync with the .photobooth__strip--current transition in styles.css. */
const SHUFFLE_MS = 350;
const HINT_KEY = "memory:shuffle-hint-seen";

type Direction = "next" | "prev";

function readHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    // Private-mode Safari throws on localStorage; the hint just always shows.
    return false;
  }
}

function Strip({
  slots,
  className,
}: {
  slots: (MemoryPhoto | null)[];
  className: string;
}) {
  return (
    <div className={className}>
      {slots.map((photo, slot) => (
        <div
          className={
            photo
              ? "photobooth__slot"
              : "photobooth__slot photobooth__slot--empty"
          }
          key={photo?.id ?? `empty-${slot}`}
        >
          {photo ? (
            <img
              className="photobooth__frame"
              src={photo.photoUrl}
              alt=""
              loading="lazy"
            />
          ) : (
            <span className="photobooth__frame" aria-hidden>
              <span className="photobooth__ghost">+</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function PhotoboothCarousel({ photos }: { photos: MemoryPhoto[] }) {
  const reducedMotion = usePrefersReducedMotion();
  const strips = useMemo(() => buildStrips(photos), [photos]);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<Direction | null>(null);
  /** Flips each shuffle so the discarded strip re-enters the deck on the far side. */
  const [peekLeft, setPeekLeft] = useState(false);
  /** Read once at mount so dismissing it can fade rather than pop out. */
  const [hintSuppressed] = useState(readHintSeen);
  const [hintDismissed, setHintDismissed] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const dismissHint = useCallback(() => {
    if (hintDismissed) return;
    setHintDismissed(true);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      // Nothing to persist to — the hint reappears next visit, which is fine.
    }
  }, [hintDismissed]);

  const shuffle = useCallback(
    (direction: Direction, target?: number) => {
      if (strips.length < 2 || leaving) return;
      dismissHint();
      setLeaving(direction);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(
        () => {
          setIndex((prev) => {
            if (target != null) return target;
            const next = direction === "next" ? prev + 1 : prev - 1;
            return (next + strips.length) % strips.length;
          });
          setPeekLeft((prev) => !prev);
          setLeaving(null);
        },
        // Reduced motion gets a true instant swap rather than a timed one.
        reducedMotion ? 0 : SHUFFLE_MS,
      );
    },
    [strips.length, leaving, dismissHint, reducedMotion],
  );

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
    return <p className="memory-hint">No photos in this memory.</p>;
  }

  const strip = strips[index]!;
  const peekIndex = (index + 1) % strips.length;
  const showPeek = strips.length > 1;

  const stripClass = leaving
    ? `photobooth__strip photobooth__strip--current photobooth__strip--flick-${leaving}`
    : "photobooth__strip photobooth__strip--current";

  const peekClass = [
    "photobooth__peek",
    peekLeft ? "photobooth__peek--left" : "",
    leaving ? "photobooth__peek--advance" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="photobooth">
      <div
        className="photobooth__stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {showPeek && (
          <div className={peekClass} aria-hidden>
            <Strip
              slots={strips[peekIndex]!}
              className="photobooth__strip"
            />
          </div>
        )}

        <button
          type="button"
          className="photobooth__tap"
          onClick={() => shuffle("next")}
          aria-label={`Show next strip (${index + 1} of ${strips.length})`}
        >
          <Strip slots={strip} className={stripClass} />
        </button>
      </div>

      {strips.length > 1 && !hintSuppressed && (
        <p
          className={
            hintDismissed
              ? "photobooth__hint photobooth__hint--gone"
              : "photobooth__hint"
          }
        >
          tap to shuffle
        </p>
      )}

      <div className="photobooth__pager">
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
                  shuffle(i > index ? "next" : "prev", i);
                }}
              />
            ))}
          </span>
        )}
        <span className="photobooth__count">
          {index + 1}/{strips.length}
        </span>
      </div>
    </div>
  );
}
