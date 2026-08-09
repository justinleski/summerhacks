/**
 * Deterministic pseudo-randomness keyed off a memory id, so a given memory
 * always tears, tilts and barcodes the same way — decorative only, never used
 * for anything that needs real entropy.
 */

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

/** Linear congruential generator returning values in [0, 1). */
export function seededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** Tilt in degrees, evenly spread across [-maxDegrees, maxDegrees]. */
export function seededTilt(seed: string, maxDegrees: number): number {
  const value = seededRandom(seed)() * 2 - 1;
  return Math.round(value * maxDegrees * 10) / 10;
}
