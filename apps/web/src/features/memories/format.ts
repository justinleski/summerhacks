/** `HH:MM:SS`, clamped at zero so an expired window never shows negatives. */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** `Aug 9, 2026` */
export function formatMemoryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** `Aug 9, 2026 · 4:05 PM` */
export function formatHangoutStamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatMemoryDate(iso)} · ${time}`;
}

export function joinNames(names: string[], separator = ", "): string {
  return names.join(separator);
}

export function initialsOf(names: string[]): string {
  return (
    names
      .map((n) => n.trim().slice(0, 1).toUpperCase())
      .filter(Boolean)
      .slice(0, 3)
      .join("") || "?"
  );
}
