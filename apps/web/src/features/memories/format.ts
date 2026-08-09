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

/** First word of a display name — `"Ada Lovelace"` becomes `"Ada"`. */
export function firstNameOf(displayName: string): string {
  return displayName.trim().split(" ")[0] ?? displayName;
}

export function firstNamesOf(displayNames: string[]): string[] {
  return displayNames.map(firstNameOf);
}

/**
 * What to call a memory. Falls back to the members' first names when nobody
 * named it: `Ada & Grace` for a pair, `Ada + 2` for a bigger group.
 *
 * Returned in natural case — the receipt title uppercases in CSS, while the
 * list cards want it as written.
 */
export function memoryHeadline(
  title: string | null,
  displayNames: string[],
): string {
  if (title?.trim()) return title.trim();

  const names = firstNamesOf(displayNames);
  if (names.length === 0) return "A memory";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]} + ${names.length - 1}`;
}

/** Short, atmospheric stand-in for the full permalink. */
export function shortMemoryId(memoryId: string): string {
  return memoryId.replace(/-/g, "").slice(0, 8);
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
