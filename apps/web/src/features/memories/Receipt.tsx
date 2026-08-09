import { useMemo, type CSSProperties } from "react";
import {
  MEMORY_SONGS_PER_USER,
  type MemoryLockedResponse,
} from "@summerhacks/shared";
import { seededRandom } from "./deterministic";
import {
  firstNamesOf,
  formatHangoutStamp,
  formatMemoryDate,
  memoryHeadline,
  shortMemoryId,
} from "./format";
import { useIsNarrow } from "./useMediaQuery";

const ITEM_MAX_CHARS_WIDE = 34;
const ITEM_MAX_CHARS_NARROW = 22;
const BARCODE_BARS = 42;

/** Keep in sync with `--receipt-tear` in styles.css. */
const TEAR_HEIGHT = 14;
const TEAR_PEAKS = 11;
/** Stretched to the receipt width, so this is just a unit grid. */
const TEAR_WIDTH = 100;

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Torn paper edge as a CSS mask layer. The peaks alternate shallow/deep with
 * per-memory jitter so no two receipts tear alike, and the SVG is a fixed
 * 14 units tall so stretching it across the width never distorts tooth height.
 */
function tearMaskUrl(seed: string, edge: "top" | "bottom"): string {
  const rand = seededRandom(`${seed}:tear:${edge}`);
  const step = TEAR_WIDTH / TEAR_PEAKS;

  const points: Array<[number, number]> = [];
  for (let i = 0; i <= TEAR_PEAKS; i++) {
    const base = i % 2 === 0 ? 0.2 : 0.85;
    const jittered = base + (rand() - 0.5) * 0.55;
    const depth = Math.min(0.97, Math.max(0.05, jittered)) * TEAR_HEIGHT;
    points.push([
      Number((i * step).toFixed(2)),
      Number(depth.toFixed(2)),
    ]);
  }

  const line = points.map(([x, y]) => `L${x},${y}`).join("");
  // The paper is the half of the box on the inward side of the jagged line.
  const path =
    edge === "top"
      ? `M0,${TEAR_HEIGHT}${line}L${TEAR_WIDTH},${TEAR_HEIGHT}Z`
      : `M0,0L${TEAR_WIDTH},0${points
          .slice()
          .reverse()
          .map(([x, y]) => `L${x},${y}`)
          .join("")}Z`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TEAR_WIDTH}" height="${TEAR_HEIGHT}" ` +
    `viewBox="0 0 ${TEAR_WIDTH} ${TEAR_HEIGHT}" preserveAspectRatio="none">` +
    `<path d="${path}" fill="#000"/></svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Deterministic pseudo-random bar widths from the memory id — decorative only. */
function barcodeWidths(seed: string): number[] {
  const rand = seededRandom(seed);
  return Array.from({ length: BARCODE_BARS }, () => 1 + Math.floor(rand() * 3));
}

function Barcode({ seed }: { seed: string }) {
  const widths = useMemo(() => barcodeWidths(seed), [seed]);
  const totalWidth = widths.reduce((sum, w) => sum + w + 1, 0);

  let x = 0;
  return (
    <svg
      className="receipt__barcode"
      viewBox={`0 0 ${totalWidth} 40`}
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden
    >
      {widths.map((w, i) => {
        const bar = <rect key={i} x={x} y={0} width={w} height={40} />;
        x += w + 1;
        return bar;
      })}
    </svg>
  );
}

export function Receipt({ memory }: { memory: MemoryLockedResponse }) {
  const narrow = useIsNarrow();
  const displayNames = memory.members.map((m) => m.displayName);
  // Title API is optional — headline falls back to first names.
  const title =
    "title" in memory && typeof (memory as { title?: unknown }).title === "string"
      ? (memory as { title: string }).title
      : null;
  const headline = memoryHeadline(title, displayNames);
  const itemMax = narrow ? ITEM_MAX_CHARS_NARROW : ITEM_MAX_CHARS_WIDE;

  const tearStyle = useMemo(
    () =>
      ({
        "--receipt-tear-top": tearMaskUrl(memory.id, "top"),
        "--receipt-tear-bottom": tearMaskUrl(memory.id, "bottom"),
      }) as CSSProperties,
    [memory.id],
  );

  return (
    <div className="receipt-shell" style={tearStyle}>
      <section className="receipt" aria-label="Memory receipt">
        <header className="receipt__head">
          <h2 className="receipt__title">{headline}</h2>
          <p className="receipt__subtitle">
            memory of {formatMemoryDate(memory.hangoutAt)}
          </p>
        </header>

        <div className="receipt__rule" />

        <div className="receipt__row receipt__row--head">
          <span className="receipt__qty">QTY</span>
          <span className="receipt__item">ITEM</span>
          <span className="receipt__amt">AMT</span>
        </div>

        <ol className="receipt__items">
          {memory.songs.map((song, index) => (
            <li className="receipt__row" key={song.id}>
              <span className="receipt__qty">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="receipt__item">
                {truncate(
                  `${song.trackTitle} - ${song.artistName}`.toUpperCase(),
                  itemMax,
                )}
              </span>
              <span className="receipt__amt">
                {(song.position % MEMORY_SONGS_PER_USER) + 1}
              </span>
            </li>
          ))}
        </ol>

        <div className="receipt__rule" />

        {/* Two-column rows so these labels never clip to "ITE" / "TOT". */}
        <div className="receipt__row--total">
          <span>{narrow ? "Items" : "Item count"}</span>
          <span>{memory.songs.length}</span>
        </div>
        <div className="receipt__row--total">
          <span>People</span>
          <span>{memory.members.length}</span>
        </div>

        <div className="receipt__rule" />

        <div className="receipt__meta">
          <p>
            <span className="receipt__label">MEMBERS:</span>{" "}
            {firstNamesOf(displayNames).join(", ").toUpperCase()}
          </p>
          {memory.note && (
            <p className="receipt__note">
              <span className="receipt__label">NOTE:</span> {memory.note}
            </p>
          )}
          <p>
            <span className="receipt__label">HANGOUT:</span>{" "}
            {formatHangoutStamp(memory.hangoutAt)}
          </p>
        </div>

        <p className="receipt__thanks">a moment preserved</p>

        <Barcode seed={memory.id} />
        <p className="receipt__permalink">
          beacon · {shortMemoryId(memory.id)}
        </p>
      </section>
    </div>
  );
}
