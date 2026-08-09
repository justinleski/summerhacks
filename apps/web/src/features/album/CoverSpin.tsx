import { useEffect, useMemo, useRef, useState } from "react";
import type { AlbumCover } from "@summerhacks/shared";

type CoverSpinProps = {
  covers: AlbumCover[];
  winnerUserId: string;
  onDone: () => void;
};

/** CS2-style highlight: cycles through covers, decelerates onto the winner. */
export function CoverSpin({ covers, winnerUserId, onDone }: CoverSpinProps) {
  const candidates = useMemo(
    () => covers.filter((c) => c.coverUrl || c.pixels.some((p) => p != null)),
    [covers],
  );
  const winnerIndex = Math.max(
    0,
    candidates.findIndex((c) => c.userId === winnerUserId),
  );
  const [highlight, setHighlight] = useState(0);
  const [finished, setFinished] = useState(false);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (candidates.length === 0) {
      onDoneRef.current();
      return;
    }
    if (candidates.length === 1) {
      setHighlight(0);
      setFinished(true);
      const t = setTimeout(() => onDoneRef.current(), 600);
      return () => clearTimeout(t);
    }

    const loops = 6 + Math.floor(Math.random() * 3);
    const steps: number[] = [];
    for (let i = 0; i < loops * candidates.length + winnerIndex + 1; i++) {
      steps.push(i % candidates.length);
    }
    steps[steps.length - 1] = winnerIndex;

    let i = 0;
    let delay = 55;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      setHighlight(steps[i]!);
      i += 1;
      if (i >= steps.length) {
        setFinished(true);
        timer = setTimeout(() => {
          if (!doneRef.current) {
            doneRef.current = true;
            onDoneRef.current();
          }
        }, 900);
        return;
      }
      delay = Math.min(280, delay * 1.085 + 4);
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
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
