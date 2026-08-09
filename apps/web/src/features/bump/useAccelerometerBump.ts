import { useEffect, useRef, useState } from "react";

export type MotionPermissionState = "unknown" | "granted" | "denied" | "unsupported";

type DeviceMotionPermission = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export function useAccelerometerBump(opts: {
  enabled: boolean;
  threshold?: number;
  onPeak: (magnitude: number) => void;
}) {
  const threshold = opts.threshold ?? 16;
  const [magnitude, setMagnitude] = useState(0);
  const [permission, setPermission] =
    useState<MotionPermissionState>("unknown");
  const peakedRef = useRef(false);
  const onPeakRef = useRef(opts.onPeak);
  onPeakRef.current = opts.onPeak;

  async function requestPermission() {
    const DM = DeviceMotionEvent as unknown as DeviceMotionPermission;
    if (typeof DM.requestPermission === "function") {
      try {
        const result = await DM.requestPermission();
        setPermission(result === "granted" ? "granted" : "denied");
        return result === "granted";
      } catch {
        setPermission("denied");
        return false;
      }
    }
    setPermission("granted");
    return true;
  }

  useEffect(() => {
    if (!opts.enabled) {
      setMagnitude(0);
      peakedRef.current = false;
      return;
    }

    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      setPermission("unsupported");
      return;
    }

    const handler = (event: DeviceMotionEvent) => {
      const ax = event.accelerationIncludingGravity?.x ?? 0;
      const ay = event.accelerationIncludingGravity?.y ?? 0;
      const az = event.accelerationIncludingGravity?.z ?? 0;
      const mag = Math.sqrt(ax * ax + ay * ay + az * az);
      setMagnitude(mag);
      if (!peakedRef.current && mag >= threshold) {
        peakedRef.current = true;
        onPeakRef.current(mag);
      }
    };

    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }, [opts.enabled, threshold]);

  function resetPeakGate() {
    peakedRef.current = false;
  }

  return { magnitude, permission, requestPermission, resetPeakGate };
}
