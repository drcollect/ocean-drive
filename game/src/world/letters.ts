// Geometric Deco capitals, drawn in code as strokes on a 4 × 6 grid (no font files). Each stroke becomes a
// small bar, so signs are real geometry that catches the low sun and casts shadows.
import { Vector3 } from 'three';
import type { GeoBuilder } from '../core/builder';

type Pt = [number, number];
type Stroke = Pt[];

function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 10): Stroke {
  const out: Stroke = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

const L: Record<string, Stroke[]> = {
  A: [[[0, 0], [2, 6], [4, 0]], [[0.75, 2.2], [3.25, 2.2]]],
  B: [[[0, 0], [0, 6], [2.4, 6]], arc(2.4, 4.6, 1.4, 1.4, 90, -90, 8), [[2.4, 3.2], [0, 3.2]], [[0, 3.2], [2.6, 3.2]], arc(2.6, 1.6, 1.4, 1.6, 90, -90, 8), [[2.6, 0], [0, 0]]],
  C: [arc(2.1, 3, 2.1, 3, 50, 310, 14)],
  D: [[[0, 0], [0, 6], [1.6, 6]], arc(1.6, 3, 2.4, 3, 90, -90, 12), [[1.6, 0], [0, 0]]],
  E: [[[3.8, 6], [0, 6], [0, 0], [3.8, 0]], [[0, 3.1], [2.9, 3.1]]],
  F: [[[3.8, 6], [0, 6], [0, 0]], [[0, 3.1], [2.9, 3.1]]],
  G: [arc(2.1, 3, 2.1, 3, 50, 330, 14), [[4.1, 1.5], [4.1, 2.8], [2.3, 2.8]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3.1], [4, 3.1]]],
  I: [[[1, 0], [1, 6]]],
  J: [[[3.2, 6], [3.2, 1.6]], arc(1.6, 1.6, 1.6, 1.6, 0, -180, 10)],
  K: [[[0, 0], [0, 6]], [[3.8, 6], [0, 2.3]], [[1.3, 3.5], [4, 0]]],
  L: [[[0, 6], [0, 0], [3.6, 0]]],
  M: [[[0, 0], [0, 6], [2, 1.8], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [arc(2, 3, 2, 3, 0, 360, 20)],
  P: [[[0, 0], [0, 6], [2.4, 6]], arc(2.4, 4.45, 1.55, 1.55, 90, -90, 8), [[2.4, 2.9], [0, 2.9]]],
  Q: [arc(2, 3, 2, 3, 0, 360, 20), [[2.6, 1.3], [4.1, -0.3]]],
  R: [[[0, 0], [0, 6], [2.4, 6]], arc(2.4, 4.45, 1.55, 1.55, 90, -90, 8), [[2.4, 2.9], [0, 2.9]], [[2.1, 2.9], [4, 0]]],
  S: [[...arc(2, 4.5, 1.9, 1.5, 25, 270, 10), ...arc(2, 1.5, 2.0, 1.5, 90, -155, 10)]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 2]], arc(2, 2, 2, 2, 180, 360, 12), [[4, 2], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 4.2], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3]], [[4, 6], [2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  "'": [[[1, 6], [0.8, 4.6]]],
  '.': [[[0.6, 0], [0.6, 0.5]]],
  '-': [[[0.4, 3], [3.6, 3]]],
  '&': [[[4, 0], [0.8, 4.1], ...arc(1.9, 4.8, 1.2, 1.2, 210, -30, 8), [1, 2.6], ...arc(1.9, 1.6, 1.8, 1.6, 150, 360, 10), [4, 2.4]]],
  // figures, same geometry
  '0': [arc(1.8, 3, 1.8, 3, 0, 360, 20)],
  '1': [[[0.6, 4.6], [2, 6], [2, 0]]],
  '2': [[...arc(1.9, 4.2, 1.8, 1.8, 160, -40, 10), [0, 0], [3.8, 0]]],
  '3': [[...arc(1.9, 4.6, 1.7, 1.4, 150, -90, 10)], [...arc(1.9, 1.6, 1.9, 1.6, 90, -150, 10)]],
  '4': [[[2.8, 0], [2.8, 6], [0, 1.6], [4, 1.6]]],
  '5': [[[3.6, 6], [0.4, 6], [0.2, 3.5], ...arc(1.9, 2, 1.9, 2, 120, -150, 12)]],
  '6': [[...arc(2, 4.2, 1.9, 1.8, 30, 180, 8), ...arc(2, 2, 2, 2, 180, 540, 20)]],
  '7': [[[0, 6], [4, 6], [1.4, 0]]],
  '8': [arc(2, 4.6, 1.6, 1.4, 0, 360, 16), arc(2, 1.6, 1.9, 1.6, 0, 360, 16)],
  '9': [[...arc(2, 4, 2, 2, 0, 360, 20), [4, 4], ...arc(2, 1.8, 2, 1.8, 0, -150, 8)]],
};

const ADV: Record<string, number> = { I: 2, "'": 2, '.': 1.6, ' ': 2.6, '0': 3.6, '1': 2.6 };

/** Width of a word in grid units (height 6). */
export function wordWidth(text: string, spacing = 1.3): number {
  let w = 0;
  for (const ch of text) w += (ADV[ch] ?? 4) + spacing;
  return Math.max(0, w - spacing);
}

export interface LetterOpts {
  /** cap height (m) */
  height: number;
  /** stroke thickness as a fraction of the height */
  weight?: number;
  /** extrusion depth (m) */
  depth?: number;
  spacing?: number;
  /** stack letters vertically (blade signs) */
  vertical?: boolean;
}

/**
 * Write `text` into `b`. `origin` is the text's bottom-left (horizontal) or top-centre (vertical) on the
 * sign face; `right` runs along the line of text, `out` points away from the sign face.
 */
export function writeText(b: GeoBuilder, text: string, origin: Vector3, right: Vector3, out: Vector3, o: LetterOpts): void {
  const s = o.height / 6;
  const t = o.height * (o.weight ?? 0.13);
  const depth = o.depth ?? Math.max(0.05, o.height * 0.08);
  const up = new Vector3().crossVectors(out, right).normalize();
  const spacing = o.spacing ?? 1.3;
  let cursor = 0;
  let row = 0;
  for (const ch of text.toUpperCase()) {
    const adv = ADV[ch] ?? 4;
    const strokes = L[ch];
    // letter origin (bottom-left)
    let base: Vector3;
    if (o.vertical) {
      const lineH = 6 + spacing * 1.2;
      base = origin
        .clone()
        .addScaledVector(right, (-adv / 2) * s)
        .addScaledVector(up, -(row + 1) * lineH * s);
      row++;
    } else {
      base = origin.clone().addScaledVector(right, cursor * s);
      cursor += adv + spacing;
    }
    if (!strokes) continue;
    const center = base.clone().addScaledVector(out, depth / 2);
    for (const st of strokes) {
      for (let i = 0; i < st.length - 1; i++) {
        const [x0, y0] = st[i];
        const [x1, y1] = st[i + 1];
        const p0 = center.clone().addScaledVector(right, x0 * s).addScaledVector(up, y0 * s);
        const p1 = center.clone().addScaledVector(right, x1 * s).addScaledVector(up, y1 * s);
        const dir = p1.clone().sub(p0);
        const len = dir.length();
        if (len < 1e-5) continue;
        dir.normalize();
        // extend by half the stroke so joints close
        p0.addScaledVector(dir, -t * 0.45);
        p1.addScaledVector(dir, t * 0.45);
        b.bar(p0, p1, out.clone().multiplyScalar(depth), t);
      }
    }
  }
}
