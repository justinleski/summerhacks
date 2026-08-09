import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientCacheKeys,
  getCached,
  invalidate,
  LOCKED_LIST_TTL_MS,
  OPEN_TTL,
  setCached,
} from "./queryCache";

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
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
  });
}

describe("queryCache", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds stable client keys", () => {
    expect(clientCacheKeys.session("abc")).toBe("session:abc");
    expect(clientCacheKeys.memoriesList()).toBe("memories:list");
  });

  it("round-trips in-memory values until invalidate", () => {
    setCached("sessions:list", [1, 2], OPEN_TTL);
    expect(getCached<number[]>("sessions:list")).toEqual([1, 2]);
    invalidate("sessions:list");
    expect(getCached("sessions:list")).toBeUndefined();
  });

  it("exports a one-hour locked list TTL", () => {
    expect(LOCKED_LIST_TTL_MS).toBe(60 * 60 * 1000);
  });
});
