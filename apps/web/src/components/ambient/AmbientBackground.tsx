import { useAmbientLevel } from "../../lib/ambient";
import { StarGlyph } from "../nav/StarGlyph";

/** Fixed, full-viewport, non-interactive "oceans and light" background layer — mounted once in AppShell. */
export function AmbientBackground() {
  const level = useAmbientLevel();
  if (level === "off") return null;

  return (
    <div
      className={`ambient-bg${level === "static" ? " ambient-bg--static" : ""}`}
      aria-hidden="true"
    >
      <div className="ambient-orb ambient-orb--1" />
      <div className="ambient-orb ambient-orb--2" />
      <div className="ambient-orb ambient-orb--3" />
      <div className="ambient-sparkle" />
      <StarGlyph className="ambient-flare ambient-flare--1" size={90} />
      <StarGlyph className="ambient-flare ambient-flare--2" size={56} />
    </div>
  );
}
