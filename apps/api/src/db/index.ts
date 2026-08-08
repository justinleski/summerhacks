import { createMemoryStore } from "./memory-store.js";
import { createNeonStore } from "./neon-store.js";
import type { Store } from "./types.js";

let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  const url = process.env.DATABASE_URL;
  if (url) {
    store = createNeonStore(url);
  } else {
    store = createMemoryStore();
    console.info(
      "[api] DATABASE_URL unset — using in-memory store (fine for local MVP)",
    );
  }
  return store;
}
