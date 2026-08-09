import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { PixelGridSize } from "@summerhacks/shared";
import { emptyPixelGrid } from "@summerhacks/shared";

const EXPORT_SCALE = 16;

/** Classic-ish 8-bit palette + transparent (index 0 = eraser). */
export const PIXEL_PALETTE = [
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

export function rasterizePixelsToPng(
  pixels: (string | null)[],
  gridSize: PixelGridSize,
  filename: string,
): Promise<File> {
  const size = gridSize * EXPORT_SCALE;
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
    const x = (i % gridSize) * EXPORT_SCALE;
    const y = Math.floor(i / gridSize) * EXPORT_SCALE;
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
        resolve(new File([blob], filename, { type: "image/png" }));
      },
      "image/png",
    );
  });
}

export type PixelCanvasEditorProps = {
  open: boolean;
  gridSize?: PixelGridSize;
  initialPixels?: (string | null)[] | null;
  /** Controlled pixels — when set, parent owns state (collab). */
  pixels?: (string | null)[];
  onPixelsChange?: (pixels: (string | null)[]) => void;
  /** Fired on each paint stroke cell (for live broadcast). */
  onPaintCell?: (index: number, color: string | null) => void;
  busy?: boolean;
  readOnly?: boolean;
  title?: string;
  eyebrow?: string;
  hint?: string;
  statusSlot?: ReactNode;
  onCancel: () => void;
  onSave: (file: File, pixels: (string | null)[]) => Promise<void>;
  saveLabel?: string;
};

export function PixelCanvasEditor({
  open,
  gridSize = 16,
  initialPixels = null,
  pixels: controlledPixels,
  onPixelsChange,
  onPaintCell,
  busy = false,
  readOnly = false,
  title = "Pixel canvas",
  eyebrow = "Draw",
  hint,
  statusSlot,
  onCancel,
  onSave,
  saveLabel = "Save",
}: PixelCanvasEditorProps) {
  const controlled = controlledPixels !== undefined;
  const [localPixels, setLocalPixels] = useState<(string | null)[]>(() =>
    initialPixels?.length === gridSize * gridSize
      ? initialPixels.slice()
      : emptyPixelGrid(gridSize),
  );
  const pixels = controlled ? controlledPixels! : localPixels;

  const setPixels = useCallback(
    (updater: (prev: (string | null)[]) => (string | null)[]) => {
      if (controlled) {
        onPixelsChange?.(updater(controlledPixels!));
      } else {
        setLocalPixels((prev) => {
          const next = updater(prev);
          onPixelsChange?.(next);
          return next;
        });
      }
    },
    [controlled, controlledPixels, onPixelsChange],
  );

  const [color, setColor] = useState<string>(PIXEL_PALETTE[6]!);
  const [tool, setTool] = useState<Tool>("paint");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const painting = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (!controlled) {
      setLocalPixels(
        initialPixels?.length === gridSize * gridSize
          ? initialPixels.slice()
          : emptyPixelGrid(gridSize),
      );
    }
    setColor(PIXEL_PALETTE[6]!);
    setTool("paint");
    setError(null);
    setSaving(false);
  }, [open, gridSize, initialPixels, controlled]);

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
      if (readOnly) return;
      const value = tool === "erase" ? null : color;
      setPixels((prev) => {
        if (prev[index] === value) return prev;
        const next = prev.slice();
        next[index] = value;
        return next;
      });
      onPaintCell?.(index, value);
    },
    [tool, color, setPixels, onPaintCell, readOnly],
  );

  function cellFromEvent(
    e: ReactPointerEvent<HTMLDivElement>,
  ): number | null {
    const gridEl = e.currentTarget;
    const rect = gridEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const col = Math.min(gridSize - 1, Math.floor((x / rect.width) * gridSize));
    const row = Math.min(gridSize - 1, Math.floor((y / rect.height) * gridSize));
    return row * gridSize + col;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (saving || busy || readOnly) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    painting.current = true;
    const idx = cellFromEvent(e);
    if (idx !== null) paintAt(idx);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!painting.current || saving || busy || readOnly) return;
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

  function eraseCanvas() {
    if (saving || busy || readOnly) return;
    const next = emptyPixelGrid(gridSize);
    if (controlled) onPixelsChange?.(next);
    else setLocalPixels(next);
  }

  async function save() {
    if (saving || busy || readOnly) return;
    setSaving(true);
    setError(null);
    try {
      const file = await rasterizePixelsToPng(
        pixels,
        gridSize,
        "pixel-cover.png",
      );
      await onSave(file, pixels);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  if (!open) return null;

  const locked = saving || busy;
  const canvasStyle = {
    "--pixel-grid": gridSize,
  } as CSSProperties;

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
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="pixel-editor-title">{title}</h2>
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

        {hint && <p className="muted pixel-editor__hint">{hint}</p>}
        {statusSlot}
        {error && <p className="error">{error}</p>}

        <div
          className="pixel-editor__canvas"
          style={canvasStyle}
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

        {!readOnly && (
          <>
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

            <div
              className="pixel-editor__palette"
              role="listbox"
              aria-label="Colors"
            >
              {PIXEL_PALETTE.map((swatch, i) => {
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
                    aria-label={
                      isTransparent ? "Transparent / eraser" : swatch
                    }
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
          </>
        )}

        <footer className="pixel-editor__actions">
          {!readOnly ? (
            <button
              type="button"
              className="ghost"
              disabled={locked}
              onClick={eraseCanvas}
            >
              Erase canvas
            </button>
          ) : (
            <span />
          )}
          <div className="pixel-editor__actions-right">
            <button
              type="button"
              className="secondary"
              disabled={locked}
              onClick={onCancel}
            >
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly && (
              <button
                type="button"
                className="primary"
                disabled={locked}
                onClick={() => void save()}
              >
                {locked ? "Saving…" : saveLabel}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
