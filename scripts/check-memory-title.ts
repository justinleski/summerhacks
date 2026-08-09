/**
 * End-to-end check for the memory title field against the in-memory store.
 * Exercises the PATCH /api/memories/:id/title route, its Zod bounds and both
 * guards (member-only, open-only), plus that the title surfaces on the draft,
 * the locked receipt payload and the list item.
 *
 * Run with: npx tsx scripts/check-memory-title.ts
 */
import app from "../apps/api/src/app.js";
import { getStore } from "../apps/api/src/db/index.js";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "pass" : "FAIL"}  ${label}` +
      (ok ? "" : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

async function call(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const res = await app.fetch(
    new Request(`http://local/api${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    }),
  );
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // leave raw
  }
  return { status: res.status, body };
}

async function main() {
  const store = getStore();
  const geo = { city: "T", region: "T", country: "US", latitude: 0, longitude: 0 };

  const alice = await store.bootstrapUser({
    displayName: "Alice Anderson",
    deviceId: "t-a",
  });
  const bob = await store.bootstrapUser({
    displayName: "Bob Brown",
    deviceId: "t-b",
  });
  const carol = await store.bootstrapUser({
    displayName: "Carol Clark",
    deviceId: "t-c",
  });

  const now = new Date();
  const expiresAt = new Date(Date.now() + 60_000);
  const bumpA = await store.createBump({
    userId: alice.id,
    clientTimestamp: now,
    peakMagnitude: 18,
    idempotencyKey: "t-a-1",
    geo,
    expiresAt,
  });
  const bumpB = await store.createBump({
    userId: bob.id,
    clientTimestamp: now,
    peakMagnitude: 19,
    idempotencyKey: "t-b-1",
    geo,
    expiresAt,
  });
  await store.tryMatchBump(bumpA.id);
  const matched = await store.tryMatchBump(bumpB.id);
  const sessionId = matched.bump.sessionId!;

  const draft = await call(`/memories/session/${sessionId}`, alice.id);
  const memoryId: string = draft.body.memory.id;
  check("draft starts with a null title", draft.body.memory.title, null);

  // --- happy path ---
  const set = await call(`/memories/${memoryId}/title`, alice.id, {
    method: "PATCH",
    body: JSON.stringify({ title: "  Lighthouse night  " }),
  });
  check("PATCH title -> 200", set.status, 200);
  check("title is trimmed", set.body.title, "Lighthouse night");

  const reread = await call(`/memories/session/${sessionId}`, bob.id);
  check(
    "peer sees the shared title",
    reread.body.memory.title,
    "Lighthouse night",
  );

  // --- any member may edit, last write wins (same as note) ---
  const byBob = await call(`/memories/${memoryId}/title`, bob.id, {
    method: "PATCH",
    body: JSON.stringify({ title: "Bob renamed it" }),
  });
  check("any member can rename -> 200", byBob.status, 200);
  check("last write wins", byBob.body.title, "Bob renamed it");

  // --- clearing ---
  const cleared = await call(`/memories/${memoryId}/title`, alice.id, {
    method: "PATCH",
    body: JSON.stringify({ title: "   " }),
  });
  check("whitespace-only clears to null", cleared.body.title, null);

  const nulled = await call(`/memories/${memoryId}/title`, alice.id, {
    method: "PATCH",
    body: JSON.stringify({ title: null }),
  });
  check("explicit null accepted", nulled.status, 200);

  // --- Zod bounds ---
  const at40 = await call(`/memories/${memoryId}/title`, alice.id, {
    method: "PATCH",
    body: JSON.stringify({ title: "x".repeat(40) }),
  });
  check("40 chars accepted", at40.status, 200);

  const at41 = await call(`/memories/${memoryId}/title`, alice.id, {
    method: "PATCH",
    body: JSON.stringify({ title: "x".repeat(41) }),
  });
  check("41 chars rejected -> 400", at41.status, 400);

  // --- guard: non-member ---
  const outsider = await call(`/memories/${memoryId}/title`, carol.id, {
    method: "PATCH",
    body: JSON.stringify({ title: "nope" }),
  });
  check("non-member -> 403", outsider.status, 403);

  // Restore a real title before locking so we can assert it survives.
  await call(`/memories/${memoryId}/title`, alice.id, {
    method: "PATCH",
    body: JSON.stringify({ title: "Lighthouse night" }),
  });

  // --- guard: locked memories cannot be renamed ---
  for (const user of [alice, bob]) {
    for (let position = 0; position < 3; position++) {
      await store.upsertMemorySong(memoryId, user.id, position, {
        spotifyUrl: `https://open.spotify.com/track/${user.id}${position}`,
        spotifyTrackId: `${user.id}${position}`,
        trackTitle: `Track ${position}`,
        artistName: "Someone",
        albumArtUrl: null,
      });
    }
    await store.addMemoryPhoto(memoryId, user.id, "https://x.test/1.jpg");
    await store.addMemoryPhoto(memoryId, user.id, "https://x.test/2.jpg");
  }

  await call(`/memories/${memoryId}/submit`, alice.id, {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
  const lock = await call(`/memories/${memoryId}/submit`, bob.id, {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
  check("second submit locks the memory", lock.body.memory.status, "locked");
  check(
    "title survives the lock onto the receipt payload",
    lock.body.memory.title,
    "Lighthouse night",
  );

  const afterLock = await call(`/memories/${memoryId}/title`, alice.id, {
    method: "PATCH",
    body: JSON.stringify({ title: "too late" }),
  });
  check("rename after lock -> 409", afterLock.status, 409);

  const list = await call("/memories", alice.id);
  check(
    "list item carries the title",
    list.body.memories[0]?.title,
    "Lighthouse night",
  );

  console.log(
    failures === 0
      ? "\nAll memory-title checks passed."
      : `\n${failures} check(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
