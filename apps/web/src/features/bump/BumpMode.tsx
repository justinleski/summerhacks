import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BumpCandidate, BumpProposal, Session } from "@summerhacks/shared";
import { api } from "../../lib/api";
import { useAmbientIntensity } from "../../lib/ambient";
import { useAccelerometerBump } from "./useAccelerometerBump";
import { useBumpFallback } from "./useBumpFallback";
import { useBumpHaptics, vibrateConfirm } from "./useBumpHaptics";
import { useBumpSearch } from "./useBumpSearch";

type Phase =
  | "idle"
  | "listening"
  | "searching"
  | "matched_confirm"
  | "expired"
  | "proposal_incoming"
  | "error";

const THRESHOLD = 16;
/** Gravity-ish floor; same baseline as haptics. */
const MAG_BASELINE = 9.5;

/**
 * Nonlinear 0..1 beacon brightness: rises slowly at first, then accelerates
 * as magnitude approaches the bump threshold (power curve, not linear).
 */
function beaconFromMagnitude(magnitude: number, threshold: number): number {
  const span = Math.max(1, threshold - MAG_BASELINE);
  const t = Math.min(1, Math.max(0, (magnitude - MAG_BASELINE) / span));
  return Math.pow(t, 1.75);
}

function AnonymousAvatar({
  avatarUrl,
  selected,
  disabled,
  onClick,
  label,
}: {
  avatarUrl: string | null;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  label: string;
}) {
  const inner = avatarUrl ? (
    <img src={avatarUrl} alt="" />
  ) : (
    <span className="bump-avatar__placeholder" aria-hidden>
      ?
    </span>
  );

  if (!onClick) {
    return (
      <div className="bump-avatar" aria-label={label} role="img">
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`bump-avatar${selected ? " bump-avatar--selected" : ""}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      {inner}
    </button>
  );
}

export function BumpMode({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  useAmbientIntensity("off");
  const [phase, setPhase] = useState<Phase>("idle");
  const { bump, error, startSearch, cancel, setBump } = useBumpSearch();
  const [confirming, setConfirming] = useState(false);
  const [activeProposal, setActiveProposal] = useState<BumpProposal | null>(
    null,
  );

  const fallback = useBumpFallback(
    bump,
    phase === "expired" || phase === "proposal_incoming",
    (next) => {
      setBump(next);
      setActiveProposal(null);
      setPhase("matched_confirm");
    },
  );

  const waitingToBump = phase === "listening" || phase === "searching";
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const { magnitude, permission, requestPermission, resetPeakGate } =
    useAccelerometerBump({
      // Keep live magnitude through search so the beacon can still track shake.
      enabled: waitingToBump,
      threshold: THRESHOLD,
      onPeak: async (mag) => {
        // Peak detection only while listening; searching keeps magnitude for visuals.
        if (phaseRef.current !== "listening") return;
        vibrateConfirm();
        setPhase("searching");
        const result = await startSearch(mag);
        if (!result) {
          setPhase("error");
          return;
        }
        if (result.status === "matched") setPhase("matched_confirm");
      },
    });

  const { intensity, vibrateSupported } = useBumpHaptics(
    magnitude,
    THRESHOLD,
    phase === "listening",
  );

  const liveBeacon = beaconFromMagnitude(magnitude, THRESHOLD);
  // Soft floor while searching so the beacon stays present after the peak shake.
  const beacon =
    phase === "listening"
      ? liveBeacon
      : phase === "searching"
        ? Math.max(0.32, liveBeacon)
        : 0;

  useEffect(() => {
    if (phase !== "searching" || !bump) return;
    if (bump.status === "matched") setPhase("matched_confirm");
    if (bump.status === "expired") setPhase("expired");
  }, [bump, phase]);

  useEffect(() => {
    if (phase !== "expired") return;
    const first = fallback.incoming[0];
    if (first) {
      setActiveProposal(first);
      setPhase("proposal_incoming");
    }
  }, [fallback.incoming, phase]);

  async function enterMode() {
    const ok = await requestPermission();
    if (!ok && permission === "denied") {
      setPhase("error");
      return;
    }
    resetPeakGate();
    setPhase("listening");
  }

  async function simulateBump() {
    vibrateConfirm();
    setPhase("searching");
    const result = await startSearch(THRESHOLD + 2);
    if (!result) {
      setPhase("error");
      return;
    }
    if (result.status === "matched") setPhase("matched_confirm");
    else if (result.status === "expired") setPhase("expired");
  }

  async function confirm() {
    if (!bump?.sessionId) return;
    setConfirming(true);
    try {
      await api<{ session: Session }>(`/sessions/${bump.sessionId}/confirm`, {
        method: "POST",
      });
      navigate(`/session/${bump.sessionId}`);
    } catch (err) {
      console.error(err);
      setPhase("error");
    } finally {
      setConfirming(false);
    }
  }

  async function leave() {
    await cancel();
    onClose();
  }

  function onPickCandidate(c: BumpCandidate) {
    void fallback.propose(c.bumpId);
  }

  return (
    <div
      className="bump-mode"
      style={{
        ["--bump-beacon" as string]: String(beacon),
      }}
    >
      <div className="bump-beacon" aria-hidden />
      <header className="bump-mode__header">
        <p className="eyebrow">Bump Mode</p>
        <button type="button" className="ghost" onClick={leave}>
          Close
        </button>
      </header>

      <div className="bump-mode__stage">
        <div
          className="energy-ring"
          style={{
            ["--intensity" as string]: String(
              phase === "listening"
                ? intensity
                : phase === "searching"
                  ? 0.4
                  : 0.15,
            ),
          }}
        />
        <div className="bump-mode__copy">
          {phase === "idle" && (
            <>
              <h1>Ready when you are</h1>
              <p>
                Enter bump mode, then shake phones together. Motion permission
                is requested on this tap. No location prompt.
              </p>
            </>
          )}
          {phase === "listening" && (
            <>
              <h1>Listening</h1>
              <p>
                Shake harder: intensity {Math.round(intensity * 100)}%
                {vibrateSupported
                  ? " · haptics on"
                  : " · visual only on this device"}
              </p>
            </>
          )}
          {phase === "searching" && (
            <>
              <h1>Searching</h1>
              <p>Looking for a nearby bump…</p>
            </>
          )}
          {phase === "matched_confirm" && bump?.peer && (
            <>
              <h1>Connect with {bump.peer.displayName}?</h1>
              <p>Confirm to open your shared session.</p>
            </>
          )}
          {phase === "expired" && (
            <>
              <h1>Was this you?</h1>
              <p>
                Auto-match missed. Tap an anonymous nearby avatar if you see
                who you meant to bump, or try again.
              </p>
              {fallback.candidates.length > 0 ? (
                <div className="bump-candidate-grid" role="list">
                  {fallback.candidates.map((c) => (
                    <AnonymousAvatar
                      key={c.bumpId}
                      avatarUrl={c.avatarUrl}
                      selected={fallback.proposedIds.has(c.bumpId)}
                      disabled={
                        fallback.proposingId != null ||
                        fallback.proposedIds.has(c.bumpId)
                      }
                      label={
                        fallback.proposedIds.has(c.bumpId)
                          ? "Proposal sent"
                          : "Propose bump"
                      }
                      onClick={() => onPickCandidate(c)}
                    />
                  ))}
                </div>
              ) : (
                <p className="bump-candidate-empty">No nearby candidates yet.</p>
              )}
              {fallback.proposingId && (
                <p className="bump-fallback-status">Sending…</p>
              )}
              {fallback.proposedIds.size > 0 && !fallback.proposingId && (
                <p className="bump-fallback-status">
                  Waiting for them to confirm…
                </p>
              )}
              {(fallback.error || error) && (
                <p className="bump-fallback-error">
                  {fallback.error ?? error}
                </p>
              )}
            </>
          )}
          {phase === "proposal_incoming" && activeProposal && (
            <>
              <h1>Was this you?</h1>
              <p>Someone nearby thinks they bumped you.</p>
              <div className="bump-incoming-avatar">
                <AnonymousAvatar
                  avatarUrl={activeProposal.fromAvatarUrl ?? null}
                  label="Incoming bump proposal"
                />
              </div>
              {(fallback.error || error) && (
                <p className="bump-fallback-error">
                  {fallback.error ?? error}
                </p>
              )}
            </>
          )}
          {phase === "error" && (
            <>
              <h1>Something went wrong</h1>
              <p>{error ?? "Check motion permission or try simulate bump."}</p>
            </>
          )}
        </div>
      </div>

      <div className="bump-mode__actions">
        {phase === "idle" && (
          <button type="button" className="primary" onClick={enterMode}>
            Start listening
          </button>
        )}
        {phase === "listening" && (
          <button type="button" className="secondary" onClick={simulateBump}>
            Simulate bump
          </button>
        )}
        {phase === "matched_confirm" && (
          <button
            type="button"
            className="primary"
            disabled={confirming}
            onClick={confirm}
          >
            {confirming ? "Opening…" : "Confirm connection"}
          </button>
        )}
        {phase === "proposal_incoming" && activeProposal && (
          <>
            <button
              type="button"
              className="primary"
              disabled={fallback.acting}
              onClick={() => void fallback.accept(activeProposal.id)}
            >
              {fallback.acting ? "…" : "Yes, that was me"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={fallback.acting}
              onClick={async () => {
                await fallback.reject(activeProposal.id);
                setActiveProposal(null);
                setPhase("expired");
              }}
            >
              No
            </button>
          </>
        )}
        {(phase === "expired" || phase === "error") && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              resetPeakGate();
              setActiveProposal(null);
              setPhase("listening");
            }}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
