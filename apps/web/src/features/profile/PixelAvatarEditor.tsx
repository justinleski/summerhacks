import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const GRID = 16;
const EXPORT_SCALE = 16; // 16×16 → 256×256 PNG, crisp when scaled down

/** Classic-ish 8-bit palette + transparent (index 0 = eraser). */
const PALETTE = [
  null, // transparent / erase
  "#1a1c2c",
  "#5d275d",
  "#b13e53",
  "#ef7d57",
  "#ffcd75",
  "#a7f070",
  "#38b764",
  "#257179",
  "#29366f",
  "#3b5dc9",
  "#41a6f6",
  "#73eff7",
  "#f4f4f4",
  "#94b0c2",
  "#566c86",
  "#333c57",
] as const;

type Tool = "paint" | "erase";

type PixelAvatarEditorProps = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onSave: (file: File) => Promise<void>;
};

function emptyGrid(): (string | null)[] {
  return Array.from({ length: GRID * GRID }, () => null);
}

function rasterizeToPng(pixels: (string | null)[]): Promise<File> {
  const size = GRID * EXPORT_SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas unavailable"));
  }
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < pixels.length; i++) {
    const color = pixels[i];
    if (!color) continue;
    const x = (i % GRID) * EXPORT_SCALE;
    const y = Math.floor(i / GRID) * EXPORT_SCALE;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, EXPORT_SCALE, EXPORT_SCALE);
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to export PNG"));
          return;
        }
        resolve(
          new File([blob], "pixel-avatar.png", { type: "image/png" }),
        );
      },
      "image/png",
    );
  });
}

export function PixelAvatarEditor({
  open,
  busy = false,
  onCancel,
  onSave,
}: PixelAvatarEditorProps) {
  const [pixels, setPixels] = useState<(string | null)[]>(emptyGrid);
  const [color, setColor] = useState<string>(PALETTE[6]!);
  const [tool, setTool] = useState<Tool>("paint");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const painting = useRef(false);

  useEffect(() => {
    if (!open) return;
    setPixels(emptyGrid());
    setColor(PALETTE[6]!);
    setTool("paint");
    setError(null);
    setSaving(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, saving, busy]);

  const paintAt = useCallback(
    (index: number) => {
      setPixels((prev) => {
        const next = prev.slice();
        const value = tool === "erase" ? null : color;
        if (next[index] === value) return prev;
        next[index] = value;
        return next;
      });
    },
    [tool, color],
  );

  function cellFromEvent(
    e: ReactPointerEvent<HTMLDivElement>,
  ): number | null {
    const gridEl = e.currentTarget;
    const rect = gridEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const col = Math.min(GRID - 1, Math.floor((x / rect.width) * GRID));
    const row = Math.min(GRID - 1, Math.floor((y / rect.height) * GRID));
    return row * GRID + col;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (saving || busy) return;
    e.preventDefault();
    gridElSetPointerCapture(e);
    painting.current = true;
    const idx = cellFromEvent(e);
    if (idx !== null) paintAt(idx);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!painting.current || saving || busy) return;
    const idx = cellFromEvent(e);
    if (idx !== null) paintAt(idx);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    painting.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function gridElSetPointerCapture(e: ReactPointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function eraseCanvas() {
    if (saving || busy) return;
    setPixels(emptyGrid());
  }

  async function save() {
    if (saving || busy) return;
    setSaving(true);
    setError(null);
    try {
      const file = await rasterizeToPng(pixels);
      await onSave(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  if (!open) return null;

  const locked = saving || busy;

  return (
    <div
      className="pixel-editor-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pixel-editor-title"
    >
      <div className="pixel-editor">
        <header className="pixel-editor__head">
          <div>
            <p className="eyebrow">Avatar</p>
            <h2 id="pixel-editor-title">Pixel avatar</h2>
          </div>
          <button
            type="button"
            className="ghost"
            disabled={locked}
            onClick={onCancel}
          >
            Cancel
          </button>
        </header>

        <p className="muted pixel-editor__hint">
          16×16 · paint or erase · Save uploads a PNG like a photo avatar.
        </p>

        {error && <p className="error">{error}</p>}

        <div
          className="pixel-editor__canvas"
          role="img"
          aria-label="Pixel grid"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {pixels.map((cell, i) => (
            <span
              key={i}
              className={
                cell
                  ? "pixel-editor__cell"
                  : "pixel-editor__cell pixel-editor__cell--empty"
              }
              style={cell ? { background: cell } : undefined}
              aria-hidden
            />
          ))}
        </div>

        <div className="pixel-editor__tools">
          <button
            type="button"
            className={tool === "paint" ? "primary" : "secondary"}
            disabled={locked}
            onClick={() => setTool("paint")}
          >
            Paint
          </button>
          <button
            type="button"
            className={tool === "erase" ? "primary" : "secondary"}
            disabled={locked}
            onClick={() => setTool("erase")}
          >
            Erase
          </button>
        </div>

        <div className="pixel-editor__palette" role="listbox" aria-label="Colors">
          {PALETTE.map((swatch, i) => {
            const isTransparent = swatch === null;
            const selected =
              (tool === "erase" && isTransparent) ||
              (tool === "paint" && !isTransparent && color === swatch);
            return (
              <button
                key={i}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={isTransparent ? "Transparent / eraser" : swatch}
                className={
                  isTransparent
                    ? `pixel-swatch pixel-swatch--empty${selected ? " pixel-swatch--active" : ""}`
                    : `pixel-swatch${selected ? " pixel-swatch--active" : ""}`
                }
                style={swatch ? { background: swatch } : undefined}
                disabled={locked}
                onClick={() => {
                  if (isTransparent) {
                    setTool("erase");
                  } else {
                    setTool("paint");
                    setColor(swatch);
                  }
                }}
              />
            );
          })}
        </div>

        <footer className="pixel-editor__actions">
          <button
            type="button"
            className="ghost"
            disabled={locked}
            onClick={eraseCanvas}
          >
            Erase canvas
          </button>
          <div className="pixel-editor__actions-right">
            <button
              type="button"
              className="secondary"
              disabled={locked}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={locked}
              onClick={() => void save()}
            >
              {locked ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
