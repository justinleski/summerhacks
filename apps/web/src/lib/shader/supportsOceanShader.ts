/** Tiny, always-static feature check — kept separate from oceanShader.ts so this
 * check never pulls the actual shader/GLSL code into any bundle. */
export function supportsOceanShader(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  try {
    const testCanvas = document.createElement("canvas");
    return Boolean(testCanvas.getContext("webgl2"));
  } catch {
    return false;
  }
}
