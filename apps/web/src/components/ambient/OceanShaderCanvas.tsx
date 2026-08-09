import { useEffect, useRef, useState } from "react";
import { supportsOceanShader } from "../../lib/shader/supportsOceanShader";

/**
 * Selective, high-fidelity ambient shader for a couple of low-interactivity "moment"
 * pages (landing hero, post-bump session). Feature-detects WebGL2 + prefers-reduced-motion
 * before ever loading the shader module; renders nothing if unsupported, silently leaving
 * the always-present CSS AmbientBackground (rendered behind this) as the fallback.
 */
export function OceanShaderCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supportsOceanShader()) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    import("../../lib/shader/oceanShader").then(({ mountOceanShader }) => {
      if (cancelled || !canvasRef.current) return;
      const styles = getComputedStyle(document.documentElement);
      try {
        cleanup = mountOceanShader(canvasRef.current, {
          colorA: styles.getPropertyValue("--bg1").trim() || "#0d1526",
          colorB: styles.getPropertyValue("--glow-1").trim() || "#6ea8ff",
          colorC: styles.getPropertyValue("--iris-2").trim() || "#d8c2ff",
        });
        setReady(true);
      } catch {
        // WebGL init failed despite feature detection passing — leave the
        // always-present CSS AmbientBackground as-is, no further action needed.
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`ocean-shader-canvas${ready ? " ocean-shader-canvas--ready" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    />
  );
}
