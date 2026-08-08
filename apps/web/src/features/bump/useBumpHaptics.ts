import { useEffect } from "react";

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Map magnitude toward threshold into haptic pulses (Android) + normalized intensity 0..1 */
export function useBumpHaptics(magnitude: number, threshold: number, enabled: boolean) {
  const intensity = Math.min(1, Math.max(0, (magnitude - 9.5) / Math.max(1, threshold - 9.5)));

  useEffect(() => {
    if (!enabled || !canVibrate()) return;
    if (intensity < 0.15) return;

    const pulse = Math.round(20 + intensity * 60);
    const gap = Math.round(80 - intensity * 50);
    navigator.vibrate([pulse, Math.max(20, gap)]);
  }, [enabled, intensity, magnitude]);

  return { intensity, vibrateSupported: canVibrate() };
}

export function vibrateConfirm() {
  if (canVibrate()) navigator.vibrate([40, 40, 80]);
}
