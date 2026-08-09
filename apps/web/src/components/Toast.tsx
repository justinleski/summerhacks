import { useEffect } from "react";

type ToastProps = {
  message: string | null;
  onDone: () => void;
  durationMs?: number;
};

export function Toast({ message, onDone, durationMs = 2800 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDone, durationMs);
    return () => window.clearTimeout(id);
  }, [message, onDone, durationMs]);

  if (!message) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
