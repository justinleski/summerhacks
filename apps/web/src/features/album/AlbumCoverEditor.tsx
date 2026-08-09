import { useCallback, useEffect, useRef, useState } from "react";
import type { AlbumCover, PixelGridSize } from "@summerhacks/shared";
import { emptyPixelGrid } from "@summerhacks/shared";
import { api, uploadAlbumCover } from "../../lib/api";
import { PixelCanvasEditor } from "../pixel/PixelCanvasEditor";

type AlbumCoverEditorProps = {
  sessionId: string;
  album: AlbumCover;
  open: boolean;
  onClose: () => void;
  onAlbumUpdated: (album: AlbumCover) => void;
};

function formatRemaining(editableUntil: string): string {
  const ms = new Date(editableUntil).getTime() - Date.now();
  if (ms <= 0) return "locked";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left to edit`;
  return `${Math.max(1, m)}m left to edit`;
}

export function AlbumCoverEditor({
  sessionId,
  album,
  open,
  onClose,
  onAlbumUpdated,
}: AlbumCoverEditorProps) {
  const gridSize: PixelGridSize = album.gridSize === 32 ? 32 : 16;
  const [pixels, setPixels] = useState<(string | null)[]>(() =>
    album.pixels.length === gridSize * gridSize
      ? album.pixels.slice()
      : emptyPixelGrid(gridSize),
  );
  const [busy, setBusy] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setPixels(
      album.pixels.length === gridSize * gridSize
        ? album.pixels.slice()
        : emptyPixelGrid(gridSize),
    );
  }, [open, album.id, album.updatedAt, album.pixels, gridSize]);

  const persistPixels = useCallback(
    async (next: (string | null)[]) => {
      try {
        const res = await api<{ album: AlbumCover }>(
          `/sessions/${sessionId}/album`,
          {
            method: "PATCH",
            body: JSON.stringify({ pixels: next }),
          },
        );
        onAlbumUpdated(res.album);
        setPersistError(null);
      } catch (err) {
        setPersistError(
          err instanceof Error ? err.message : "Failed to save pixels",
        );
      }
    },
    [sessionId, onAlbumUpdated],
  );

  const schedulePersist = useCallback(
    (next: (string | null)[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void persistPixels(next);
      }, 1500);
    },
    [persistPixels],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handlePixelsChange(next: (string | null)[]) {
    setPixels(next);
    schedulePersist(next);
  }

  async function handleSave(file: File, finalPixels: (string | null)[]) {
    setBusy(true);
    setPersistError(null);
    try {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const coverUrl = await uploadAlbumCover(file);
      const res = await api<{ album: AlbumCover }>(
        `/sessions/${sessionId}/album`,
        {
          method: "PATCH",
          body: JSON.stringify({ pixels: finalPixels, coverUrl }),
        },
      );
      onAlbumUpdated(res.album);
      onClose();
    } catch (err) {
      setPersistError(err instanceof Error ? err.message : "Save failed");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <PixelCanvasEditor
      open={open}
      gridSize={gridSize}
      pixels={pixels}
      onPixelsChange={handlePixelsChange}
      busy={busy}
      readOnly={!album.editable}
      eyebrow="Your cover"
      title="Draw your cover"
      hint={
        album.editable
          ? `${gridSize}×${gridSize} · ${formatRemaining(album.editableUntil)} · autosaves`
          : album.readyAt
            ? "You marked ready · cover locked"
            : "Edit window ended · cover is locked"
      }
      statusSlot={
        persistError ? <p className="error">{persistError}</p> : null
      }
      onCancel={onClose}
      onSave={handleSave}
      saveLabel="Save cover"
    />
  );
}
