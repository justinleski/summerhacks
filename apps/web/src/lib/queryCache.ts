import {
  LOCKED_MEMORY_CACHE_TTL_MS,
  OPEN_READ_CACHE_TTL_MS,
} from "@summerhacks/shared";

type Entry<T> = { value: T; expiresAt: number };

const memory = new Map<string, Entry<unknown>>();

const LOCKED_PREFIX = "summerhacks.cache.memory.locked.";
const LIST_KEY = "summerhacks.cache.memories.list";

function now(): number {
  return Date.now();
}

function readLocal<T>(storageKey: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || typeof parsed.expiresAt !== "number") return null;
    if (now() >= parsed.expiresAt) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal<T>(storageKey: string, value: T, ttlMs: number): void {
  try {
    const entry: Entry<T> = { value, expiresAt: now() + ttlMs };
    localStorage.setItem(storageKey, JSON.stringify(entry));
  } catch {
    // Quota / private mode — memory cache still works.
  }
}

function removeLocal(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

export const clientCacheKeys = {
  sessions: () => "sessions:list",
  session: (id: string) => `session:${id}`,
  covers: (sessionId: string) => `covers:${sessionId}`,
  memoryBySession: (sessionId: string) => `memory:session:${sessionId}`,
  memoryById: (id: string) => `memory:id:${id}`,
  memoriesList: () => "memories:list",
};

/** Read from in-memory Map; for locked memory ids also check localStorage. */
export function getCached<T>(key: string): T | undefined {
  const entry = memory.get(key);
  if (entry) {
    if (now() < entry.expiresAt) return entry.value as T;
    memory.delete(key);
  }

  if (key.startsWith("memory:id:")) {
    const id = key.slice("memory:id:".length);
    const local = readLocal<T>(LOCKED_PREFIX + id);
    if (local) {
      memory.set(key, local);
      return local.value;
    }
  }

  if (key === clientCacheKeys.memoriesList()) {
    const local = readLocal<T>(LIST_KEY);
    if (local) {
      memory.set(key, local);
      return local.value;
    }
  }

  return undefined;
}

export function setCached<T>(
  key: string,
  value: T,
  ttlMs: number,
  opts?: { persistLocked?: boolean },
): void {
  if (ttlMs <= 0) return;
  const entry: Entry<T> = { value, expiresAt: now() + ttlMs };
  memory.set(key, entry);

  if (opts?.persistLocked && key.startsWith("memory:id:")) {
    writeLocal(LOCKED_PREFIX + key.slice("memory:id:".length), value, ttlMs);
  }
  if (opts?.persistLocked && key === clientCacheKeys.memoriesList()) {
    writeLocal(LIST_KEY, value, ttlMs);
  }
}

export function invalidate(key: string): void {
  memory.delete(key);
  if (key.startsWith("memory:id:")) {
    removeLocal(LOCKED_PREFIX + key.slice("memory:id:".length));
  }
  if (key === clientCacheKeys.memoriesList()) {
    removeLocal(LIST_KEY);
  }
}

export function invalidatePrefix(prefix: string): void {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  if (prefix.startsWith("memory:id:") || prefix === "memory:") {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(LOCKED_PREFIX)) toRemove.push(k);
      }
      for (const k of toRemove) localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
}

/** Invalidate open album / session reads after a local mutation. */
export function invalidateOpenAlbum(sessionId: string, memoryId?: string): void {
  invalidate(clientCacheKeys.covers(sessionId));
  invalidate(clientCacheKeys.memoryBySession(sessionId));
  invalidate(clientCacheKeys.session(sessionId));
  if (memoryId) invalidate(clientCacheKeys.memoryById(memoryId));
}

export const OPEN_TTL = OPEN_READ_CACHE_TTL_MS;
export const LOCKED_TTL = LOCKED_MEMORY_CACHE_TTL_MS;
/** Locked list is cheaper to refresh than detail — 1 hour in memory + localStorage. */
export const LOCKED_LIST_TTL_MS = 60 * 60 * 1000;
