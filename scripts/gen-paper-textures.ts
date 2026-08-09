/**
 * Generates the two Memories page textures into apps/web/public:
 *
 *   paper-texture-crumpled.png — 512x512 tileable crumpled-paper luminance map,
 *                                consumed as a `multiply` layer on the receipt.
 *   noise.png                  — 256x256 tileable film grain, consumed as a
 *                                `multiply` overlay on the Memory page shells.
 *
 * Both are written as low-bit-depth greyscale PNGs so they stay inside the
 * sprint's size budgets (60kb / 20kb) without a build-time image dependency.
 * Run with: npx tsx scripts/gen-paper-textures.ts
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const OUT_DIR = join(import.meta.dirname, "..", "apps", "web", "public");

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** Paeth predictor from the PNG spec — best filter for smooth gradient data. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Greyscale PNG. `levels` quantises the 0..1 samples; `bitDepth` picks the
 * storage width (1/2/4/8). Sub-byte depths pack multiple pixels per byte,
 * which is what keeps the high-entropy grain image small.
 */
function greyscalePng(
  size: number,
  bitDepth: 1 | 2 | 4 | 8,
  sample: (x: number, y: number) => number,
): Buffer {
  const maxValue = (1 << bitDepth) - 1;
  const perByte = 8 / bitDepth;
  const bytesPerRow = Math.ceil(size / perByte);

  const rows: Buffer[] = [];
  let previous = Buffer.alloc(bytesPerRow);
  for (let y = 0; y < size; y++) {
    const raw = Buffer.alloc(bytesPerRow);
    for (let x = 0; x < size; x++) {
      const v = Math.max(
        0,
        Math.min(maxValue, Math.round(sample(x, y) * maxValue)),
      );
      if (bitDepth === 8) {
        raw[x] = v;
      } else {
        const shift = 8 - bitDepth * ((x % perByte) + 1);
        raw[Math.floor(x / perByte)]! |= v << shift;
      }
    }

    // Paeth-filter each scanline against the previous one.
    const filtered = Buffer.alloc(bytesPerRow + 1);
    filtered[0] = 4;
    for (let i = 0; i < bytesPerRow; i++) {
      const left = i > 0 ? raw[i - 1]! : 0;
      const up = previous[i]!;
      const upLeft = i > 0 ? previous[i - 1]! : 0;
      filtered[i + 1] = (raw[i]! - paeth(left, up, upLeft)) & 0xff;
    }
    rows.push(filtered);
    previous = raw;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = 0; // colour type 0 — greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Tileable value noise ---------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Periodic value noise on a `period x period` lattice. Because lattice lookups
 * wrap with `%`, the result tiles seamlessly at any period that divides the
 * image size.
 */
function makeNoise(period: number, seed: number) {
  const rand = mulberry32(seed);
  const lattice = new Float64Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();

  return (u: number, v: number): number => {
    const fx = u * period;
    const fy = v * period;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const ix = (n: number) => ((n % period) + period) % period;
    const at = (xi: number, yi: number) =>
      lattice[ix(yi) * period + ix(xi)] as number;
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

// --- paper-texture-crumpled.png --------------------------------------------

function writeCrumpledPaper() {
  const SIZE = 512;
  // Ridged octaves carry the crease network; the broad octaves shade the facets
  // the creases fold the sheet into.
  const creaseOctaves = [
    { noise: makeNoise(8, 0x1a2b3c), amp: 0.3 },
    { noise: makeNoise(16, 0x4d5e6f), amp: 0.26 },
    { noise: makeNoise(32, 0x708192), amp: 0.22 },
    { noise: makeNoise(64, 0x93a4b5), amp: 0.16 },
    { noise: makeNoise(128, 0xb6c7d8), amp: 0.1 },
  ];
  const facetOctaves = [
    { noise: makeNoise(4, 0xc6d7e8), amp: 0.6 },
    { noise: makeNoise(8, 0xe9fa0b), amp: 0.4 },
  ];
  const creaseAmp = creaseOctaves.reduce((s, o) => s + o.amp, 0);
  const facetAmp = facetOctaves.reduce((s, o) => s + o.amp, 0);
  // 8-bit but quantised to 16 steps: at 0.35 multiply opacity each step is well
  // under 1% lightness, and the coarseness is what keeps the dense crease
  // network comfortably inside the 60kb budget.
  const STEPS = 16;

  const png = greyscalePng(SIZE, 8, (x, y) => {
    const u = x / SIZE;
    const v = y / SIZE;

    // `1 - |2n-1|` turns each octave into ridges; raising it to the 6th narrows
    // them into thin angular creases rather than soft rounded hills.
    let crease = 0;
    for (const { noise, amp } of creaseOctaves) {
      const r = 1 - Math.abs(2 * noise(u, v) - 1);
      const r3 = r * r * r;
      crease += amp * r3 * r3;
    }
    crease /= creaseAmp;

    let facet = 0;
    for (const { noise, amp } of facetOctaves) facet += amp * noise(u, v);
    facet = facet / facetAmp - 0.5;

    // Creases read as shadow, facets as a gentle lightness drift. Kept in the
    // upper range so multiplying never muddies the cream underneath.
    const lum = 1 - 0.5 * Math.pow(crease, 0.8) + 0.07 * facet;
    return Math.round(Math.max(0, Math.min(1, lum)) * STEPS) / STEPS;
  });

  writeFileSync(join(OUT_DIR, "paper-texture-crumpled.png"), png);
  return png.length;
}

// --- noise.png --------------------------------------------------------------

function writeGrain() {
  const SIZE = 256;
  const rand = mulberry32(0x5eed17);
  // Four levels biased hard toward white: multiplied at low opacity this reads
  // as film grain, and 2 bits per pixel keeps the (incompressible) noise small.
  const png = greyscalePng(SIZE, 2, () => {
    const r = rand();
    if (r < 0.72) return 1;
    if (r < 0.9) return 2 / 3;
    if (r < 0.98) return 1 / 3;
    return 0;
  });

  writeFileSync(join(OUT_DIR, "noise.png"), png);
  return png.length;
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(dirname(join(OUT_DIR, "x")), { recursive: true });
const paperBytes = writeCrumpledPaper();
const grainBytes = writeGrain();
console.log(
  `paper-texture-crumpled.png ${(paperBytes / 1024).toFixed(1)}kb (budget 60kb)`,
);
console.log(`noise.png ${(grainBytes / 1024).toFixed(1)}kb (budget 20kb)`);
