// Seeded randomness: every procedural choice in the world comes from here, so the district is the same on
// every load (and in every screenshot).

/** mulberry32: small, fast, good enough for layout. Returns [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  /** [0, 1) */
  f(): number {
    return this.next();
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** roughly normal, mean 0, sd 1 */
  gauss(): number {
    let u = 0;
    for (let i = 0; i < 4; i++) u += this.next();
    return (u - 2) * 1.732;
  }
  /** shuffled copy */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/** Integer hash (lowbias32) → [0, 1). Bit-identical to hashU() in GLSL (see surf.ts), which is what keeps
 *  the waves you see and the waves you hear on the same schedule. */
export function hashU(x: number): number {
  x = x >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** hash of two small integers */
export function hash2i(i: number, k: number): number {
  return hashU((Math.imul(i + 4096, 0x9e3779b1) ^ Math.imul(k + 4096, 0x85ebca77)) >>> 0);
}

/** 1D value noise with smoothstep interpolation, lattice from hash2i(i, k). Mirrors vnoise1() in GLSL. */
export function vnoise1(u: number, k: number): number {
  const i = Math.floor(u);
  const f = u - i;
  const s = f * f * (3 - 2 * f);
  return hash2i(i, k) * (1 - s) + hash2i(i + 1, k) * s;
}

/** 2D value noise for placement jitter (JS only). */
export function vnoise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => hashU((Math.imul(a + 8192, 0x9e3779b1) ^ Math.imul(b + 8192, 0x85ebca77) ^ Math.imul(seed + 1, 0xc2b2ae35)) >>> 0);
  const a = h(ix, iy);
  const b = h(ix + 1, iy);
  const c = h(ix, iy + 1);
  const d = h(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function fbm2(x: number, y: number, oct = 4, seed = 0): number {
  let s = 0;
  let a = 0.5;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise2(x, y, seed + o * 17);
    norm += a;
    x = x * 2.03 + 1.7;
    y = y * 2.03 - 3.1;
    a *= 0.5;
  }
  return s / norm;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
