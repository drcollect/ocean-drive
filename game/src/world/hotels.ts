// The hotel row: about forty procedural Art Deco hotels on the west side of Ocean Drive. Each one varies its
// width, floors, colours, window rhythm and roofline, and is built from one of four families (central
// tower, streamline corner, pylon with blade sign, nautical bow) with eyebrows, portholes, glass block,
// stepped parapets, signs in code-drawn letters, weathered stucco and a café terrace. Built per block in a
// near and a far version; the far one drops reveals, sills and furniture.
import { Group, Mesh, Vector3, type Material } from 'three';
import { GeoBuilder, type V3 } from '../core/builder';
import type { Ctx } from '../core/ctx';
import { Rng } from '../core/rng';
import { buildWall, frameFrom, newBuilders, wallBox, wallQuad, wp, type HotelBuilders, type Opening, type WallFrame } from './facade';
import { BLOCKS, CROSS_HALF, CROSS_Z, SIDEWALK_Y, X, Z_MAX, Z_MIN } from './layout';
import { wordWidth, writeText } from './letters';
import { lin, materials } from './materials';
import { buildCafes } from './cafes';
import { addAABB, addCircle, addHeightBox } from './registry';

const NAMES = [
  'MARISOL', 'ORCHIDEA', 'BELLA MAR', 'CORALINE', 'SEAGROVE', 'FAIRHOLM', 'LUMINA', 'AZURINE', 'PALMYRA', 'VISTAMAR',
  'BRISAMAR', 'MIRABEL', 'SANDRINE', 'SEAFOAM', 'ESTRELLA', 'SERENA', 'SUNWARD', 'TIDEWELL', 'MARIGOLD', 'ROSALIND',
  'PALMCREST', 'SEAHAVEN', 'AURELIA', 'GLORIANA', 'CASTELMAR', 'DELMARA', 'SOLARA', 'CAPRICE', 'MARINELLA', 'ALBORADA',
  'AMBERLEY', 'CELESTE', 'DORADO', 'ISLA VERDE', 'NAVARRE', 'OCEANIQUE', 'PERLA', 'SOLIMAR', 'WINDSONG', 'ZEPHYR',
  'BAHIA', 'CORONET', 'LAGUNA', 'MARBELLA',
];

const PASTELS: Record<string, string> = {
  pink: '#f4c4cb',
  mint: '#c2e8d3',
  cream: '#f3ead3',
  lemon: '#f5e39f',
  lavender: '#d9cce8',
  coral: '#f3ac9a',
  aqua: '#bfe3e5',
  peach: '#f6cfb0',
  white: '#f3f0e8',
};
const ACCENTS = ['#3f9a98', '#36adb8', '#63bb9a', '#dc7b96', '#e07a62', '#e0b43c', '#9780c0', '#6aa3d3', '#ea8db0', '#f3f0e8'];
const PARTNER: Record<string, string[]> = {
  pink: ['#dc7b96', '#3f9a98', '#f3f0e8', '#ea8db0'],
  mint: ['#3f9a98', '#63bb9a', '#f3f0e8', '#dc7b96'],
  cream: ['#36adb8', '#e07a62', '#3f9a98', '#e0b43c'],
  lemon: ['#36adb8', '#e07a62', '#f3f0e8', '#3f9a98'],
  lavender: ['#9780c0', '#f3f0e8', '#3f9a98', '#dc7b96'],
  coral: ['#f3f0e8', '#3f9a98', '#e07a62'],
  aqua: ['#36adb8', '#f3f0e8', '#dc7b96', '#e0b43c'],
  peach: ['#e07a62', '#3f9a98', '#f3f0e8'],
  white: ['#36adb8', '#dc7b96', '#63bb9a', '#e0b43c', '#9780c0', '#6aa3d3'],
};
const LETTER_COLORS = ['#f7f3ea', '#2f7f7e', '#d9587e', '#2a9bb0', '#f3f0e8', '#ffffff'];
const FRAME_COLORS = ['#f3f0e8', '#f3f0e8', '#3a3a3a', '#5b8f8c', '#ece6d6'];
const AWNINGS: [string, string][] = [
  ['#e46f8f', '#f6f1e7'],
  ['#3f8fc4', '#f6f1e7'],
  ['#2f9a8f', '#f6f1e7'],
  ['#f2b54a', '#f6f1e7'],
  ['#e98a6f', '#f6f1e7'],
  ['#5e5aa8', '#f6f1e7'],
];

type Family = 'tower' | 'streamline' | 'pylon' | 'nautical';

export interface CafeSpot {
  x: number;
  z: number;
  y: number;
  umbrella: 0 | 1 | 2 | 3; // none, pink, blue, white
  seats: number;
  rot: number;
}

export interface HotelSpec {
  index: number;
  name: string;
  family: Family;
  z0: number;
  z1: number;
  xf: number;
  depth: number;
  floors: number;
  gh: number;
  fh: number;
  H: number;
  roundN: number;
  roundS: number;
  corner: 'N' | 'S' | null;
  body: V3;
  bodyName: string;
  trim: V3;
  accent: V3;
  letter: V3;
  frame: V3;
  awning: [V3, V3];
  terraceH: number;
  windowW: number;
  windowH: number;
  pairGap: number;
  winType: number;
  eyebrow: number;
  parapet: number;
  seed: number;
  cafe: CafeSpot[];
  /** how far a central tower stands proud of the facade */
  towerOut?: number;
}

export interface HotelRow {
  group: Group;
  specs: HotelSpec[];
  /** where the bossa nova plays */
  musicSpot: Vector3;
  update(cam: Vector3): void;
}

function pickWeighted<T>(rng: Rng, items: [T, number][]): T {
  let s = 0;
  for (const [, w] of items) s += w;
  let r = rng.f() * s;
  for (const [it, w] of items) {
    r -= w;
    if (r <= 0) return it;
  }
  return items[items.length - 1][0];
}

/** Fit n windows of width w with gap g centred in [a, b]. */
function fitColumns(a: number, b: number, w: number, g: number, max = 99): number[] {
  const len = b - a;
  const n = Math.max(0, Math.min(max, Math.floor((len + g) / (w + g))));
  if (n === 0) return [];
  const used = n * w + (n - 1) * g;
  const start = a + (len - used) / 2;
  return Array.from({ length: n }, (_, i) => start + i * (w + g));
}

export interface BlockPlan {
  z0: number;
  z1: number;
  /** a cross street borders it on the north / south side */
  streetN: boolean;
  streetS: boolean;
}

/** The district's blocks. */
export const DISTRICT_BLOCKS: BlockPlan[] = BLOCKS.map(([z0, z1], i) => ({ z0, z1, streetN: i > 0, streetS: i < BLOCKS.length - 1 }));

/** Blocks beyond the district (far LOD only), so Ocean Drive runs on into the haze. */
export function farBlocks(): BlockPlan[] {
  const out: BlockPlan[] = [];
  const step = CROSS_Z[1] - CROSS_Z[0];
  for (const dir of [1, -1]) {
    let cz = dir > 0 ? CROSS_Z[CROSS_Z.length - 1] + step : CROSS_Z[0] - step; // ≈ ±340: first street past the end
    let edge = dir > 0 ? Z_MAX : Z_MIN;
    for (let k = 0; k < 6; k++) {
      const a = edge;
      const b = cz - dir * CROSS_HALF;
      if (Math.abs(b - a) > 12) out.push(dir > 0 ? { z0: a, z1: b, streetN: k > 0, streetS: true } : { z0: b, z1: a, streetN: true, streetS: k > 0 });
      edge = cz + dir * CROSS_HALF;
      cz += dir * step;
    }
  }
  return out;
}

/** Plan the lots of a set of blocks. */
function planHotels(blocks: BlockPlan[], seed: number, nameOffset: number): HotelSpec[] {
  const rng = new Rng(seed);
  const specs: HotelSpec[] = [];
  const names = rng.shuffle(NAMES);
  let lastBody = '';
  blocks.forEach(({ z0: za, z1: zb, streetN, streetS }) => {
    // lots
    const widths: number[] = [];
    let rem = zb - za;
    while (rem > 0) {
      let w = pickWeighted(rng, [
        [rng.range(10.5, 13), 3],
        [rng.range(13, 18), 5],
        [rng.range(18, 24), 3],
        [rng.range(24, 29), 1],
      ]);
      if (rem - w < 10.5) w = rem;
      if (rem - w < 0) w = rem;
      widths.push(w);
      rem -= w;
    }
    let z = za;
    widths.forEach((w, li) => {
      const gap = li < widths.length - 1 && rng.chance(0.22) ? rng.range(1.4, 2.6) : 0;
      const z0 = z;
      const z1 = z + w - gap;
      z += w;
      const northStreet = li === 0 && streetN;
      const southStreet = li === widths.length - 1 && streetS;
      const corner = northStreet ? 'N' : southStreet ? 'S' : null;
      let floors = pickWeighted(rng, [
        [2, 0.6],
        [3, 3.2],
        [4, 3],
        [5, 1.3],
        [6, 0.7],
        [7, 0.45],
      ]);
      if (corner) floors = Math.min(8, floors + 1);
      const W = z1 - z0;
      const family: Family = pickWeighted(rng, [
        ['tower', W >= 13 ? 3 : 0.5],
        ['streamline', corner ? 5 : 2.2],
        ['pylon', W >= 11 ? 2.4 : 0.8],
        ['nautical', W >= 14 ? 1.8 : 0.4],
      ]);
      let bodyName = rng.pick(Object.keys(PASTELS));
      while (bodyName === lastBody) bodyName = rng.pick(Object.keys(PASTELS));
      lastBody = bodyName;
      const white = bodyName === 'white' || bodyName === 'cream';
      const accentHex = rng.pick(PARTNER[bodyName] ?? ACCENTS);
      const trimHex = white ? (rng.chance(0.5) ? accentHex : '#f7f4ec') : rng.chance(0.7) ? '#f7f4ec' : accentHex;
      const gh = 4.3;
      const fh = rng.range(3.0, 3.3);
      const roundR = rng.range(2.6, 4.2);
      const spec: HotelSpec = {
        index: specs.length,
        name: names[(specs.length + nameOffset) % names.length],
        family,
        z0,
        z1,
        xf: X.facade + rng.range(-1.3, 0.8),
        depth: rng.range(20, 27),
        floors,
        gh,
        fh,
        H: gh + (floors - 1) * fh,
        roundN: corner === 'N' || (family === 'streamline' && rng.chance(0.35)) ? roundR : 0,
        roundS: corner === 'S' || (family === 'streamline' && rng.chance(0.35)) ? roundR : 0,
        corner,
        body: lin(PASTELS[bodyName]),
        bodyName,
        trim: lin(trimHex),
        accent: lin(accentHex),
        letter: lin(white ? accentHex : rng.pick(LETTER_COLORS)),
        frame: lin(rng.pick(FRAME_COLORS)),
        awning: rng.pick(AWNINGS).map(lin) as [V3, V3],
        terraceH: rng.pick([0.25, 0.45, 0.6, 0.75]),
        windowW: rng.range(1.0, 1.45),
        windowH: rng.range(1.45, 1.85),
        pairGap: rng.range(0.28, 0.5),
        winType: rng.chance(0.55) ? 1 : 0,
        eyebrow: rng.range(0.42, 0.8),
        parapet: rng.range(0.75, 1.2),
        seed: rng.int(1, 1e6),
        cafe: [],
      };
      if (spec.roundN > 0 && spec.roundS > 0 && W < 2 * spec.roundN + 6) spec.roundS = 0;
      specs.push(spec);
    });
  });
  return specs;
}

const UP = new Vector3(0, 1, 0);

/** Horizontal eyebrow slab above u0..u1 at height y on a wall. */
function eyebrow(B: HotelBuilders, f: WallFrame, u0: number, u1: number, y: number, depth: number): void {
  wallBox(B.trim, f, u0, u1, y, y + 0.11, 0, depth);
}

interface Outline {
  front: WallFrame;
  arcN: WallFrame[];
  arcS: WallFrame[];
  sideN: WallFrame;
  sideS: WallFrame;
  back: WallFrame;
  poly: Vector3[];
}

function outline(h: HotelSpec): Outline {
  const { z0, z1, xf, depth, roundN: rN, roundS: rS } = h;
  const xb = xf - depth;
  const P = (x: number, z: number) => new Vector3(x, 0, z);
  const front = frameFrom(P(xf, z1 - rS), P(xf, z0 + rN));
  const arc = (cx: number, cz: number, r: number, a0: number, a1: number) => {
    const n = 7;
    const pts: Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      pts.push(P(cx + r * Math.cos(a), cz + r * Math.sin(a)));
    }
    return pts;
  };
  const arcNPts = rN > 0 ? arc(xf - rN, z0 + rN, rN, 0, -90) : [];
  const arcSPts = rS > 0 ? arc(xf - rS, z1 - rS, rS, 90, 0) : [];
  const arcN = arcNPts.slice(0, -1).map((p, i) => frameFrom(p, arcNPts[i + 1]));
  const arcS = arcSPts.slice(0, -1).map((p, i) => frameFrom(p, arcSPts[i + 1]));
  const sideN = frameFrom(P(xf - rN, z0), P(xb, z0));
  const back = frameFrom(P(xb, z0), P(xb, z1));
  const sideS = frameFrom(P(xb, z1), P(xf - rS, z1));
  const poly = [P(xf, z1 - rS), P(xf, z0 + rN), ...arcNPts.slice(1), P(xb, z0), P(xb, z1), ...arcSPts];
  return { front, arcN, arcS, sideN, sideS, back, poly };
}

/** Fan-triangulated flat roof over a convex outline at height y. */
function roof(b: GeoBuilder, poly: Vector3[], y: number): void {
  const c = poly.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / poly.length).setY(y);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i].clone().setY(y);
    const d = poly[(i + 1) % poly.length].clone().setY(y);
    // outline runs clockwise in (x, z) → (c, a, d) faces up
    b.tri(c, a, d, [c.x, c.z], [a.x, a.z], [d.x, d.z], UP);
  }
}

function buildHotel(h: HotelSpec, B: HotelBuilders, near: boolean, register: boolean): void {
  const rng = new Rng(h.seed);
  const ol = outline(h);
  const { gh, fh, floors, H } = h;
  const yt = SIDEWALK_Y + h.terraceH; // terrace floor
  B.stucco.setColor(h.body);
  B.trim.setColor(h.trim);

  // ---------- front facade layout
  const L = ol.front.len;
  const center = L / 2;
  let cw = 0; // width of the special central bay (tower / bow)
  if (h.family === 'tower') cw = Math.min(7.5, Math.max(4.2, L * 0.34));
  if (h.family === 'nautical') cw = Math.min(8, Math.max(5, L * 0.38));
  const bay0 = center - cw / 2;
  const bay1 = center + cw / 2;
  const pylonU = h.family === 'pylon' ? (rng.chance(0.5) ? L * 0.27 : L * 0.73) : -99;

  const upper: Opening[] = [];
  const winsIn = (a: number, b: number, fy: number) => {
    const ww = h.windowW;
    const wv0 = fy + 0.85;
    const wv1 = wv0 + h.windowH;
    if (h.family === 'streamline') {
      // ribbon windows: wide panes, narrow piers
      for (const u of fitColumns(a + 0.5, b - 0.5, 2.3, 0.42)) upper.push({ u0: u, u1: u + 2.3, v0: wv0, v1: wv1, kind: 'win', type: 1, sill: false });
    } else if (h.family === 'pylon') {
      // triples
      const tw = ww * 3 + 0.3;
      for (const u of fitColumns(a + 0.6, b - 0.6, tw, 1.4)) for (let k = 0; k < 3; k++) upper.push({ u0: u + k * (ww + 0.15), u1: u + k * (ww + 0.15) + ww, v0: wv0, v1: wv1, kind: 'win', type: h.winType });
    } else {
      // pairs
      const pw = ww * 2 + h.pairGap;
      for (const u of fitColumns(a + 0.6, b - 0.6, pw, 1.3)) {
        upper.push({ u0: u, u1: u + ww, v0: wv0, v1: wv1, kind: 'win', type: h.winType });
        upper.push({ u0: u + ww + h.pairGap, u1: u + pw, v0: wv0, v1: wv1, kind: 'win', type: h.winType });
      }
    }
  };
  const sideRanges: [number, number][] = cw > 0 ? [[0, bay0], [bay1, L]] : h.family === 'pylon' ? [[0, pylonU - 0.5], [pylonU + 0.5, L]] : [[0, L]];
  for (let f = 1; f < floors; f++) {
    const fy = gh + (f - 1) * fh;
    for (const [a, b] of sideRanges) winsIn(a, b, fy);
  }
  // ground floor: storefronts and the door
  const ground: Opening[] = [];
  const doorW = 1.9;
  const doorU = h.family === 'pylon' ? (pylonU < L / 2 ? pylonU + 2.2 : pylonU - 2.2 - doorW) : center - doorW / 2;
  ground.push({ u0: doorU, u1: doorU + doorW, v0: yt, v1: gh - 0.75, kind: 'door', type: 2 });
  for (const [a, b] of [[0.8, doorU - 0.7], [doorU + doorW + 0.7, L - 0.8]] as [number, number][]) {
    for (const u of fitColumns(a, b, 2.4, 0.55)) ground.push({ u0: u, u1: u + 2.4, v0: yt + 0.5, v1: gh - 0.75, kind: 'store', type: 2 });
  }
  buildWall(B, ol.front, 0, gh, ground, near, h.frame, h.trim);
  buildWall(B, ol.front, gh, H, upper, near, h.frame, h.trim);

  // eyebrows over the upper windows
  for (let f = 1; f < floors; f++) {
    const fy = gh + (f - 1) * fh;
    const y = fy + 0.85 + h.windowH + 0.12;
    if (h.family === 'streamline') {
      eyebrow(B, ol.front, 0, L, y, h.eyebrow);
    } else {
      for (const [a, b] of sideRanges) {
        const ws = upper.filter((o) => o.v0 === fy + 0.85 && o.u0 >= a - 1e-6 && o.u1 <= b + 1e-6);
        if (!ws.length) continue;
        if (h.family === 'pylon') {
          for (let i = 0; i < ws.length; i += 3) eyebrow(B, ol.front, ws[i].u0 - 0.25, ws[Math.min(i + 2, ws.length - 1)].u1 + 0.25, y, h.eyebrow);
        } else eyebrow(B, ol.front, ws[0].u0 - 0.35, ws[ws.length - 1].u1 + 0.35, y, h.eyebrow);
      }
    }
  }
  // belt course over the ground floor, cornice band under the parapet
  wallBox(B.trim, ol.front, 0, L, gh - 0.32, gh - 0.02, 0, 0.14);
  wallBox(B.trim, ol.front, 0, L, H - 0.28, H, 0, 0.1);

  // ---------- rounded corners: ribbon windows wrap round, eyebrows follow
  for (const arcs of [ol.arcN, ol.arcS]) {
    for (const fr of arcs) {
      const gOps: Opening[] = [{ u0: 0.06, u1: fr.len - 0.06, v0: yt + 0.5, v1: gh - 0.75, kind: 'store', type: 2 }];
      const uOps: Opening[] = [];
      for (let f = 1; f < floors; f++) {
        const fy = gh + (f - 1) * fh;
        uOps.push({ u0: 0.05, u1: fr.len - 0.05, v0: fy + 0.85, v1: fy + 0.85 + h.windowH, kind: 'win', type: 1, sill: false });
      }
      buildWall(B, fr, 0, gh, gOps, near, h.frame, h.trim);
      buildWall(B, fr, gh, H, uOps, near, h.frame, h.trim);
      for (let f = 1; f < floors; f++) {
        const fy = gh + (f - 1) * fh;
        eyebrow(B, fr, -0.02, fr.len + 0.02, fy + 0.85 + h.windowH + 0.12, h.eyebrow);
      }
      wallBox(B.trim, fr, -0.02, fr.len + 0.02, gh - 0.32, gh - 0.02, 0, 0.14);
      wallBox(B.trim, fr, -0.02, fr.len + 0.02, H - 0.28, H, 0, 0.1);
    }
  }

  // ---------- side walls: facades on corner lots, weathered party walls otherwise
  for (const [side, fr] of [['N', ol.sideN], ['S', ol.sideS]] as ['N' | 'S', WallFrame][]) {
    const facing = h.corner === side;
    if (facing) {
      const ops: Opening[] = [];
      for (let f = 1; f < floors; f++) {
        const fy = gh + (f - 1) * fh;
        for (const u of fitColumns(0.8, fr.len - 0.8, h.windowW, 1.5)) ops.push({ u0: u, u1: u + h.windowW, v0: fy + 0.85, v1: fy + 0.85 + h.windowH, kind: 'win', type: h.winType });
      }
      const gOps: Opening[] = fitColumns(0.8, Math.min(fr.len - 0.8, 12), 2.4, 0.6).map((u) => ({ u0: u, u1: u + 2.4, v0: yt + 0.5, v1: gh - 0.75, kind: 'store' as const, type: 2 }));
      buildWall(B, fr, 0, gh, gOps, near, h.frame, h.trim);
      buildWall(B, fr, gh, H, ops, near, h.frame, h.trim);
      for (let f = 1; f < floors; f++) {
        const fy = gh + (f - 1) * fh;
        if (h.family === 'streamline') eyebrow(B, fr, 0, fr.len, fy + 0.85 + h.windowH + 0.12, h.eyebrow);
      }
      wallBox(B.trim, fr, 0, fr.len, gh - 0.32, gh - 0.02, 0, 0.14);
    } else {
      // a few small windows high up where it clears most neighbours
      const ops: Opening[] = [];
      for (let f = 3; f < floors; f++) {
        const fy = gh + (f - 1) * fh;
        for (const u of fitColumns(2, fr.len - 2, 0.9, 4.5, 3)) ops.push({ u0: u, u1: u + 0.9, v0: fy + 1, v1: fy + 2.2, kind: 'win', type: 0 });
      }
      buildWall(B, fr, 0, H, ops, near, h.frame, h.trim);
    }
    wallBox(B.trim, fr, 0, fr.len, H - 0.28, H, 0, 0.1);
  }
  buildWall(B, ol.back, 0, H, [], near, h.frame, h.trim);

  // ---------- roof and parapet
  B.stucco.setColor([0.28, 0.27, 0.26]);
  roof(B.stucco, ol.poly, H + 0.05);
  B.stucco.setColor(h.body);
  const pH = h.parapet;
  const parapetOn = (fr: WallFrame) => {
    wallBox(B.stucco, fr, 0, fr.len, H, H + pH, -0.25, 0);
    B.trim.setColor(h.trim);
    wallBox(B.trim, fr, -0.03, fr.len + 0.03, H + pH, H + pH + 0.1, -0.3, 0.06);
  };
  [ol.front, ...ol.arcN, ...ol.arcS, ol.sideN, ol.sideS, ol.back].forEach(parapetOn);
  // rooftop units
  if (near) {
    // near-only details draw from their own stream so the far version stays identical otherwise
    const rd = new Rng(h.seed + 77);
    B.metal.setColor([0.55, 0.56, 0.55]);
    const n = rd.int(1, 3);
    for (let i = 0; i < n; i++) {
      const x = h.xf - h.depth * rd.range(0.35, 0.8);
      const z = rd.range(h.z0 + 2, h.z1 - 2);
      B.metal.box(x - 0.8, H, z - 0.6, x + 0.8, H + 1.1, z + 0.6);
    }
    B.stucco.setColor(h.body);
    const bx = h.xf - h.depth * 0.6;
    const bz = rd.range(h.z0 + 3, Math.max(h.z0 + 3.1, h.z1 - 5));
    B.stucco.box(bx - 1.6, H, bz, bx + 1.6, H + 2.6, bz + 2.4);
  }

  // ---------- family features
  const letterColor = h.letter;
  if (h.family === 'tower') tower(h, B, ol, bay0, bay1, near, rng, letterColor);
  if (h.family === 'nautical') bow(h, B, ol, bay0, bay1, near, rng, letterColor);
  if (h.family === 'pylon') pylon(h, B, ol, pylonU, rng, letterColor);
  if (h.family === 'streamline') streamline(h, B, ol, rng, letterColor);

  // ---------- ground floor: awnings, marquee, terrace, café
  groundFloor(h, B, ol, ground, doorU, doorW, near, rng, register);

  if (register) {
    const rN = h.roundN;
    const rS = h.roundS;
    addAABB(h.xf - h.depth, h.z0, h.xf - Math.max(rN, rS, 0.01), h.z1, 0, H + 3, 'building');
    addAABB(h.xf - Math.max(rN, rS, 0.01) - 0.1, h.z0 + rN, h.xf, h.z1 - rS, 0, H + 3, 'building');
    if (rN > 0) addCircle(h.xf - rN, h.z0 + rN, rN, 0, H + 3, 'building');
    if (rS > 0) addCircle(h.xf - rS, h.z1 - rS, rS, 0, H + 3, 'building');
    if (h.towerOut) {
      const L = ol.front.len;
      const cw = Math.min(7.5, Math.max(4.2, L * 0.34));
      const zc = (h.z0 + h.roundN + h.z1 - h.roundS) / 2;
      addAABB(h.xf, zc - cw / 2, h.xf + h.towerOut, zc + cw / 2, 0, H + 3, 'building');
    }
  }
}

function tower(h: HotelSpec, B: HotelBuilders, ol: Outline, bay0: number, bay1: number, near: boolean, rng: Rng, letterColor: V3): void {
  const f = ol.front;
  const p = rng.range(0.55, 1.0);
  const tH = h.H + rng.range(2.6, 5.5);
  // tower front at +p
  const a = wp(f, bay0, 0, p);
  const b = wp(f, bay1, 0, p);
  const tf = frameFrom(a, b);
  B.stucco.setColor(h.body);
  // glass-block strip or portholes up the middle
  const ops: Opening[] = [];
  const mid = tf.len / 2;
  const usePorts = rng.chance(0.4);
  for (let fl = 1; fl < h.floors; fl++) {
    const fy = h.gh + (fl - 1) * h.fh;
    if (usePorts) {
      ops.push({ u0: mid - 0.55, u1: mid + 0.55, v0: fy + 1.0, v1: fy + 2.1, kind: 'port', type: 4 });
    } else ops.push({ u0: mid - 0.55, u1: mid + 0.55, v0: fy + 0.25, v1: fy + h.fh - 0.25, kind: 'block', type: 3 });
    // small windows either side
    ops.push({ u0: 0.55, u1: 0.55 + 0.95, v0: fy + 0.85, v1: fy + 0.85 + h.windowH, kind: 'win', type: h.winType });
    ops.push({ u0: tf.len - 1.5, u1: tf.len - 0.55, v0: fy + 0.85, v1: fy + 0.85 + h.windowH, kind: 'win', type: h.winType });
  }
  buildWall(B, tf, h.gh, tH, ops, near, h.frame, h.trim);
  buildWall(B, tf, 0, h.gh, [], near, h.frame, h.trim);
  // tower sides (short) and top
  const sN = frameFrom(wp(f, bay1, 0, p), wp(f, bay1, 0, 0)); // the tower's north cheek, facing north
  const sS = frameFrom(wp(f, bay0, 0, 0), wp(f, bay0, 0, p));
  buildWall(B, sN, 0, tH, [], near, h.frame, h.trim);
  buildWall(B, sS, 0, tH, [], near, h.frame, h.trim);
  // the tower continues back over the roof as a solid block
  B.stucco.box(Math.min(a.x, b.x) - 6, h.H, Math.min(a.z, b.z), Math.min(a.x, b.x), tH, Math.max(a.z, b.z), ['px']);
  h.towerOut = p;
  // stepped crown
  B.trim.setColor(h.trim);
  let y = tH;
  let inset = 0;
  const steps = rng.int(2, 3);
  for (let s = 0; s < steps; s++) {
    const hgt = rng.range(0.7, 1.2);
    wallBox(B.trim, tf, inset - 0.05, tf.len - inset + 0.05, y, y + 0.14, -6.2 + inset, 0.1);
    wallBox(B.stucco, tf, inset + 0.3, tf.len - inset - 0.3, y + 0.14, y + hgt, -5.8 + inset, -0.05);
    y += hgt;
    inset += tf.len * 0.13;
  }
  // finial
  B.metal.setColor([0.85, 0.85, 0.82]);
  const top = wp(tf, tf.len / 2, y, -2.6);
  B.metal.cylinder(top, top.clone().setY(y + rng.range(2.2, 4)), 0.07, 0.03, 8);
  // fins on the tower face
  B.trim.setColor(h.accent);
  for (const u of [0.18, tf.len - 0.18]) wallBox(B.trim, tf, u - 0.09, u + 0.09, h.gh - 0.2, tH + 0.4, 0, 0.32);
  // the name: across the top if it fits, else stacked
  const lh = Math.min(1.05, (tf.len - 0.9) / (wordWidth(h.name) / 6));
  B.letters.setColor(letterColor);
  if (lh >= 0.55) {
    const w = (wordWidth(h.name) / 6) * lh;
    writeText(B.letters, h.name, wp(tf, (tf.len - w) / 2, tH - lh - 0.5, 0.02), tf.r, tf.n, { height: lh });
  } else {
    const n = h.name.replace(/ /g, '').length;
    const vh = Math.min(0.75, (tH - h.gh - 1.2) / (n * 1.27));
    writeText(B.letters, h.name.replace(/ /g, ''), wp(tf, tf.len / 2, tH - 0.4, 0.02), tf.r, tf.n, { height: vh, vertical: true });
  }
}

function bow(h: HotelSpec, B: HotelBuilders, ol: Outline, bay0: number, bay1: number, near: boolean, rng: Rng, letterColor: V3): void {
  const f = ol.front;
  const R = (bay1 - bay0) / 2;
  const c = wp(f, (bay0 + bay1) / 2, 0, 0);
  const n = 10;
  const pts: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    // from the right end of the bay (seen from outside) round to the left: angle from −90° to +90° about the normal
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    pts.push(c.clone().addScaledVector(f.r, -Math.sin(a) * R).addScaledVector(f.n, Math.cos(a) * R));
  }
  // walk them so each facet runs left→right seen from outside
  const facets: WallFrame[] = [];
  for (let i = n; i > 0; i--) facets.push(frameFrom(pts[i], pts[i - 1]));
  const top = h.H + rng.range(0.4, 1.6);
  const ports = rng.chance(0.5);
  B.stucco.setColor(h.body);
  facets.forEach((fr, i) => {
    const ops: Opening[] = [];
    for (let fl = 1; fl < h.floors; fl++) {
      const fy = h.gh + (fl - 1) * h.fh;
      if (ports && i % 2 === 1) ops.push({ u0: fr.len / 2 - 0.45, u1: fr.len / 2 + 0.45, v0: fy + 1.05, v1: fy + 1.95, kind: 'port', type: 4 });
      else if (!ports) ops.push({ u0: 0.05, u1: fr.len - 0.05, v0: fy + 0.85, v1: fy + 0.85 + h.windowH, kind: 'win', type: 1, sill: false });
    }
    buildWall(B, fr, h.gh - 0.3, top, ops, near, h.frame, h.trim);
    for (let fl = 1; fl < h.floors; fl++) {
      const fy = h.gh + (fl - 1) * h.fh;
      eyebrow(B, fr, -0.03, fr.len + 0.03, fy + 0.85 + h.windowH + 0.12, 0.35);
    }
    B.trim.setColor(h.trim);
    wallBox(B.trim, fr, -0.03, fr.len + 0.03, top, top + 0.12, -0.3, 0.08);
  });
  // bow roof and underside (a half disc)
  B.stucco.setColor(h.body);
  for (let i = 0; i < n; i++) {
    const a = pts[i].clone();
    const b = pts[i + 1].clone();
    B.stucco.tri(c.clone().setY(top), b.clone().setY(top), a.clone().setY(top), [0, 0], [1, 0], [1, 1], UP);
    B.stucco.tri(c.clone().setY(h.gh - 0.3), a.clone().setY(h.gh - 0.3), b.clone().setY(h.gh - 0.3), [0, 0], [1, 0], [1, 1], UP.clone().negate());
  }
  // ship's railing round the bow roof, and a mast
  B.metal.setColor([0.92, 0.92, 0.9]);
  for (let i = 0; i <= n; i++) {
    const p = pts[i].clone().lerp(c, 0.08).setY(top + 0.12);
    B.metal.cylinder(p, p.clone().setY(top + 1.05), 0.025, 0.025, 6, false);
    if (i < n) {
      const q = pts[i + 1].clone().lerp(c, 0.08);
      for (const yy of [top + 0.55, top + 1.02]) B.metal.cylinder(p.clone().setY(yy), q.clone().setY(yy), 0.02, 0.02, 5, false);
    }
  }
  const mast = c.clone().addScaledVector(f.n, -1).setY(top);
  B.metal.cylinder(mast, mast.clone().setY(top + 5.5), 0.06, 0.035, 8);
  B.metal.cylinder(mast.clone().setY(top + 4.2), mast.clone().setY(top + 4.2).addScaledVector(f.r, 1.4), 0.025, 0.02, 5);
  B.metal.cylinder(mast.clone().setY(top + 4.2), mast.clone().setY(top + 4.2).addScaledVector(f.r, -1.4), 0.025, 0.02, 5);
  // the name on a panel over the entrance
  const lh = Math.min(0.62, (2 * R - 0.6) / (wordWidth(h.name) / 6));
  const w = (wordWidth(h.name) / 6) * lh;
  B.letters.setColor(letterColor);
  const fr0 = frameFrom(wp(f, bay0, 0, R + 0.02), wp(f, bay1, 0, R + 0.02));
  writeText(B.letters, h.name, wp(fr0, (fr0.len - w) / 2, h.gh - 1.25, 0.1), fr0.r, fr0.n, { height: lh });
}

function pylon(h: HotelSpec, B: HotelBuilders, ol: Outline, u: number, rng: Rng, letterColor: V3): void {
  const f = ol.front;
  const top = h.H + rng.range(4.5, 8.5);
  const out = rng.range(1.3, 1.7);
  const w = 0.42;
  B.trim.setColor(h.accent);
  wallBox(B.trim, f, u - w / 2, u + w / 2, h.gh - 0.4, top, 0, out);
  // cap and ball
  wallBox(B.trim, f, u - w / 2 - 0.08, u + w / 2 + 0.08, top, top + 0.16, -0.1, out + 0.1);
  B.metal.setColor([0.9, 0.9, 0.86]);
  const ball = wp(f, u, top + 0.16, out * 0.5);
  B.metal.cylinder(ball, ball.clone().setY(top + 0.75), 0.18, 0.02, 10);
  // stacked letters on both faces of the blade (they read up and down the street)
  const name = h.name.replace(/ /g, '');
  const vh = Math.min(0.85, (top - h.gh - 1.4) / (name.length * 1.27), out * 0.62);
  B.letters.setColor(letterColor);
  for (const s of [-1, 1]) {
    const faceN = f.r.clone().multiplyScalar(s);
    const along = f.n.clone().multiplyScalar(-s); // text "right" on that face
    const origin = wp(f, u + (s * w) / 2, top - 0.5, out / 2);
    writeText(B.letters, name, origin, along, faceN, { height: vh, vertical: true });
  }
  // stepped parapet at the other end
  const far = u < f.len / 2 ? f.len * 0.72 : f.len * 0.28;
  B.stucco.setColor(h.body);
  let y = h.H + h.parapet;
  let half = Math.min(3.2, f.len * 0.18);
  for (let s = 0; s < 3; s++) {
    const hgt = 0.75;
    wallBox(B.stucco, f, far - half, far + half, y, y + hgt, -0.3, 0);
    B.trim.setColor(h.trim);
    wallBox(B.trim, f, far - half - 0.04, far + half + 0.04, y + hgt, y + hgt + 0.09, -0.34, 0.05);
    y += hgt;
    half *= 0.62;
  }
}

function streamline(h: HotelSpec, B: HotelBuilders, ol: Outline, rng: Rng, letterColor: V3): void {
  const f = ol.front;
  // speed lines on the parapet and wrapping the corners
  B.trim.setColor(h.accent);
  const y0 = h.H + 0.2;
  const segs = [f, ...ol.arcN, ...ol.arcS];
  for (let k = 0; k < 3; k++) {
    const yy = y0 + k * 0.2;
    for (const fr of segs) wallBox(B.trim, fr, -0.02, fr.len + 0.02, yy, yy + 0.07, 0, 0.05);
  }
  // raised sign panel in the middle of the parapet
  const lh = Math.min(1.35, (f.len * 0.62) / (wordWidth(h.name) / 6));
  const w = (wordWidth(h.name) / 6) * lh;
  const pw = w + 1.2;
  const pu = (f.len - pw) / 2;
  const top = h.H + h.parapet + lh + 0.9;
  B.stucco.setColor(h.body);
  wallBox(B.stucco, f, pu, pu + pw, h.H + h.parapet, top, -0.3, 0);
  B.trim.setColor(h.trim);
  wallBox(B.trim, f, pu - 0.05, pu + pw + 0.05, top, top + 0.12, -0.34, 0.06);
  B.letters.setColor(letterColor);
  writeText(B.letters, h.name, wp(f, pu + 0.6, h.H + h.parapet + 0.45, 0.02), f.r, f.n, { height: lh });
  // a flagpole on one corner
  if (rng.chance(0.5)) {
    B.metal.setColor([0.88, 0.88, 0.85]);
    const p = wp(f, rng.chance(0.5) ? 0.6 : f.len - 0.6, h.H + h.parapet, -0.6);
    B.metal.cylinder(p, p.clone().setY(p.y + 4), 0.045, 0.03, 6);
  }
}

function groundFloor(h: HotelSpec, B: HotelBuilders, ol: Outline, ground: Opening[], doorU: number, doorW: number, near: boolean, rng: Rng, register: boolean): void {
  const f = ol.front;
  const yt = SIDEWALK_Y + h.terraceH;
  // striped awnings over the storefronts
  const [ca, cb] = h.awning;
  const awnOut = rng.range(1.6, 2.3);
  const awTop = h.gh - 0.55;
  const drop = rng.range(0.55, 0.85);
  const stripe = rng.pick([0.22, 0.3, 0.38]);
  const awn = (u0: number, u1: number, fr: WallFrame) => {
    const aw = B.awning;
    aw.setColor(ca);
    aw.auxv = [cb[0], cb[1], cb[2], stripe];
    const a = wp(fr, u0, awTop, 0.02);
    const b = wp(fr, u1, awTop, 0.02);
    const c = wp(fr, u1, awTop - drop, awnOut);
    const d = wp(fr, u0, awTop - drop, awnOut);
    aw.quad(d, c, b, a, [u0, 0, u1, 1]);
    // valance
    const e = wp(fr, u1, awTop - drop - 0.32, awnOut);
    const g = wp(fr, u0, awTop - drop - 0.32, awnOut);
    aw.quad(g, e, c, d, [u0, 0, u1, 0.3]);
    // side cheeks
    aw.tri(a, d, wp(fr, u0, awTop - drop, 0.02), [0, 1], [awnOut, 0], [0, 0]);
    aw.tri(b, wp(fr, u1, awTop - drop, 0.02), c, [0, 1], [0, 0], [awnOut, 0]);
    // frame arms
    B.metal.setColor([0.25, 0.25, 0.26]);
    for (const u of [u0 + 0.05, u1 - 0.05]) B.metal.cylinder(wp(fr, u, awTop - drop - 0.25, 0.02), wp(fr, u, awTop - drop, awnOut - 0.05), 0.018, 0.018, 4, false);
  };
  const stores = ground.filter((o) => o.kind === 'store');
  if (rng.chance(0.75)) {
    // one long awning per side of the door
    const left = stores.filter((o) => o.u1 < doorU);
    const right = stores.filter((o) => o.u0 > doorU + doorW);
    if (left.length) awn(left[0].u0 - 0.2, left[left.length - 1].u1 + 0.2, f);
    if (right.length) awn(right[0].u0 - 0.2, right[right.length - 1].u1 + 0.2, f);
  } else for (const o of stores) awn(o.u0 - 0.15, o.u1 + 0.15, f);
  if (h.roundN > 0 || h.roundS > 0) for (const fr of [...ol.arcN, ...ol.arcS]) awn(0, fr.len, fr);

  // marquee over the door with the name in small letters
  B.trim.setColor(h.trim);
  const mq0 = doorU - 0.6;
  const mq1 = doorU + doorW + 0.6;
  const mqY = h.gh - 0.62;
  wallBox(B.trim, f, mq0, mq1, mqY, mqY + 0.34, 0, 2.0);
  const lh = Math.min(0.26, ((mq1 - mq0 - 0.3) * 6) / wordWidth(h.name));
  const w = (wordWidth(h.name) / 6) * lh;
  B.letters.setColor(h.letter);
  const mf = frameFrom(wp(f, mq0, 0, 2.0), wp(f, mq1, 0, 2.0));
  writeText(B.letters, h.name, wp(mf, (mf.len - w) / 2, mqY + 0.04, 0.0), mf.r, mf.n, { height: lh, weight: 0.16 });

  // terrace
  const x0 = h.xf;
  const x1 = X.terraceEdge;
  const z0 = h.z0 + 0.25;
  const z1 = h.z1 - 0.25;
  if (x1 - x0 < 1.5) return;
  B.tiles.setColor(lin(rng.pick(['#e9d9c4', '#d9c3b3', '#e8e2d6', '#cfc6c0', '#e6cdb8'])));
  B.tiles.box(x0, 0, z0, x1, yt, z1, ['nx']);
  const doorZ = wp(f, doorU + doorW / 2, 0).z;
  const stepW = 2.6;
  const high = h.terraceH > 0.3;
  if (high) {
    // low wall with a gap for the steps, and the steps themselves
    B.stucco.setColor(h.body);
    const wallH = yt + 0.72;
    const zs0 = doorZ - stepW / 2;
    const zs1 = doorZ + stepW / 2;
    B.stucco.box(x1 - 0.22, yt, z0, x1, wallH, zs0);
    B.stucco.box(x1 - 0.22, yt, zs1, x1, wallH, z1);
    B.trim.setColor(h.trim);
    B.trim.box(x1 - 0.26, wallH, z0, x1 + 0.04, wallH + 0.07, zs0);
    B.trim.box(x1 - 0.26, wallH, zs1, x1 + 0.04, wallH + 0.07, z1);
    const nSteps = Math.round(h.terraceH / 0.16);
    const sd = 0.32;
    B.tiles.setColor([0.78, 0.74, 0.7]);
    for (let s = 0; s < nSteps; s++) {
      const top = SIDEWALK_Y + (h.terraceH * (nSteps - s)) / nSteps;
      B.tiles.box(x1 + s * sd, 0, zs0, x1 + (s + 1) * sd, top - (h.terraceH / nSteps) * 0, zs1);
    }
    if (register) {
      addHeightBox({ x0, x1, z0, z1, y: yt, surface: 'tile' });
      addHeightBox({ x0: x1, x1: x1 + nSteps * sd, z0: zs0, z1: zs1, y: SIDEWALK_Y, ramp: { axis: '-x', rise: h.terraceH, step: h.terraceH / nSteps }, surface: 'tile' });
      addAABB(x1 - 0.22, z0, x1, zs0, 0, wallH, 'wall');
      addAABB(x1 - 0.22, zs1, x1, z1, 0, wallH, 'wall');
      // the ends of the terrace are walls too
      addAABB(x0, z0 - 0.02, x1, z0 + 0.02, 0, yt, 'wall');
      addAABB(x0, z1 - 0.02, x1, z1 + 0.02, 0, yt, 'wall');
    }
  } else if (register) {
    addHeightBox({ x0, x1, z0, z1, y: yt, surface: 'tile' });
  }

  // café tables on the terrace
  const cols = Math.floor((x1 - x0 - 0.6) / 2.1);
  const rows = Math.floor((z1 - z0 - 0.8) / 2.5);
  const umb = rng.pick([1, 2, 3, 1, 3]) as 1 | 2 | 3;
  if (cols >= 1 && rows >= 1) {
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const x = x0 + 1.2 + i * 2.1 + rng.range(-0.15, 0.15);
        const z = z0 + 1.3 + j * 2.5 + rng.range(-0.2, 0.2);
        if (Math.abs(z - doorZ) < 1.6) continue;
        h.cafe.push({ x, z, y: yt, umbrella: rng.chance(0.75) ? umb : 0, seats: rng.chance(0.6) ? 4 : 2, rot: rng.range(0, Math.PI) });
      }
  }
  void near;
}

function meshesFor(B: HotelBuilders, name: string, group: Group): Mesh[] {
  const lib = materials();
  const pairs: [keyof HotelBuilders, Material, boolean][] = [
    ['stucco', lib.stucco, false],
    ['trim', lib.trim, false],
    ['glass', lib.glass, true],
    ['metal', lib.metal, false],
    ['letters', lib.letters, false],
    ['awning', lib.awning, true],
    ['tiles', lib.tiles, false],
  ];
  const out: Mesh[] = [];
  for (const [k, mat, aux] of pairs) {
    const b = B[k];
    if (!b.count) continue;
    const m = new Mesh(b.build(aux), mat);
    m.name = `${name}-${k}`;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    out.push(m);
  }
  return out;
}

export function buildHotels(ctx: Ctx): HotelRow {
  void ctx;
  const specs = planHotels(DISTRICT_BLOCKS, 19361, 0);
  const group = new Group();
  group.name = 'hotels';
  const blocks: { z0: number; z1: number; near: Group; far: Group }[] = [];
  DISTRICT_BLOCKS.forEach(({ z0: za, z1: zb }, bi) => {
    const nearB = newBuilders();
    const farB = newBuilders();
    const inBlock = specs.filter((s) => s.z0 >= za - 1e-6 && s.z1 <= zb + 1e-6);
    for (const s of inBlock) {
      buildHotel(s, nearB, true, true);
      s.cafe.length = 0; // near pass filled it; far pass refills identically
      buildHotel(s, farB, false, false);
    }
    const near = new Group();
    const far = new Group();
    meshesFor(nearB, `block${bi}-near`, near);
    for (const m of meshesFor(farB, `block${bi}-far`, far)) m.castShadow = false;
    // café furniture only in the near version
    near.add(buildCafes(inBlock.flatMap((s) => s.cafe)));
    far.visible = false;
    group.add(near, far);
    blocks.push({ z0: za, z1: zb, near, far });
  });

  // Ocean Drive carries on past the district, far LOD only
  const beyond = planHotels(farBlocks(), 5171, 17);
  const beyondB = newBuilders();
  for (const s of beyond) buildHotel(s, beyondB, false, false);
  const beyondG = new Group();
  for (const m of meshesFor(beyondB, 'beyond', beyondG)) m.castShadow = false;
  group.add(beyondG);

  // the café with the music: a terrace near the middle of the district
  const withCafe = specs.filter((s) => s.cafe.length >= 4);
  const pick = withCafe.reduce((best, s) => (Math.abs((s.z0 + s.z1) / 2 - 25) < Math.abs((best.z0 + best.z1) / 2 - 25) ? s : best), withCafe[0]);
  const musicSpot = new Vector3((pick.xf + X.terraceEdge) / 2, SIDEWALK_Y + pick.terraceH + 1.2, (pick.z0 + pick.z1) / 2);

  return {
    group,
    specs,
    musicSpot,
    update(cam: Vector3) {
      for (const b of blocks) {
        const dz = cam.z < b.z0 ? b.z0 - cam.z : cam.z > b.z1 ? cam.z - b.z1 : 0;
        const d = Math.hypot(dz, Math.max(0, cam.x - X.facade) * 0.35);
        const nearNow = b.near.visible ? d < 175 : d < 160;
        b.near.visible = nearNow;
        b.far.visible = !nearNow;
      }
    },
  };
}
