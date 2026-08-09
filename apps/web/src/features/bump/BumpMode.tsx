import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@summerhacks/shared";
import { api } from "../../lib/api";
import { useAmbientIntensity } from "../../lib/ambient";
import { useAccelerometerBump } from "./useAccelerometerBump";
import { useBumpHaptics, vibrateConfirm } from "./useBumpHaptics";
import { useBumpSearch } from "./useBumpSearch";

type Phase =
  | "idle"
  | "listening"
  | "searching"
  | "matched_confirm"
  | "expired"
  | "error";

const THRESHOLD = 16;

export function BumpMode({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  useAmbientIntensity("off");
  const [phase, setPhase] = useState<Phase>("idle");
  const { bump, error, startSearch, cancel } = useBumpSearch();
  const [confirming, setConfirming] = useState(false);

  const { magnitude, permission, requestPermission, resetPeakGate } =
    useAccelerometerBump({
      enabled: phase === "listening",
      threshold: THRESHOLD,
      onPeak: async (mag) => {
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

  useEffect(() => {
    if (phase !== "searching" || !bump) return;
    if (bump.status === "matched") setPhase("matched_confirm");
    if (bump.status === "expired") setPhase("expired");
  }, [bump, phase]);

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

  return (
    <div className="bump-mode">
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
                Shake harder — intensity {Math.round(intensity * 100)}%
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
              <h1>No match</h1>
              <p>The bump window expired. Try again with the other phone.</p>
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
        {(phase === "expired" || phase === "error") && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              resetPeakGate();
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
