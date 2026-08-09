import { useEffect, useRef, useState } from "react";
import type { AlbumCover } from "@summerhacks/shared";

type CoverSpinProps = {
  covers: AlbumCover[];
  winnerUserId: string;
  onDone: () => void;
};

/** ~5s for 2 covers; +~100ms per extra cover with diminishing returns. */
export function coverSpinBudgetMs(coverCount: number): number {
  if (coverCount <= 1) return 600;
  let budget = 5000;
  for (let i = 3; i <= coverCount; i++) {
    budget += 100 / Math.sqrt(i - 2);
  }
  return budget;
}

function buildEaseOutDelays(stepCount: number, totalMs: number): number[] {
  const weights: number[] = [];
  for (let i = 0; i < stepCount; i++) {
    const t = (i + 1) / stepCount;
    // Snappy start, decelerate onto the winner.
    weights.push(0.4 + t * t);
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * totalMs);
}

function coversWithArt(covers: AlbumCover[]): AlbumCover[] {
  return covers.filter((c) => c.coverUrl || c.pixels.some((p) => p != null));
}

/** CS2-style highlight: cycles through covers, decelerates onto the winner. */
export function CoverSpin({ covers, winnerUserId, onDone }: CoverSpinProps) {
  // Snapshot on first render so parent poll/refetch cannot restart the spin.
  const snapshotRef = useRef<{
    candidates: AlbumCover[];
    winnerIndex: number;
  } | null>(null);
  if (snapshotRef.current == null) {
    const candidates = coversWithArt(covers);
    snapshotRef.current = {
      candidates,
      winnerIndex: Math.max(
        0,
        candidates.findIndex((c) => c.userId === winnerUserId),
      ),
    };
  }
  const { candidates, winnerIndex } = snapshotRef.current;

  const [highlight, setHighlight] = useState(0);
  const [finished, setFinished] = useState(false);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (doneRef.current) return;

    if (candidates.length === 0) {
      doneRef.current = true;
      onDoneRef.current();
      return;
    }
    if (candidates.length === 1) {
      setHighlight(0);
      setFinished(true);
      const t = setTimeout(() => {
        if (!doneRef.current) {
          doneRef.current = true;
          onDoneRef.current();
        }
      }, 450);
      return () => clearTimeout(t);
    }

    const n = candidates.length;
    const finishHoldMs = 450;
    const budget = coverSpinBudgetMs(n);
    // Slight jitter so repeats don't feel identical (still ≤ budget).
    const spinMs = Math.max(
      1800,
      (budget - finishHoldMs) * (0.88 + Math.random() * 0.12),
    );

    // ~2–3 full loops for small groups; grow slowly with n.
    const loops = Math.max(2, Math.min(4, 1 + Math.ceil(Math.sqrt(n))));
    const steps: number[] = [];
    for (let i = 0; i < loops * n + winnerIndex + 1; i++) {
      steps.push(i % n);
    }
    steps[steps.length - 1] = winnerIndex;

    // Inter-step delays only — final highlight uses finishHoldMs.
    const delays = buildEaseOutDelays(Math.max(1, steps.length - 1), spinMs);

    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      setHighlight(steps[i]!);
      i += 1;
      if (i >= steps.length) {
        setFinished(true);
        timer = setTimeout(() => {
          if (!doneRef.current) {
            doneRef.current = true;
            onDoneRef.current();
          }
        }, finishHoldMs);
        return;
      }
      timer = setTimeout(tick, delays[i - 1]!);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidates, winnerIndex]);

  if (candidates.length === 0) return null;

  return (
    <div className="cover-spin" role="status" aria-live="polite">
      <p className="cover-spin__label">
        {finished ? "Winner" : "Picking a cover…"}
      </p>
      <div className="cover-spin__rail">
        {candidates.map((c, i) => {
          const active = i === highlight;
          return (
            <div
              key={c.userId}
              className={
                "cover-spin__item" +
                (active ? " cover-spin__item--active" : "") +
                (finished && active ? " cover-spin__item--winner" : "")
              }
            >
              {c.coverUrl ? (
                <img src={c.coverUrl} alt="" />
              ) : (
                <div className="cover-spin__blank" aria-hidden />
              )}
              <span>{c.displayName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
