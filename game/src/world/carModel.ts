// Procedural road cars, built as smooth lofts: a rounded cross-section (tucked sill, slightly bellied side,
// rolled shoulder, glasshouse leaning in, roof rail, crowned roof or hood) swept along the car, its heights
// and widths following smooth profiles, so hood, windscreen, roof, rear glass and deck flow into each other
// and the wheel arches are cut round. Faces are then sorted into paint, flush glass (with black seals and
// frit), lenses, grille, trim and interior; wheels are alloys with brake discs and callipers; a cabin with
// seats, dash and steering wheel sits behind the glass. Local space: front +Z, left +X, wheels on y = 0.
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { GeoBuilder, type V3 } from '../core/builder';
import { lin } from './materials';

export type Kind = 'sedan' | 'suv' | 'hatch' | 'pickup' | 'convertible' | 'classic';

type Pts = [number, number][];
type Range = [number, number];

export interface Design {
  kind: Kind;
  L: number;
  W: number;
  wheelR: number;
  track: number;
  /** axle positions along z */
  wf: number;
  wr: number;
  tyreW: number;
  /** centreline height of the top surface (hood, roof, deck) along z (front = +z) */
  top: Pts;
  /** shoulder line */
  belt: Pts;
  /** bottom of bumpers and sills (the arches are cut separately) */
  bot: Pts;
  /** body half width */
  half: Pts;
  /** half width of the top surface (roof, hood, deck) */
  roof: Pts;
  /** plan-view corner radius at the rear and the front */
  corner: Range;
  /** where the top may drop below the shoulder: fins, cockpit tubs, a pickup bed */
  valley?: Range;
  wind?: Range;
  rearGlass?: Range;
  /** rear end of the side glass (it runs forward to the A pillar) */
  sideRear?: number;
  pillarB?: number;
  /** open cockpit (convertibles) */
  open?: Range;
  /** pickup bed */
  bed?: Range;
  /** door shut lines along z: front of the front door, B pillar, rear of the rear door */
  seams: [number, number, number];
  /** hood rear shut line, boot lid front shut line (99: none), half width of the lids */
  hood: number;
  trunk: number;
  lid: number;
  headY: Range;
  tailY: Range;
  interior: string;
  wheel: 'alloy' | 'steel' | 'classic' | 'mesh';
  caliper: string;
}

export const DESIGNS: Record<Kind, Design> = {
  sedan: {
    kind: 'sedan', L: 4.88, W: 1.84, wheelR: 0.335, track: 1.58, wf: 1.4, wr: -1.42, tyreW: 0.225,
    top: [[-2.44, 0.8], [-2.36, 0.96], [-2.1, 1.02], [-1.62, 1.04], [-1.0, 1.36], [-0.72, 1.43], [-0.1, 1.46], [0.3, 1.44], [0.62, 1.29], [1.05, 1.02], [1.5, 0.95], [2.1, 0.87], [2.38, 0.77], [2.44, 0.68]],
    belt: [[-2.44, 0.86], [-2.2, 0.98], [-1.5, 1.02], [0, 1.0], [1.05, 0.98], [2.0, 0.9], [2.44, 0.78]],
    bot: [[-2.44, 0.36], [-2.2, 0.28], [2.2, 0.26], [2.44, 0.34]],
    half: [[-2.44, 0.86], [-2.0, 0.905], [0, 0.92], [1.9, 0.91], [2.44, 0.84]], corner: [0.3, 0.36],
    roof: [[-2.44, 0.7], [-1.62, 0.84], [-1.0, 0.65], [-0.6, 0.64], [0.3, 0.63], [0.9, 0.8], [1.2, 0.86], [2.44, 0.7]],
    wind: [0.3, 1.05], rearGlass: [-1.58, -0.76], sideRear: -1.46, pillarB: -0.12,
    seams: [0.98, -0.12, -1.28], hood: 1.09, trunk: -1.6, lid: 0.72,
    headY: [0.62, 0.74], tailY: [0.8, 0.92], interior: '#2c2c2f', wheel: 'alloy', caliper: '#3a3a3c',
  },
  suv: {
    kind: 'suv', L: 4.62, W: 1.86, wheelR: 0.36, track: 1.6, wf: 1.33, wr: -1.37, tyreW: 0.245,
    top: [[-2.31, 1.18], [-2.27, 1.62], [-2.12, 1.7], [-1.0, 1.72], [0.2, 1.71], [0.64, 1.5], [1.12, 1.13], [1.8, 1.06], [2.2, 0.99], [2.31, 0.88]],
    belt: [[-2.31, 1.02], [-2.1, 1.1], [0, 1.1], [1.1, 1.09], [2.0, 1.02], [2.31, 0.9]],
    bot: [[-2.31, 0.44], [-2.1, 0.36], [2.0, 0.36], [2.31, 0.46]],
    half: [[-2.31, 0.88], [-2.0, 0.92], [0, 0.93], [2.0, 0.9], [2.31, 0.84]], corner: [0.24, 0.3],
    roof: [[-2.31, 0.8], [-2.2, 0.68], [0.2, 0.68], [0.8, 0.78], [1.2, 0.85], [2.31, 0.75]],
    wind: [0.2, 1.12], rearGlass: [-2.31, -2.27], sideRear: -2.02, pillarB: -0.25,
    seams: [1.05, -0.25, -1.45], hood: 1.16, trunk: 99, lid: 0.74,
    headY: [0.8, 0.92], tailY: [0.96, 1.12], interior: '#2a2a2c', wheel: 'alloy', caliper: '#2f2f31',
  },
  hatch: {
    kind: 'hatch', L: 4.26, W: 1.79, wheelR: 0.315, track: 1.54, wf: 1.28, wr: -1.34, tyreW: 0.21,
    top: [[-2.13, 0.92], [-2.05, 1.05], [-1.9, 1.3], [-1.55, 1.45], [-0.5, 1.48], [0.15, 1.46], [0.55, 1.28], [0.98, 0.98], [1.6, 0.88], [2.0, 0.78], [2.13, 0.68]],
    belt: [[-2.13, 0.92], [-1.9, 0.98], [0, 0.97], [1.0, 0.95], [1.9, 0.86], [2.13, 0.74]],
    bot: [[-2.13, 0.36], [-1.95, 0.27], [1.95, 0.25], [2.13, 0.33]],
    half: [[-2.13, 0.84], [-1.9, 0.88], [0, 0.895], [1.8, 0.87], [2.13, 0.8]], corner: [0.24, 0.34],
    roof: [[-2.13, 0.72], [-1.9, 0.66], [-1.5, 0.64], [0.15, 0.63], [0.7, 0.77], [1.0, 0.82], [2.13, 0.68]],
    wind: [0.15, 0.98], rearGlass: [-2.02, -1.58], sideRear: -1.55, pillarB: -0.3,
    seams: [0.95, -0.3, -1.5], hood: 1.01, trunk: 99, lid: 0.7,
    headY: [0.62, 0.74], tailY: [0.86, 1.0], interior: '#303033', wheel: 'alloy', caliper: '#3c3c3e',
  },
  pickup: {
    kind: 'pickup', L: 5.6, W: 2.02, wheelR: 0.39, track: 1.72, wf: 1.72, wr: -1.85, tyreW: 0.27,
    top: [[-2.8, 1.28], [-2.72, 0.93], [-0.68, 0.93], [-0.6, 1.24], [-0.55, 1.86], [0.45, 1.9], [0.92, 1.54], [1.28, 1.22], [2.1, 1.15], [2.6, 1.08], [2.8, 0.95]],
    belt: [[-2.8, 1.3], [-0.66, 1.3], [-0.55, 1.23], [1.25, 1.2], [2.4, 1.12], [2.8, 1.0]],
    bot: [[-2.8, 0.55], [-2.5, 0.46], [2.4, 0.46], [2.8, 0.56]],
    half: [[-2.8, 1.0], [0, 1.01], [2.5, 1.0], [2.8, 0.96]], corner: [0.1, 0.22],
    roof: [[-2.8, 0.9], [-0.68, 0.88], [-0.55, 0.72], [0.45, 0.72], [1.0, 0.85], [1.3, 0.92], [2.8, 0.85]],
    valley: [-2.8, -0.55], wind: [0.45, 1.26], rearGlass: [-0.6, -0.55], sideRear: -0.5, pillarB: -0.05, bed: [-2.72, -0.6],
    seams: [1.2, -0.5, -0.5], hood: 1.3, trunk: 99, lid: 0.8,
    headY: [0.96, 1.08], tailY: [0.82, 1.2], interior: '#3a3632', wheel: 'steel', caliper: '#2a2a2a',
  },
  convertible: {
    kind: 'convertible', L: 4.5, W: 1.82, wheelR: 0.33, track: 1.56, wf: 1.3, wr: -1.34, tyreW: 0.235,
    top: [[-2.25, 0.84], [-2.1, 0.94], [-1.45, 0.96], [-1.35, 0.46], [0.56, 0.46], [0.66, 0.95], [1.2, 0.9], [2.0, 0.8], [2.25, 0.7]],
    belt: [[-2.25, 0.86], [-2.0, 0.96], [0, 0.965], [1.2, 0.93], [2.0, 0.84], [2.25, 0.72]],
    bot: [[-2.25, 0.34], [-2.05, 0.26], [2.05, 0.25], [2.25, 0.32]],
    half: [[-2.25, 0.84], [-1.9, 0.89], [0, 0.91], [1.9, 0.89], [2.25, 0.82]], corner: [0.3, 0.36],
    roof: [[-2.25, 0.7], [-1.5, 0.82], [0.6, 0.82], [1.2, 0.84], [2.25, 0.7]],
    valley: [-1.47, 0.68], open: [-1.35, 0.62],
    seams: [0.95, -0.55, -0.55], hood: 0.7, trunk: -1.52, lid: 0.72,
    headY: [0.62, 0.72], tailY: [0.74, 0.84], interior: '#b39a78', wheel: 'mesh', caliper: '#9c1b1b',
  },
  classic: {
    kind: 'classic', L: 5.35, W: 1.99, wheelR: 0.37, track: 1.6, wf: 1.55, wr: -1.4, tyreW: 0.21,
    top: [[-2.67, 0.9], [-2.5, 0.92], [-1.65, 0.9], [-1.55, 0.5], [0.44, 0.5], [0.54, 0.9], [1.4, 0.88], [2.3, 0.84], [2.67, 0.74]],
    belt: [[-2.67, 1.08], [-2.45, 1.13], [-1.9, 1.02], [-1.3, 0.95], [0, 0.93], [1.5, 0.92], [2.4, 0.88], [2.67, 0.78]],
    bot: [[-2.67, 0.44], [-2.4, 0.3], [2.4, 0.3], [2.67, 0.42]],
    half: [[-2.67, 0.95], [-2.3, 0.98], [0, 0.995], [2.3, 0.99], [2.67, 0.93]], corner: [0.14, 0.2],
    roof: [[-2.67, 0.78], [-2.3, 0.78], [-1.5, 0.84], [0.5, 0.86], [1.4, 0.9], [2.67, 0.8]],
    valley: [-2.7, 0.6], open: [-1.55, 0.52],
    seams: [0.95, -0.62, -0.62], hood: 0.58, trunk: -1.78, lid: 0.78,
    headY: [0.6, 0.72], tailY: [0.92, 1.08], interior: '#a3272c', wheel: 'classic', caliper: '#3a3a3a',
  },
};

/** Three levels of detail: near (cabin, full wheels), mid, far. */
export const LOD_DETAIL = [1, 0.5, 0.2] as const;

/** Monotone cubic interpolation through (z, v) points (no overshoot). */
function curve(pts: Pts): (z: number) => number {
  const n = pts.length;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (z: number) => {
    if (z <= xs[0]) return ys[0];
    if (z >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && z > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (z - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const inside = (r: Range | undefined, z: number) => !!r && z > r[0] && z < r[1];

/** points per half section, from the underside centre round to the top centre */
const HALF = 20;

type Zone = 'under' | 'corner' | 'side' | 'shoulder' | 'seal' | 'green' | 'rail' | 'top';
/** zone of the strip between section point k and k+1 */
const ZONES: Zone[] = ['under', 'under', 'corner', 'corner', 'corner', 'side', 'side', 'side', 'side', 'shoulder', 'shoulder', 'seal', 'green', 'green', 'green', 'rail', 'rail', 'top', 'top', 'top'];
/** the far level keeps fewer section points (zone boundaries stay) */
const KEEP_FAR = [0, 2, 3, 5, 7, 9, 11, 12, 14, 15, 17, 19];

interface Profiles {
  top: (z: number) => number;
  belt: (z: number) => number;
  bot: (z: number) => number;
  half: (z: number) => number;
  roof: (z: number) => number;
}

function profiles(d: Design): Profiles {
  return { top: curve(d.top), belt: curve(d.belt), bot: curve(d.bot), half: curve(d.half), roof: curve(d.roof) };
}

const quadBez = (a: [number, number], c: [number, number], b: [number, number], t: number): [number, number] => [
  (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
  (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
];

/** Right half of the cross-section at z: HALF points from the underside centre round to the top centre. */
function section(d: Design, pr: Profiles, z: number): [number, number][] {
  const ra = d.wheelR + 0.055;
  let yb = pr.bot(z);
  let flare = 0;
  for (const wz of [d.wf, d.wr]) {
    const dz = z - wz;
    if (Math.abs(dz) < ra) yb = Math.max(yb, d.wheelR + Math.sqrt(ra * ra - dz * dz));
    flare = Math.max(flare, 1 - smooth(ra * 0.85, ra * 1.5, Math.abs(dz)));
  }
  // round the corners in plan: a quarter circle at each end
  const cr = z > 0 ? d.corner[1] : d.corner[0];
  const dEnd = Math.abs(z) - (d.L / 2 - cr);
  const w = pr.half(z) + 0.012 * flare - (dEnd > 0 ? cr - Math.sqrt(Math.max(0, cr * cr - dEnd * dEnd)) : 0);
  const yT = pr.top(z);
  const valley = inside(d.valley, z);
  // outside the valleys the shoulder never stands above the hood or deck
  let yBelt = Math.max(pr.belt(z), yb + 0.12);
  if (!valley) yBelt = Math.min(yBelt, Math.max(yT + 0.03, yb + 0.12));
  const wR = Math.min(pr.roof(z), w - 0.05);
  const rB = Math.min(0.07, (yBelt - yb) * 0.25);
  const rS = Math.min(0.085, Math.max(0.02, (yBelt - yb) * 0.22));
  const p: [number, number][] = [];
  p.push([0, yb + 0.01], [w * 0.55, yb]);
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i / 3) * (Math.PI / 2);
    p.push([w - rB + Math.cos(a) * rB, yb + rB + Math.sin(a) * rB]);
  }
  // side: a slight outward belly
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const y = yb + rB + (yBelt - rS - yb - rB) * t;
    p.push([w + 0.016 * Math.sin(Math.PI * Math.min(1, t * 1.25)), y]);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 2) * (Math.PI / 2);
    p.push([w - rS + Math.cos(a) * rS, yBelt - rS + Math.sin(a) * rS]);
  }
  // p[11]: inner edge of the shoulder
  const S = p[p.length - 1];
  const crown = 0.03 + 0.01 * (wR / 0.9);
  const C: [number, number] = [0, yT + crown];
  // (a) hood, deck or tub: one curve from the shoulder to the centre line; a tub drops steeply to its floor
  const tub = yT + crown < S[1] - 0.06;
  const ctrl: [number, number] = tub ? [S[0] - 0.03, yT + crown * 0.5] : [wR * 0.75, Math.max(yT + crown * 0.8, (S[1] + yT) / 2)];
  const hood = [0.03, 0.18, 0.33, 0.48, 0.62, 0.76, 0.88, 1].map((t) => quadBez(S, ctrl, C, t));
  // (b) glasshouse: a seal, the glass leaning in, the roof rail, the crowned roof
  const h = yT - yBelt;
  const rR = Math.max(0.01, Math.min(0.07, h * 0.4));
  const Rr: [number, number] = [wR + rR, yT - rR];
  const cab: [number, number][] = [0.06, 0.36, 0.68].map((t) => [S[0] + (Rr[0] - S[0]) * t, S[1] + (Rr[1] - S[1]) * t]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 2) * (Math.PI / 2);
    cab.push([wR + Math.cos(a) * rR, yT - rR + Math.sin(a) * rR]);
  }
  cab.push([wR * 0.5, yT + crown * 0.75], [0, yT + crown]);
  const g = smooth(0.02, 0.14, h);
  for (let i = 0; i < 8; i++) p.push([hood[i][0] + (cab[i][0] - hood[i][0]) * g, hood[i][1] + (cab[i][1] - hood[i][1]) * g]);
  return p;
}

type Mat = 'paint' | 'glass' | 'dark' | 'interior' | 'chrome' | 'bed';

/** Colour and surface (roughness, metalness) of the part materials. */
const PART: Record<Exclude<Mat, 'paint' | 'glass'>, { c: string; r: number; m: number }> = {
  dark: { c: '#111214', r: 0.55, m: 0 },
  bed: { c: '#1b1b1c', r: 0.9, m: 0 },
  interior: { c: '#2c2c2f', r: 0.85, m: 0 },
  chrome: { c: '#e4e6e8', r: 0.06, m: 1 },
};

class Acc {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  aux: number[] = [];
  push(p: ArrayLike<number>, n: ArrayLike<number>, c: V3, a: [number, number, number, number]): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2]);
    this.aux.push(a[0], a[1], a[2], a[3]);
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aux', new BufferAttribute(new Float32Array(this.aux), 4));
    g.computeBoundingSphere();
    return g;
  }
}

export interface CarGeometry {
  /** body paint (the shut lines, lamps and grille are drawn by its shader, see paintParams) */
  paint: BufferGeometry;
  glass: BufferGeometry;
  /** everything else, vertex coloured; `aux` = roughness, metalness */
  parts: BufferGeometry;
}

/** What the paint shader needs to draw shut lines, handles, lamps and grille on this body (four vec4s). */
export function paintParams(d: Design): { seam: number[]; lid: number[]; head: number[]; tail: number[]; wrap: number[] } {
  const pr = profiles(d);
  const L2 = d.L / 2;
  const pickup = d.kind === 'pickup';
  return {
    // front door, B pillar, rear door (z); belt (y)
    seam: [d.seams[0], d.seams[1], d.seams[2], pr.belt(0)],
    // sill (y); hood and boot lines (z); lid half width
    lid: [pr.bot(0), d.hood, d.trunk, d.lid],
    // half length (0: no shader lamps), headlamp bottom and top (y), half width at the nose
    head: [d.kind === 'classic' ? 0 : L2, d.headY[0], d.headY[1], pr.half(L2 - 0.25)],
    // tail lamp bottom and top (y), half width at the tail, grille half width
    tail: [d.tailY[0], d.tailY[1], pr.half(-L2 + 0.25), pickup ? 0.5 : 0.42],
    // how far the lamps wrap: head back along the flank, head in across the nose, tail along, tail across
    wrap: [pickup ? 0.2 : 0.3, pickup ? 0.3 : 0.42, pickup ? 0.1 : 0.16, pickup ? 0.13 : 0.52],
  };
}

/** The body, sorted by material, plus details. `detail` is one of LOD_DETAIL. */
export function buildBody(d: Design, detail: number): CarGeometry {
  const pr = profiles(d);
  const L2 = d.L / 2;
  const near = detail > 0.6;
  const far = detail < 0.3;
  // stations: evenly spaced (denser towards the ends), every material boundary, the arch curves
  const zs = new Set<number>();
  const n = Math.max(14, Math.round(52 * detail));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const e = u < 0.5 ? 0.5 * Math.pow(2 * u, 1.25) : 1 - 0.5 * Math.pow(2 * (1 - u), 1.25);
    zs.add(-L2 + d.L * e);
  }
  const ra = d.wheelR + 0.055;
  const cornerN = near ? 6 : far ? 2 : 4;
  for (const [sg, cr] of [[-1, d.corner[0]], [1, d.corner[1]]] as [number, number][])
    for (let k = 0; k < cornerN; k++) zs.add(sg * (L2 - cr + cr * Math.sin(((k + 1) / (cornerN + 1)) * (Math.PI / 2))));
  const archN = near ? 12 : far ? 3 : 6;
  for (const wz of [d.wf, d.wr]) for (let k = 0; k <= archN; k++) zs.add(wz + ra * Math.cos((k / archN) * Math.PI));
  const marks: number[] = [...(d.wind ?? []), ...(d.rearGlass ?? []), ...(d.open ?? []), ...(d.bed ?? [])];
  if (d.sideRear !== undefined) marks.push(d.sideRear);
  if (!far) {
    if (d.pillarB !== undefined) marks.push(d.pillarB - 0.055, d.pillarB + 0.055);
    if (d.sideRear !== undefined) marks.push(d.sideRear + 0.04);
    if (d.wind) marks.push(d.wind[0] + 0.05, d.wind[1] - 0.05);
    if (d.rearGlass && d.kind !== 'suv' && d.kind !== 'pickup') marks.push(d.rearGlass[0] + 0.04, d.rearGlass[1] - 0.04);
    // the steep walls of tubs and fins
    for (const [z] of d.top) marks.push(z);
  }
  for (const m of marks) zs.add(m);
  const Z = Array.from(zs)
    .filter((z) => z >= -L2 - 1e-6 && z <= L2 + 1e-6)
    .sort((a, b) => a - b)
    .filter((z, i, a) => i === 0 || z - a[i - 1] > 0.012);
  const keep = far ? KEEP_FAR : Array.from({ length: HALF }, (_, i) => i);
  const H = keep.length;
  const rows = Z.length;
  const cols = 2 * H - 2; // a closed loop sharing the bottom and top centre points
  const P = new Float32Array(rows * cols * 3);
  const sections: [number, number][][] = [];
  for (let j = 0; j < rows; j++) {
    const full = section(d, pr, Z[j]);
    const s = keep.map((k) => full[k]);
    sections.push(s);
    // loop: the right half bottom → top, then the left half top → bottom (mirrored, without the centres)
    for (let i = 0; i < cols; i++) {
      const [x, y] = i < H ? s[i] : s[2 * H - 2 - i];
      const o = (j * cols + i) * 3;
      P[o] = i < H ? x : -x;
      P[o + 1] = y;
      P[o + 2] = Z[j];
    }
  }
  // smooth normals over the grid (the loop wraps)
  const N = new Float32Array(P.length);
  const tz = new Vector3();
  const tu = new Vector3();
  const nn = new Vector3();
  const tmp = new Vector3();
  const at = (j: number, i: number, v: Vector3) => v.fromArray(P, (j * cols + i) * 3);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      at(Math.min(rows - 1, j + 1), i, tz).sub(at(Math.max(0, j - 1), i, tmp));
      at(j, (i + 1) % cols, tu).sub(at(j, (i - 1 + cols) % cols, tmp));
      nn.crossVectors(tu, tz).normalize();
      N.set([nn.x, nn.y, nn.z], (j * cols + i) * 3);
    }
  const acc = { paint: new Acc(), glass: new Acc(), parts: new Acc() };
  const none: [number, number, number, number] = [0, 0, 0, 0];
  const classify = (zone: Zone, cz: number, cy: number, cx: number): Mat => {
    const ax = Math.abs(cx);
    const front = L2 - cz;
    const rear = cz + L2;
    const gh = pr.top(cz) - pr.belt(cz);
    if (zone === 'under') return 'dark';
    const upper = zone === 'top' || zone === 'rail' || zone === 'green' || zone === 'seal';
    // inside a cockpit tub or a pickup bed (below the shoulder)
    if (upper && cy < pr.belt(cz) - 0.02 && ax < pr.half(cz) - 0.07) {
      if (d.open && cz > d.open[0] - 0.12 && cz < d.open[1] + 0.06) return 'interior';
      if (d.bed && cz > d.bed[0] - 0.1 && cz < d.bed[1]) return 'bed';
    }
    // (lamps and grilles are drawn by the paint shader; the classic's grille is chrome)
    if (d.kind === 'classic' && front < 0.12 && ax < 0.44 && cy > d.headY[0] - 0.16 && cy < d.headY[0] + 0.02) return 'chrome';
    if ((front < 0.16 || rear < 0.12) && cy < pr.bot(cz) + 0.12 && zone !== 'top') return 'dark';
    const sideGlass = d.sideRear !== undefined && !!d.wind && cz > d.sideRear && cz < d.wind[1];
    if (zone === 'seal') return sideGlass && gh > 0.1 ? 'dark' : 'paint';
    if (zone === 'green') {
      if (!sideGlass) return 'paint';
      if (gh <= 0.1) return 'dark';
      if (d.pillarB !== undefined && Math.abs(cz - d.pillarB) < 0.055) return 'dark';
      if (cz < d.sideRear! + 0.04) return 'dark';
      return 'glass';
    }
    if (zone === 'top') {
      if (d.wind && cz > d.wind[0] && cz < d.wind[1]) return cz > d.wind[1] - 0.05 || cz < d.wind[0] + 0.05 ? 'dark' : 'glass';
      if (d.rearGlass && cz > d.rearGlass[0] && cz < d.rearGlass[1]) {
        const frit = d.kind !== 'suv' && d.kind !== 'pickup' && (cz < d.rearGlass[0] + 0.04 || cz > d.rearGlass[1] - 0.04);
        return frit ? 'dark' : 'glass';
      }
    }
    return 'paint';
  };
  const emit = (mat: Mat, pts: ArrayLike<number>[], nor: ArrayLike<number>[]) => {
    const target = mat === 'paint' ? acc.paint : mat === 'glass' ? acc.glass : acc.parts;
    const part = mat === 'paint' || mat === 'glass' ? null : PART[mat];
    const col: V3 = part ? lin(mat === 'interior' ? d.interior : part.c) : [1, 1, 1];
    const aux: [number, number, number, number] = part ? [part.r, part.m, 0, 0] : none;
    for (let k = 0; k < pts.length; k++) target.push(pts[k], nor[k], col, aux);
  };
  const vtx = (j: number, i: number) => P.subarray((j * cols + i) * 3, (j * cols + i) * 3 + 3);
  const nrm = (j: number, i: number) => N.subarray((j * cols + i) * 3, (j * cols + i) * 3 + 3);
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < cols; i++) {
      const i2 = (i + 1) % cols;
      const k = i < H - 1 ? i : cols - 1 - i; // index along the half section
      const zone = ZONES[keep[Math.min(H - 2, Math.max(0, k))]];
      const a = vtx(j, i);
      const b = vtx(j, i2);
      const c = vtx(j + 1, i2);
      const e = vtx(j + 1, i);
      const cx = (a[0] + b[0] + c[0] + e[0]) / 4;
      const cy = (a[1] + b[1] + c[1] + e[1]) / 4;
      const cz = (a[2] + c[2]) / 2;
      const mat = classify(zone, cz, cy, cx);
      // counter-clockwise seen from outside
      emit(mat, [a, b, c, a, c, e], [nrm(j, i), nrm(j, i2), nrm(j + 1, i2), nrm(j, i), nrm(j + 1, i2), nrm(j + 1, i)]);
    }
  // end faces (fascias): bands between consecutive section points, split into columns so lamps, grille
  // and plate recess sort out
  // gently domed, so the fascia isn't a flat slab
  const colsCap = far ? 4 : 10;
  const BULGE = far ? 0 : 0.04;
  for (const [j, sgn] of [[0, -1], [rows - 1, 1]] as [number, number][]) {
    const s = sections[j];
    const cz = Z[j];
    const yLo = s[2][1];
    const yHi = s[H - 1][1];
    const vert = (u: number, x: number, y: number): [number[], number[]] => {
      const v = Math.min(1, Math.max(0, (y - yLo) / (yHi - yLo)));
      const fv = 4 * v * (1 - v);
      const b = BULGE * (1 - u * u) * fv;
      const bx = x > 1e-4 ? BULGE * ((-2 * u) / x) * fv : 0;
      const by = (BULGE * (1 - u * u) * 4 * (1 - 2 * v)) / (yHi - yLo);
      const l = Math.hypot(bx, by, 1);
      return [[u * x, y, cz + sgn * b], [-bx / l, -by / l, sgn / l]];
    };
    for (let k = 2; k < H - 1; k++) {
      const [x0, y0] = s[k];
      const [x1, y1] = s[k + 1];
      if (Math.abs(y1 - y0) < 1e-4 && Math.abs(x1 - x0) < 1e-4) continue;
      for (let c = 0; c < colsCap; c++) {
        const u0 = -1 + (2 * c) / colsCap;
        const u1 = -1 + (2 * (c + 1)) / colsCap;
        const [A, nA] = vert(u0, x0, y0);
        const [B, nB] = vert(u1, x0, y0);
        const [C, nC] = vert(u1, x1, y1);
        const [D, nD] = vert(u0, x1, y1);
        const mx = ((u0 + u1) / 2) * ((x0 + x1) / 2);
        const my = (y0 + y1) / 2;
        const mat = classify('side', cz - sgn * 0.001, my, mx);
        if (sgn > 0) emit(mat, [A, B, C, A, C, D], [nA, nB, nC, nA, nC, nD]);
        else emit(mat, [B, A, D, B, D, C], [nB, nA, nD, nB, nD, nC]);
      }
    }
  }
  const paint = acc.paint.build();
  const bodyGlass = acc.glass.build();
  // details: mirrors, plate, wipers, cabin, the specials
  const b = new GeoBuilder();
  const tone = (c: string, r: number, m: number) => {
    b.setColor(lin(c));
    b.auxv = [r, m, 0, 0];
  };
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  if (!far && d.wind) {
    // mirrors just behind the A pillars, glass facing back
    const mz = d.wind[1] - 0.2;
    const my = pr.belt(mz) + 0.08;
    for (const s of [-1, 1]) {
      const xi = s * (pr.half(mz) - 0.16);
      const xo = s * (pr.half(mz) + 0.16);
      tone('#141518', 0.35, 0.2);
      b.box(Math.min(xi, xo), my, mz - 0.09, Math.max(xi, xo), my + 0.12, mz + 0.04);
      tone('#aeb4b8', 0.03, 1);
      const xa = s * (pr.half(mz) + 0.01);
      const xb = s * (pr.half(mz) + 0.145);
      b.box(Math.min(xa, xb), my + 0.015, mz - 0.096, Math.max(xa, xb), my + 0.105, mz - 0.09);
    }
  }
  if (near) {
    // rear plate (Florida plates are rear only)
    const pz = -L2 - 0.012;
    const py = d.kind === 'pickup' ? 0.72 : (d.tailY[0] + pr.bot(-L2 + 0.05)) / 2 - 0.02;
    tone('#eeebe3', 0.5, 0);
    b.box(-0.26, py - 0.065, pz - 0.006, 0.26, py + 0.065, pz + 0.006);
    tone('#1f5a3a', 0.5, 0);
    for (let k = 0; k < 7; k++) if (k !== 3) b.box(-0.21 + k * 0.061, py - 0.035, pz - 0.009, -0.21 + k * 0.061 + 0.042, py + 0.03, pz - 0.006);
    tone('#e0762a', 0.5, 0);
    b.box(-0.02, py - 0.02, pz - 0.009, 0.02, py + 0.02, pz - 0.006);
    // wipers resting along the base of the screen
    if (d.wind) {
      const wz = d.wind[1] - 0.08;
      const wy = pr.top(wz) + 0.012;
      tone('#0e0e0f', 0.5, 0.2);
      for (const px of [0.52, -0.08]) b.bar(V(px, wy, wz), V(px - 0.5, wy + 0.025, wz - 0.03), V(0, 0.018, 0), 0.02);
    }
    // the cabin
    const ic = lin(d.interior);
    const seat = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, shade = 1) => {
      b.setColor([ic[0] * shade, ic[1] * shade, ic[2] * shade]);
      b.auxv = [0.8, 0, 0, 0];
      b.box(x0, y0, z0, x1, y1, z1);
    };
    const floor = d.open ? pr.top(0) + 0.02 : pr.bot(0) + 0.18;
    const cushion = floor + 0.26;
    const pb = d.pillarB ?? -0.1;
    const seatRows: { z: number; bench: boolean }[] =
      d.kind === 'classic' ? [{ z: -0.3, bench: true }, { z: -1.05, bench: true }]
      : d.kind === 'convertible' ? [{ z: -0.45, bench: false }]
      : d.kind === 'pickup' ? [{ z: 0.12, bench: true }]
      : [{ z: pb + 0.25, bench: false }, { z: pb - 0.72, bench: true }];
    for (const r of seatRows) {
      const xs = r.bench ? [0] : [-0.38, 0.38];
      for (const sx of xs) {
        const w = r.bench ? pr.half(r.z) * 2 - 0.34 : 0.5;
        seat(sx - w / 2, cushion - 0.12, r.z - 0.26, sx + w / 2, cushion, r.z + 0.24);
        seat(sx - w / 2, cushion, r.z - 0.34, sx + w / 2, cushion + 0.5, r.z - 0.2, 0.92);
        if (d.kind !== 'classic') for (const hx of r.bench ? [-0.45, 0, 0.45] : [0]) seat(sx + hx - 0.12, cushion + 0.52, r.z - 0.33, sx + hx + 0.12, cushion + 0.66, r.z - 0.23, 0.6);
      }
    }
    const dashZ = d.wind ? d.wind[1] - 0.22 : d.open![1] - 0.1;
    const dashY = pr.belt(dashZ) - 0.1;
    seat(-pr.half(dashZ) + 0.12, dashY - 0.2, dashZ - 0.18, pr.half(dashZ) - 0.12, dashY + 0.02, dashZ + 0.12, d.kind === 'classic' ? 1 : 0.45);
    if (!d.open && d.sideRear !== undefined) {
      // door cards and floor, so a look through the glass finds a closed cabin
      const zb = d.sideRear + 0.02;
      const hw = pr.half(0) - 0.09;
      for (const s of [-1, 1]) seat(s > 0 ? hw - 0.04 : -hw, floor - 0.02, zb, s > 0 ? hw : -hw + 0.04, pr.belt(0) - 0.03, dashZ, 0.55);
      seat(-hw, floor - 0.04, zb, hw, floor - 0.01, dashZ, 0.4);
    }
    // steering wheel on the left
    const sw = V(0.38, dashY + 0.02, dashZ - 0.3);
    tone('#161616', 0.5, 0);
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2;
      const a1 = ((k + 1) / 10) * Math.PI * 2;
      const p0 = V(sw.x + Math.cos(a0) * 0.18, sw.y + Math.sin(a0) * 0.17, sw.z + Math.sin(a0) * 0.06);
      const p1 = V(sw.x + Math.cos(a1) * 0.18, sw.y + Math.sin(a1) * 0.17, sw.z + Math.sin(a1) * 0.06);
      b.bar(p0, p1, V(0, 0, 0.025), 0.025);
    }
  }
  // open cars: a windscreen in a frame
  const extraGlass = new GeoBuilder();
  if (d.open) {
    const z0 = d.open[1] + 0.02;
    const y0 = pr.belt(z0);
    const hw = pr.half(z0) - 0.1;
    const top = y0 + (d.kind === 'classic' ? 0.4 : 0.36);
    const zt = z0 - (d.kind === 'classic' ? 0.28 : 0.42);
    const wrap = (u: number) => (d.kind === 'classic' ? 0.12 : 0.05) * Math.pow(Math.abs(u), 4);
    const segs = far ? 2 : 8;
    for (let i = 0; i < segs; i++) {
      const u0 = -1 + (2 * i) / segs;
      const u1 = -1 + (2 * (i + 1)) / segs;
      extraGlass.quad(V(u0 * hw, y0, z0 - wrap(u0)), V(u1 * hw, y0, z0 - wrap(u1)), V(u1 * hw * 0.96, top, zt - wrap(u1)), V(u0 * hw * 0.96, top, zt - wrap(u0)));
    }
    const f = PART[d.kind === 'classic' ? 'chrome' : 'dark'];
    tone(f.c, f.r, f.m);
    for (const s of [-1, 1]) b.bar(V(s * hw, y0, z0 - wrap(1)), V(s * hw * 0.96, top, zt - wrap(1)), V(0, 0, 0.03), 0.035);
    b.bar(V(-hw * 0.96, top, zt - wrap(1)), V(hw * 0.96, top, zt - wrap(1)), V(0, 0.035, 0), 0.03);
  }
  if (d.kind === 'classic') {
    // chrome: bumpers wrapping the corners, the side spear, round headlamps, bullet tail lamps in the fins
    const c = PART.chrome;
    tone(c.c, c.r, c.m);
    b.box(-0.84, 0.34, L2 - 0.05, 0.84, 0.5, L2 + 0.09);
    b.box(-0.86, 0.36, -L2 - 0.09, 0.86, 0.5, -L2 + 0.05);
    for (const s of [-1, 1]) {
      tone(c.c, c.r, c.m);
      if (!far) b.box(s * (pr.half(0) + 0.014) - 0.012, 0.74, -1.9, s * (pr.half(0) + 0.014) + 0.012, 0.765, 1.9);
      const hz = L2 - 0.02;
      b.cylinder(V(s * 0.68, 0.64, hz - 0.06), V(s * 0.68, 0.64, hz + 0.02), 0.11, 0.11, far ? 8 : 16, true);
      tone('#f2f0e6', 0.05, 0.3);
      b.cylinder(V(s * 0.68, 0.64, hz + 0.02), V(s * 0.68, 0.64, hz + 0.035), 0.095, 0.075, far ? 8 : 16, true);
      tone('#8e0f0f', 0.1, 0.1);
      const fx = s * (pr.half(-L2) - d.corner[0] - 0.02);
      b.cylinder(V(fx, 1.0, -L2 - 0.05), V(fx, 1.0, -L2 + 0.1), 0.05, 0.05, far ? 6 : 12, true);
    }
  }
  if (d.kind === 'suv' && !far) {
    tone('#1a1b1d', 0.4, 0.3);
    for (const s of [-1, 1]) b.bar(V(s * 0.6, 1.765, -1.8), V(s * 0.6, 1.765, 0.1), V(0, 0.035, 0), 0.04);
  }
  const extra = b.build(true);
  const pa = acc.parts.build();
  const merged = new BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['aux', 4]] as [string, number][]) {
    const A = pa.getAttribute(name).array as Float32Array;
    const B = extra.getAttribute(name).array as Float32Array;
    const out = new Float32Array(A.length + B.length);
    out.set(A);
    out.set(B, A.length);
    merged.setAttribute(name, new BufferAttribute(out, size));
  }
  merged.computeBoundingSphere();
  let glass = bodyGlass;
  if (extraGlass.count) {
    const xg = extraGlass.build();
    glass = new BufferGeometry();
    for (const name of ['position', 'normal']) {
      const A = bodyGlass.getAttribute(name).array as Float32Array;
      const B = xg.getAttribute(name).array as Float32Array;
      const out = new Float32Array(A.length + B.length);
      out.set(A);
      out.set(B, A.length);
      glass.setAttribute(name, new BufferAttribute(out, 3));
    }
    glass.computeBoundingSphere();
  }
  for (const gg of [paint, glass]) for (const a of ['color', 'aux']) if (gg.getAttribute(a)) gg.deleteAttribute(a);
  return { paint, glass, parts: merged };
}

/** One wheel (tyre, rim, disc, calliper), axle along X, outer face at +X; `aux` = roughness, metalness. */
export function buildWheel(d: Design, detail: number): BufferGeometry {
  const b = new GeoBuilder();
  const R = d.wheelR;
  const tw = d.tyreW;
  const rr = R * (d.kind === 'classic' ? 0.58 : d.kind === 'pickup' ? 0.6 : 0.66);
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const far = detail < 0.3;
  const seg = detail > 0.6 ? 28 : far ? 10 : 16;
  const tone = (c: string, r: number, m: number) => {
    b.setColor(lin(c));
    b.auxv = [r, m, 0, 0];
  };
  // a lathe band between two circles
  const ring = (x0: number, r0: number, x1: number, r1: number) => {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const p = (x: number, r: number, a: number) => V(x, Math.cos(a) * r, Math.sin(a) * r);
      b.quad(p(x0, r0, a0), p(x0, r0, a1), p(x1, r1, a1), p(x1, r1, a0));
    }
  };
  // tyre: inner sidewall, rounded shoulders, tread, outer sidewall (a whitewall band on the classic)
  const prof: [number, number][] = far
    ? [[-tw * 0.5, rr], [-tw * 0.5, R * 0.9], [-tw * 0.4, R], [tw * 0.4, R], [tw * 0.5, R * 0.9], [tw * 0.5, rr]]
    : [[-tw * 0.5, rr * 1.02], [-tw * 0.54, R * 0.72], [-tw * 0.54, R * 0.84], [-tw * 0.52, R * 0.92], [-tw * 0.44, R * 0.985], [-tw * 0.3, R], [tw * 0.3, R], [tw * 0.44, R * 0.985], [tw * 0.52, R * 0.92], [tw * 0.54, R * 0.84], [tw * 0.54, R * 0.72], [tw * 0.5, rr * 1.02]];
  for (let i = 0; i < prof.length - 1; i++) {
    const [x0, r0] = prof[i];
    const [x1, r1] = prof[i + 1];
    const tread = r0 >= R * 0.98 && r1 >= R * 0.98;
    const white = d.kind === 'classic' && !far && i === prof.length - 3;
    if (white) tone('#e9e6dc', 0.7, 0);
    else if (tread) tone('#0f0f10', 0.95, 0);
    else tone('#19191a', 0.78, 0);
    ring(x0, r0, x1, r1);
  }
  const face = tw * 0.4;
  const rimCol = d.wheel === 'steel' ? '#3a3b3d' : d.wheel === 'classic' ? '#e2e4e6' : '#c3c6c9';
  if (far) {
    tone(rimCol, 0.3, 1);
    b.cylinder(V(face - 0.02, 0, 0), V(face, 0, 0), rr, rr * 0.9, seg, true);
    return b.build(true);
  }
  // rim: the barrel inside, the lip
  tone('#2b2b2d', 0.6, 0.5);
  ring(tw * 0.42, rr, -tw * 0.42, rr);
  tone(rimCol, 0.22, 1);
  ring(tw * 0.46, rr * 1.03, tw * 0.44, rr * 0.9);
  // brake disc and calliper behind the spokes
  if (d.kind !== 'classic') {
    tone('#5b5d60', 0.45, 0.9);
    b.cylinder(V(-0.01, 0, 0), V(0.012, 0, 0), rr * 0.78, rr * 0.78, seg / 2, true);
    tone(d.caliper, 0.45, 0.2);
    const ca = 2.1;
    const radial = V(0, Math.cos(ca), Math.sin(ca));
    const tang = V(0, -Math.sin(ca), Math.cos(ca));
    b.obox(radial.clone().multiplyScalar(rr * 0.72).add(V(0.03, 0, 0)), V(0.028, 0, 0), radial.clone().multiplyScalar(0.04), tang.clone().multiplyScalar(0.07));
  }
  if (d.wheel === 'classic') {
    // chrome dish hubcap
    tone('#e2e4e6', 0.05, 1);
    b.cylinder(V(face - 0.02, 0, 0), V(face + 0.035, 0, 0), rr * 0.95, rr * 0.55, seg, true);
    b.cylinder(V(face + 0.035, 0, 0), V(face + 0.06, 0, 0), rr * 0.3, rr * 0.08, seg / 2, true);
    return b.build(true);
  }
  const spokes = d.wheel === 'steel' ? 6 : d.wheel === 'mesh' ? 10 : 5;
  tone(rimCol, d.wheel === 'steel' ? 0.4 : 0.25, 1);
  const hubX = face - 0.025;
  const rimX = face + 0.005;
  const w0 = d.wheel === 'mesh' ? 0.018 : 0.034;
  const w1 = d.wheel === 'mesh' ? 0.014 : 0.024;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.3;
    const dir = V(0, Math.cos(a), Math.sin(a));
    const side = V(0, -Math.sin(a), Math.cos(a));
    // a tapered spoke leaning out from hub to rim (its face and two sides)
    const p0 = V(hubX, 0, 0).addScaledVector(dir, 0.06);
    const p1 = V(rimX, 0, 0).addScaledVector(dir, rr * 0.93);
    const q = (p: Vector3, s: number, w: number, dx: number) => p.clone().addScaledVector(side, s * w).add(V(dx, 0, 0));
    b.quad(q(p0, -1, w0, 0), q(p1, -1, w1, 0), q(p1, 1, w1, 0), q(p0, 1, w0, 0));
    b.quad(q(p0, 1, w0, 0), q(p1, 1, w1, 0), q(p1, 1, w1, -0.03), q(p0, 1, w0, -0.03));
    b.quad(q(p0, -1, w0, -0.03), q(p1, -1, w1, -0.03), q(p1, -1, w1, 0), q(p0, -1, w0, 0));
  }
  // hub, centre cap, lug nuts
  b.cylinder(V(face - 0.04, 0, 0), V(face - 0.015, 0, 0), 0.075, 0.07, 16, true);
  tone('#8a8d90', 0.3, 1);
  b.cylinder(V(face - 0.015, 0, 0), V(face - 0.005, 0, 0), 0.035, 0.03, 12, true);
  if (detail > 0.6) {
    tone('#9ea1a4', 0.3, 1);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const c = V(face - 0.02, Math.cos(a) * 0.052, Math.sin(a) * 0.052);
      b.cylinder(c, c.clone().add(V(0.012, 0, 0)), 0.009, 0.008, 6, true);
    }
  }
  return b.build(true);
}
