// Walls with real openings: a wall face is cut into strips around its windows, doors, glass-block panels
// and portholes, and every opening gets reveals, a sill and a glass pane set back into the wall.
import { Vector3 } from 'three';
import { GeoBuilder, type V3 } from '../core/builder';

export type OpeningKind = 'win' | 'store' | 'door' | 'block' | 'port';

export interface Opening {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  kind: OpeningKind;
  /** glass shader type: 0 casement, 1 deco muntins, 2 storefront, 3 glass block, 4 porthole */
  type: number;
  recess?: number;
  sill?: boolean;
}

/** The builders a hotel writes into (one per material). */
export interface HotelBuilders {
  stucco: GeoBuilder;
  trim: GeoBuilder;
  glass: GeoBuilder;
  metal: GeoBuilder;
  letters: GeoBuilder;
  awning: GeoBuilder;
  tiles: GeoBuilder;
}

export function newBuilders(): HotelBuilders {
  return {
    stucco: new GeoBuilder(),
    trim: new GeoBuilder(),
    glass: new GeoBuilder(),
    metal: new GeoBuilder(),
    letters: new GeoBuilder(),
    awning: new GeoBuilder(),
    tiles: new GeoBuilder(),
  };
}

/** A planar wall: origin at its left end (seen from outside) at y = 0, `r` runs right, `n` points out. */
export interface WallFrame {
  o: Vector3;
  r: Vector3;
  n: Vector3;
  len: number;
}

const UP = new Vector3(0, 1, 0);

export function frameFrom(a: Vector3, b: Vector3): WallFrame {
  // a → b runs to the right as seen from outside; normal = r × up … pointing out
  const r = b.clone().sub(a);
  r.y = 0;
  const len = r.length();
  r.normalize();
  const n = new Vector3().crossVectors(r, UP).normalize();
  return { o: new Vector3(a.x, 0, a.z), r, n, len };
}

export function wp(f: WallFrame, u: number, y: number, d = 0): Vector3 {
  return f.o.clone().addScaledVector(f.r, u).setY(y).addScaledVector(f.n, d);
}

/** Flat quad on the wall plane (offset d along the normal). */
export function wallQuad(b: GeoBuilder, f: WallFrame, u0: number, u1: number, y0: number, y1: number, d = 0): void {
  if (u1 - u0 < 1e-4 || y1 - y0 < 1e-4) return;
  b.quad(wp(f, u0, y0, d), wp(f, u1, y0, d), wp(f, u1, y1, d), wp(f, u0, y1, d), [u0, y0, u1, y1], f.n);
}

/** Box standing out of the wall: u0..u1, y0..y1, from depth d0 to d1 along the normal. */
export function wallBox(b: GeoBuilder, f: WallFrame, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, skip: string[] = []): void {
  const c = wp(f, (u0 + u1) / 2, (y0 + y1) / 2, (d0 + d1) / 2);
  b.obox(c, f.r.clone().multiplyScalar((u1 - u0) / 2), UP.clone().multiplyScalar((y1 - y0) / 2), f.n.clone().multiplyScalar((d1 - d0) / 2), skip);
}

/** Stable per-window seed (same in the near and far versions). */
const winSeed = (f: WallFrame, o: Opening) => Math.abs(Math.floor(o.u0 * 13.1 + o.v0 * 7.7 + f.o.x * 3.3 + f.o.z * 1.7)) % 997;

/**
 * Build a wall face from y0 to y1 with openings. `near` adds reveals, sills and recessed glass; far walls
 * are one quad with the glass drawn just in front.
 */
export function buildWall(B: HotelBuilders, f: WallFrame, y0: number, y1: number, openings: Opening[], near: boolean, frameColor: V3, sillColor: V3): void {
  const ops = openings.filter((o) => o.u1 > o.u0 && o.v1 > o.v0 && o.v0 >= y0 - 1e-4 && o.v1 <= y1 + 1e-4);
  if (!near) {
    wallQuad(B.stucco, f, 0, f.len, y0, y1);
    for (const o of ops) {
      B.glass.setColor(frameColor);
      B.glass.auxv = [o.type, o.u1 - o.u0, o.v1 - o.v0, winSeed(f, o)];
      if (o.kind === 'port') {
        porthole(B, f, o, false, frameColor);
      } else wallQuad(B.glass, f, o.u0, o.u1, o.v0, o.v1, 0.012);
    }
    return;
  }
  // strips between all opening edges
  const vs = Array.from(new Set([y0, y1, ...ops.flatMap((o) => [o.v0, o.v1])])).sort((a, b) => a - b);
  for (let i = 0; i < vs.length - 1; i++) {
    const va = vs[i];
    const vb = vs[i + 1];
    if (vb - va < 1e-4) continue;
    const cover = ops.filter((o) => o.v0 <= va + 1e-5 && o.v1 >= vb - 1e-5).sort((a, b) => a.u0 - b.u0);
    let cur = 0;
    for (const o of cover) {
      wallQuad(B.stucco, f, cur, o.u0, va, vb);
      cur = Math.max(cur, o.u1);
    }
    wallQuad(B.stucco, f, cur, f.len, va, vb);
  }
  for (const o of ops) {
    B.glass.setColor(frameColor);
    B.glass.auxv = [o.type, o.u1 - o.u0, o.v1 - o.v0, winSeed(f, o)];
    if (o.kind === 'port') {
      porthole(B, f, o, true, frameColor);
      continue;
    }
    const d = -(o.recess ?? (o.kind === 'block' ? 0.08 : o.kind === 'store' || o.kind === 'door' ? 0.14 : 0.22));
    // reveals (face into the opening)
    const s = B.stucco;
    s.quad(wp(f, o.u0, o.v0, 0), wp(f, o.u0, o.v0, d), wp(f, o.u0, o.v1, d), wp(f, o.u0, o.v1, 0), [0, 0, 1, 1], f.r);
    s.quad(wp(f, o.u1, o.v0, d), wp(f, o.u1, o.v0, 0), wp(f, o.u1, o.v1, 0), wp(f, o.u1, o.v1, d), [0, 0, 1, 1], f.r.clone().negate());
    s.quad(wp(f, o.u0, o.v1, 0), wp(f, o.u0, o.v1, d), wp(f, o.u1, o.v1, d), wp(f, o.u1, o.v1, 0), [0, 0, 1, 1], UP.clone().negate());
    s.quad(wp(f, o.u1, o.v0, 0), wp(f, o.u1, o.v0, d), wp(f, o.u0, o.v0, d), wp(f, o.u0, o.v0, 0), [0, 0, 1, 1], UP);
    wallQuad(B.glass, f, o.u0, o.u1, o.v0, o.v1, d);
    if (o.sill !== false && o.kind === 'win') {
      B.trim.setColor(sillColor);
      wallBox(B.trim, f, o.u0 - 0.06, o.u1 + 0.06, o.v0 - 0.07, o.v0 + 0.005, -0.02, 0.07);
    }
  }
}

/** Round window in the square slot of `o`: wall panel with a hole, reveal, glass disc, ring. */
function porthole(B: HotelBuilders, f: WallFrame, o: Opening, near: boolean, frameColor: V3): void {
  const cu = (o.u0 + o.u1) / 2;
  const cv = (o.v0 + o.v1) / 2;
  const hs = Math.min(o.u1 - o.u0, o.v1 - o.v0) / 2;
  const R = hs * 0.86;
  const N = 20;
  const d = near ? -0.2 : 0.012;
  const circ = (i: number, rr: number, dd: number) => {
    const a = (i / N) * Math.PI * 2;
    return wp(f, cu + Math.cos(a) * rr, cv + Math.sin(a) * rr, dd);
  };
  if (near) {
    // square panel with a round hole
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      const sq = (a: number) => {
        const c = Math.cos(a);
        const s = Math.sin(a);
        const k = hs / Math.max(Math.abs(c), Math.abs(s));
        return wp(f, cu + c * k, cv + s * k, 0);
      };
      B.stucco.quad(circ(i, R, 0), sq(a0), sq(a1), circ(i + 1, R, 0), [0, 0, 1, 1], f.n);
      // reveal, facing the centre
      const nIn = f.r.clone().multiplyScalar(-Math.cos((a0 + a1) / 2)).addScaledVector(UP, -Math.sin((a0 + a1) / 2));
      B.stucco.quad(circ(i + 1, R, 0), circ(i + 1, R, d), circ(i, R, d), circ(i, R, 0), [0, 0, 1, 1], nIn);
    }
    // ring frame
    B.trim.setColor(frameColor);
    for (let i = 0; i < N; i++) {
      B.trim.quad(circ(i, R * 1.14, 0.05), circ(i + 1, R * 1.14, 0.05), circ(i + 1, R, 0.05), circ(i, R, 0.05), [0, 0, 1, 1], f.n);
    }
  }
  // glass disc
  const c = wp(f, cu, cv, d);
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    B.glass.tri(c, circ(i, R, d), circ(i + 1, R, d), [0.5, 0.5], [0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5], [0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5], f.n);
  }
}
