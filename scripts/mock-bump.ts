import { getStore } from "../apps/api/src/db/index.js";

async function main() {
  const store = getStore();
  const geo = {
    city: "TestCity",
    region: "TC",
    country: "US",
    latitude: 40.7,
    longitude: -74.0,
  };

  const a = await store.bootstrapUser({
    displayName: "MockAlice",
    deviceId: "mock-a",
  });
  const b = await store.bootstrapUser({
    displayName: "MockBob",
    deviceId: "mock-b",
  });
  const now = new Date();
  const expiresAt = new Date(Date.now() + 8000);
  const stamp = Date.now();

  const bumpA = await store.createBump({
    userId: a.id,
    clientTimestamp: now,
    peakMagnitude: 18.5,
    idempotencyKey: `mock-bump-a-${stamp}`,
    geo,
    expiresAt,
  });
  const bumpB = await store.createBump({
    userId: b.id,
    clientTimestamp: now,
    peakMagnitude: 19.2,
    idempotencyKey: `mock-bump-b-${stamp}`,
    geo,
    expiresAt,
  });

  const matchA = await store.tryMatchBump(bumpA.id);
  const matchB = await store.tryMatchBump(bumpB.id);

  console.log(
    JSON.stringify(
      {
        store: process.env.DATABASE_URL ? "neon" : "memory",
        alice: {
          userId: a.id,
          bump: matchA.bump.status,
          sessionId: matchA.bump.sessionId,
          peer: matchA.peer?.displayName ?? null,
        },
        bob: {
          userId: b.id,
          bump: matchB.bump.status,
          sessionId: matchB.bump.sessionId,
          peer: matchB.peer?.displayName ?? null,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
