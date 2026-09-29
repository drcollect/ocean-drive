// Palm leaf atlas, painted on a canvas in code: three columns (coconut frond, royal frond, sabal fan).
// u runs across the frond (rachis at 0.5), v from the base (0) to the tip (1). The same alpha cuts both the
// leaves you see and the shadows they cast.
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import { Rng } from '../core/rng';

const COL_W = 128;
const H = 512;

function rgb(r: number, g: number, b: number, a = 1): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

/** Pinnate frond: rachis down the middle, leaflets angled towards the tip. */
function pinnate(ctx: CanvasRenderingContext2D, x0: number, rng: Rng, o: { n: number; base: [number, number, number]; spread: number; thick: number; reach: number; dead: number }): void {
  const cx = x0 + COL_W / 2;
  for (const side of [-1, 1]) {
    for (let i = 0; i < o.n; i++) {
      if (rng.chance(0.06)) continue; // missing leaflet
      const v = 0.03 + (i / o.n) * 0.95 + rng.range(-0.004, 0.004);
      const y = H * (1 - v);
      const reach = (COL_W / 2) * o.reach * rng.range(0.82, 1.0) * (0.55 + 0.45 * Math.sin(Math.min(1, v * 1.15) * Math.PI * 0.95 + 0.15));
      const ex = cx + side * reach;
      const ey = y - reach * o.spread * rng.range(0.8, 1.2);
      const w = o.thick * rng.range(0.8, 1.25) * (1.1 - v * 0.5);
      const dead = rng.chance(o.dead);
      const k = rng.range(0.8, 1.15);
      const [r, g, b] = dead ? [150, 118, 62] : o.base;
      const tipYellow = rng.chance(0.25);
      // tapered quad, a slight curve
      const mx = (cx + ex) / 2 + side * rng.range(-2, 2);
      const my = (y + ey) / 2 + rng.range(-3, 5);
      const grad = ctx.createLinearGradient(cx, y, ex, ey);
      grad.addColorStop(0, rgb(r * k * 0.85, g * k * 0.85, b * k * 0.85));
      grad.addColorStop(0.6, rgb(r * k, g * k, b * k));
      grad.addColorStop(1, tipYellow ? rgb(r * 1.3, g * 1.15, b * 0.8) : rgb(r * k * 1.05, g * k * 1.05, b * k));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, y - w / 2);
      ctx.quadraticCurveTo(mx, my - w * 0.6, ex, ey);
      ctx.quadraticCurveTo(mx, my + w * 0.6, cx, y + w / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  // rachis
  for (let y = 0; y < H; y += 2) {
    const v = 1 - y / H;
    const w = 1.2 + 2.6 * (1 - v);
    ctx.fillStyle = rgb(150 + 40 * (1 - v), 150 + 20 * (1 - v), 80);
    ctx.fillRect(cx - w / 2, y, w, 2.5);
  }
}

/** Sabal fan: radiating segments, split towards the ragged edge. */
function fan(ctx: CanvasRenderingContext2D, x0: number, rng: Rng): void {
  const segs = 30;
  for (let s = 0; s < segs; s++) {
    const u0 = (s + 0.08) / segs;
    const u1 = (s + 0.92) / segs;
    const split = rng.range(0.5, 0.72);
    const tip = rng.range(0.9, 1.0);
    const k = rng.range(0.85, 1.12);
    const [r, g, b] = rng.chance(0.07) ? [140, 120, 70] : [92, 118, 74];
    ctx.fillStyle = rgb(r * k, g * k, b * k);
    ctx.beginPath();
    // joined part: full width; split part narrows to a point
    ctx.moveTo(x0 + ((u0 + u1) / 2) * COL_W, H * (1 - 0.06));
    ctx.lineTo(x0 + (s / segs) * COL_W, H * (1 - split));
    ctx.lineTo(x0 + u0 * COL_W + 1.5, H * (1 - tip));
    ctx.lineTo(x0 + u1 * COL_W - 1.5, H * (1 - tip));
    ctx.lineTo(x0 + ((s + 1) / segs) * COL_W, H * (1 - split));
    ctx.closePath();
    ctx.fill();
    // fold line down each segment
    ctx.fillStyle = rgb(r * k * 1.15, g * k * 1.12, b * k);
    ctx.fillRect(x0 + ((u0 + u1) / 2) * COL_W - 0.5, H * (1 - tip), 1, H * (tip - 0.08));
  }
  // costa up the middle
  ctx.fillStyle = rgb(150, 150, 95);
  ctx.fillRect(x0 + COL_W / 2 - 1.5, H * 0.35, 3, H * 0.62);
}

let atlas: DataTexture | null = null;

/** 384 × 512: [coconut | royal | sabal]. */
export function frondAtlas(): DataTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = COL_W * 3;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  const rng = new Rng(777);
  pinnate(ctx, 0, rng, { n: 74, base: [104, 132, 52], spread: 0.85, thick: 4.2, reach: 1.0, dead: 0.05 });
  pinnate(ctx, COL_W, rng, { n: 96, base: [66, 104, 44], spread: 0.55, thick: 3.1, reach: 0.96, dead: 0.02 });
  fan(ctx, COL_W * 2, rng);
  // Copy out (flipping so v = 0 is the frond base) and bleed colour into the transparent texels, so the
  // mipmaps average leaf colour, not black, at the leaf edges. A DataTexture keeps those colours intact
  // (a canvas would premultiply them away).
  const W = c.width;
  const src = ctx.getImageData(0, 0, W, H).data;
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) d.set(src.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  for (let pass = 0; pass < 6; pass++) {
    const copy = new Uint8Array(d);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        if (copy[i + 3] > 0 || (copy[i] | copy[i + 1] | copy[i + 2]) !== 0) continue;
        let n = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = ((y + dy) * W + (x + dx)) * 4;
          if (copy[j + 3] > 0 || (copy[j] | copy[j + 1] | copy[j + 2]) !== 0) {
            r += copy[j];
            g += copy[j + 1];
            b += copy[j + 2];
            n++;
          }
        }
        if (n) {
          d[i] = r / n;
          d[i + 1] = g / n;
          d[i + 2] = b / n;
        }
      }
  }
  const t = new DataTexture(d, W, H, RGBAFormat, UnsignedByteType);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  atlas = t;
  return t;
}
