const THEME_KEY = "summerhacks.theme";

export type ThemeMode = "dark" | "light";

/** Light is the default: it's the palette the Memories pages are designed for. */
export function getTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "light";
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
}

export function setTheme(mode: ThemeMode) {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
}

export function initTheme() {
  applyTheme(getTheme());
}
