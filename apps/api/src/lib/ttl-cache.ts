/**
 * Tiny in-process TTL cache for warm serverless / local instances.
 * Not shared across isolates — pair with mutation invalidation + short TTLs.
 */

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache {
  private readonly store = new Map<string, Entry<unknown>>();
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // LRU touch
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return;
    while (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deletePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }
}

/** Shared process cache for session / album / memory GET payloads. */
export const readCache = new TtlCache(500);

export const cacheKeys = {
  session: (id: string) => `session:${id}`,
  sessionsUser: (userId: string) => `sessions:user:${userId}`,
  covers: (sessionId: string, viewerId: string) =>
    `covers:${sessionId}:${viewerId}`,
  coversPrefix: (sessionId: string) => `covers:${sessionId}:`,
  memoryBySession: (sessionId: string, viewerId: string) =>
    `memory:session:${sessionId}:${viewerId}`,
  memoryBySessionPrefix: (sessionId: string) => `memory:session:${sessionId}:`,
  memoryById: (memoryId: string, viewerId: string) =>
    `memory:id:${memoryId}:${viewerId}`,
  memoryByIdPrefix: (memoryId: string) => `memory:id:${memoryId}:`,
  lockedList: (userId: string) => `memories:locked:${userId}`,
};

export function invalidateSessionReads(
  sessionId: string,
  memberUserIds?: string[],
): void {
  readCache.delete(cacheKeys.session(sessionId));
  readCache.deletePrefix(cacheKeys.coversPrefix(sessionId));
  readCache.deletePrefix(cacheKeys.memoryBySessionPrefix(sessionId));
  if (memberUserIds) {
    for (const uid of memberUserIds) {
      readCache.delete(cacheKeys.sessionsUser(uid));
      readCache.delete(cacheKeys.lockedList(uid));
    }
  }
}

export function invalidateMemoryReads(
  memoryId: string,
  sessionId: string,
  memberUserIds?: string[],
): void {
  readCache.deletePrefix(cacheKeys.memoryByIdPrefix(memoryId));
  readCache.deletePrefix(cacheKeys.memoryBySessionPrefix(sessionId));
  if (memberUserIds) {
    for (const uid of memberUserIds) {
      readCache.delete(cacheKeys.lockedList(uid));
    }
  }
}
