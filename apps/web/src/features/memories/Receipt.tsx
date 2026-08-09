import { useMemo } from "react";
import {
  MEMORY_SONGS_PER_USER,
  type MemoryLockedResponse,
} from "@summerhacks/shared";
import { formatHangoutStamp, formatMemoryDate } from "./format";

const ITEM_MAX_CHARS = 30;
const BARCODE_BARS = 42;

function truncate(value: string, max = ITEM_MAX_CHARS): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Deterministic pseudo-random bar widths from the memory id — decorative only. */
function barcodeWidths(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }
  const widths: number[] = [];
  for (let i = 0; i < BARCODE_BARS; i++) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    widths.push(1 + (hash % 3));
  }
  return widths;
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
  const memberNames = memory.members.map((m) => m.displayName);

  return (
    <section className="receipt" aria-label="Memory receipt">
      <header className="receipt__head">
        <h2 className="receipt__title">RECEIPTIFY</h2>
        <p className="receipt__subtitle">
          MEMORY OF {formatMemoryDate(memory.hangoutAt).toUpperCase()}
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
              {truncate(`${song.trackTitle} - ${song.artistName}`.toUpperCase())}
            </span>
            <span className="receipt__amt">
              {(song.position % MEMORY_SONGS_PER_USER) + 1}
            </span>
          </li>
        ))}
      </ol>

      <div className="receipt__rule" />

      <div className="receipt__row">
        <span className="receipt__item">ITEM COUNT:</span>
        <span className="receipt__amt">{memory.songs.length}</span>
      </div>
      <div className="receipt__row">
        <span className="receipt__item">TOTAL:</span>
        <span className="receipt__amt">{memory.members.length}</span>
      </div>

      <div className="receipt__rule" />

      <div className="receipt__meta">
        <p>
          <span className="receipt__label">MEMBERS:</span>{" "}
          {memberNames.join(", ").toUpperCase()}
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

      <p className="receipt__thanks">THANK YOU FOR VISITING!</p>

      <Barcode seed={memory.id} />
      <p className="receipt__permalink">
        summerhacks-ebon.vercel.app/memories/{memory.id}
      </p>
    </section>
  );
}
