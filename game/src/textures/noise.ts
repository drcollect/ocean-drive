// Tileable noise textures, generated in code. Shaders sample these instead of computing long fbm chains.
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three';
import { hashU } from '../core/rng';

/** Periodic value noise (period p lattice cells) at (x, y) in cell units. */
function pnoise(x: number, y: number, p: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const h = (a: number, b: number) => {
    a = ((a % p) + p) % p;
    b = ((b % p) + p) % p;
    return hashU((Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca77) ^ Math.imul(seed + 7, 0xc2b2ae35)) >>> 0);
  };
  const a = h(ix, iy);
  const b = h(ix + 1, iy);
  const c = h(ix, iy + 1);
  const d = h(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Tileable fbm, 0..1, with base period `p` cells over the texture. */
function pfbm(u: number, v: number, p: number, oct: number, seed: number): number {
  let s = 0;
  let a = 0.5;
  let n = 0;
  let per = p;
  for (let o = 0; o < oct; o++) {
    s += a * pnoise(u * per, v * per, per, seed + o * 31);
    n += a;
    per *= 2;
    a *= 0.5;
  }
  return s / n;
}

let noiseTex: DataTexture | null = null;

/**
 * 256² RGBA, tileable: R = smooth value noise (8 cells), G = fbm (4 cells, 5 octaves), B = fine fbm
 * (16 cells), A = cellular-ish noise (distance to jittered points, 12 cells).
 */
export function noiseTexture(): DataTexture {
  if (noiseTex) return noiseTex;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const cells = 12;
  const pts: [number, number][] = [];
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) pts.push([(i + 0.15 + 0.7 * hashU(i * 131 + j * 977 + 5)) / cells, (j + 0.15 + 0.7 * hashU(i * 733 + j * 191 + 9)) / cells]);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const r = pnoise(u * 8, v * 8, 8, 1);
      const g = pfbm(u, v, 4, 5, 2);
      const b = pfbm(u, v, 16, 3, 3);
      // cellular F1
      const ci = Math.floor(u * cells);
      const cj = Math.floor(v * cells);
      let d1 = 9;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = (ci + di + cells) % cells;
          const jj = (cj + dj + cells) % cells;
          const p = pts[jj * cells + ii];
          let dx = p[0] - u;
          let dy = p[1] - v;
          dx -= Math.round(dx);
          dy -= Math.round(dy);
          d1 = Math.min(d1, Math.hypot(dx, dy));
        }
      const a = Math.min(1, d1 * cells * 1.3);
      const k = (y * N + x) * 4;
      data[k] = Math.round(r * 255);
      data[k + 1] = Math.round(g * 255);
      data[k + 2] = Math.round(b * 255);
      data[k + 3] = Math.round(a * 255);
    }
  }
  const t = new DataTexture(data, N, N, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  noiseTex = t;
  return t;
}
