import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useIsAuthenticated } from "../../lib/api";
import { useAmbientLevel } from "../../lib/ambient";
import { StarGlyph } from "./StarGlyph";

const LINKS = [
  { to: "/friends", label: "Friends" },
  { to: "/calendar", label: "Calendar" },
  { to: "/map", label: "Map" },
  { to: "/explore", label: "Explore" },
  { to: "/profile", label: "Profile" },
];

export function StarNav() {
  const authed = useIsAuthenticated();
  const ambientLevel = useAmbientLevel();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Hidden on the guest landing screen and during focused flows (Bump sets ambient to "off").
  if (!authed || ambientLevel === "off") return null;

  return (
    <div className="star-nav">
      <button
        ref={triggerRef}
        type="button"
        className="star-nav__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="star-nav-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <StarGlyph size={22} />
      </button>
      {open && (
        <div
          id="star-nav-panel"
          role="menu"
          className="star-nav__panel"
          ref={panelRef}
        >
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              role="menuitem"
              className="star-nav__link"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
