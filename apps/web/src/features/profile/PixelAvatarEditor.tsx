import { PixelCanvasEditor } from "../pixel/PixelCanvasEditor";

type PixelAvatarEditorProps = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onSave: (file: File) => Promise<void>;
};

export function PixelAvatarEditor({
  open,
  busy = false,
  onCancel,
  onSave,
}: PixelAvatarEditorProps) {
  return (
    <PixelCanvasEditor
      open={open}
      gridSize={16}
      busy={busy}
      eyebrow="Avatar"
      title="Pixel avatar"
      hint="16×16 · paint or erase · Save uploads a PNG avatar."
      onCancel={onCancel}
      onSave={async (file) => {
        await onSave(file);
      }}
      saveLabel="Save"
    />
  );
}
