import { describe, expect, it } from "vitest";
import { seededRandom, seededTilt } from "./deterministic";

describe("seededRandom", () => {
  it("is deterministic for the same seed", () => {
    const a = seededRandom("memory-1");
    const b = seededRandom("memory-1");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("returns values in [0, 1)", () => {
    const rand = seededRandom("x");
    for (let i = 0; i < 5; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("seededTilt", () => {
  it("stays within ±maxDegrees", () => {
    expect(Math.abs(seededTilt("tilt-seed", 4))).toBeLessThanOrEqual(4);
  });
});
