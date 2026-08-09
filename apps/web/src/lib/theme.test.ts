import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTheme, setTheme } from "./theme";

function mockLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  });
  return store;
}

describe("theme", () => {
  beforeEach(() => {
    mockLocalStorage();
    vi.stubGlobal("document", {
      documentElement: { dataset: {} as Record<string, string> },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to dark when unset", () => {
    expect(getTheme()).toBe("dark");
  });

  it("persists light via setTheme", () => {
    setTheme("light");
    expect(getTheme()).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
