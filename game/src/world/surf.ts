// The surf schedule: every breaker has a break time, a height, a slight angle to the beach and a run-up,
// all from integer hashes of its index. The ocean shader, the wet sand, the walker's feet and the wave
// sounds all evaluate the same functions (GLSL below, JS here, bit-for-bit the same hashes), so the swash
// you see reach your feet is the swash you hear.
import { hash2i, hashU, vnoise1 } from '../core/rng';
import { X } from './layout';

export const WAVE_DT = 9.5;
export const X_BREAK = 140;
export const X_SHORE = X.shore;
export const C_SWELL = 5.2;
export const C_BORE = 3.0;
export const TAU_S = (X_BREAK - X_SHORE) / C_BORE;

export interface Wave {
  k: number;
  /** break time at z = 0 */
  T: number;
  /** alongshore delay (s/m) */
  s: number;
  /** breaker height scale (m) */
  A: number;
  /** run-up scale (m, up the beach from the waterline) */
  R: number;
}

const hk = (k: number, j: number) => hashU((Math.imul((k & 63) + 7, 0x9e3779b1) ^ Math.imul(j + 3, 0x85ebca77)) >>> 0);

export function wave(k: number): Wave {
  const A = (0.34 + 0.5 * hk(k, 2)) * (0.82 + 0.26 * Math.sin((k & 63) * 0.83));
  return { k, T: k * WAVE_DT + (hk(k, 0) - 0.5) * 3.2, s: (hk(k, 1) - 0.5) * 0.016, A, R: 3.5 + 7.5 * A };
}

/** Break time of wave w at alongshore position z. */
export function breakTime(w: Wave, z: number): number {
  return w.T + w.s * z + (vnoise1(z / 60 + (w.k & 63) * 7.31, 1) - 0.5) * 1.8;
}
export function localA(w: Wave, z: number): number {
  // waves break in sections: some stretches stand up, some barely do
  const n = vnoise1(z / 38 + (w.k & 63) * 3.7, 2);
  return w.A * (0.45 + 1.0 * n * n);
}
export function localR(w: Wave, z: number): number {
  return w.R * (0.8 + 0.4 * vnoise1(z / 35 + (w.k & 63) * 5.1, 3));
}
export function tUp(a: number): number {
  return 2.2 + 0.6 * a;
}
export function tDown(a: number): number {
  return 3.1 + 0.9 * a;
}

/** Run-up distance (m up the beach from the waterline) of one wave at time τ' after it reaches the shore. */
export function runup(r: number, a: number, tp: number): number {
  const up = tUp(a);
  const dn = tDown(a);
  if (tp < 0 || tp > up + dn) return 0;
  if (tp < up) {
    const u = 1 - tp / up;
    return r * (1 - u * u);
  }
  const u = (tp - up) / dn;
  return r * (1 - u * u);
}

export interface SwashState {
  /** water depth over the sand at x (m), 0 when dry */
  depth: number;
  /** current edge of the film (x): furthest up the beach any wave has reached right now */
  edgeX: number;
  /** is the water there running up (1) or back (-1) */
  flow: number;
  /** furthest run-up of the last waves (x of the high mark) */
  highX: number;
}

/** The swash front isn't a ruler line: fingers and small cusps along the beach. */
export function edgeWobble(z: number, k: number): number {
  return 1 + 0.1 * (vnoise1(z * 0.35 + (k & 63) * 1.7, 4) - 0.5) + 0.06 * (vnoise1(z * 1.3 + (k & 63) * 2.9, 5) - 0.5);
}

/** Swash at (x, z, t). */
export function swashAt(x: number, z: number, t: number, out: SwashState = { depth: 0, edgeX: X_SHORE, flow: 0, highX: X_SHORE }): SwashState {
  const kc = Math.floor(t / WAVE_DT);
  out.depth = 0;
  out.edgeX = X_SHORE;
  out.flow = 0;
  out.highX = X_SHORE;
  const dist = X_SHORE - x;
  for (let k = kc - 3; k <= kc + 1; k++) {
    const w = wave(k);
    const tau = t - breakTime(w, z);
    const tp = tau - TAU_S;
    const a = localA(w, z);
    const r = localR(w, z);
    if (tp > -0.1 && tp < 40) out.highX = Math.min(out.highX, X_SHORE - r);
    const s = runup(r, a, tp) * edgeWobble(z, w.k);
    if (s <= 0) continue;
    const edge = X_SHORE - s;
    if (edge < out.edgeX) {
      out.edgeX = edge;
      out.flow = tp < tUp(a) ? 1 : -1;
    }
    if (s > dist) out.depth = Math.max(out.depth, 0.015 + 0.07 * ((s - Math.max(dist, 0)) / r));
  }
  return out;
}

/** Break events between t0 and t1 at z (for the wave sounds): [time, strength]. */
export function breaksBetween(z: number, t0: number, t1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = Math.floor(t0 / WAVE_DT) - 2; k <= Math.floor(t1 / WAVE_DT) + 2; k++) {
    const w = wave(k);
    const tb = breakTime(w, z);
    if (tb >= t0 && tb < t1) out.push([tb, localA(w, z)]);
  }
  return out;
}

/** GLSL twin of the functions above. */
export const SURF_GLSL = /* glsl */ `
const float WAVE_DT = ${WAVE_DT.toFixed(3)};
const float X_BREAK = ${X_BREAK.toFixed(3)};
const float X_SHORE = ${X_SHORE.toFixed(3)};
const float C_SWELL = ${C_SWELL.toFixed(3)};
const float C_BORE = ${C_BORE.toFixed(3)};
const float TAU_S = ${TAU_S.toFixed(5)};

float hashU(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return float(x) / 4294967296.0;
}
float hash2i(int i, int k) {
  return hashU((uint(i + 4096) * 0x9e3779b1u) ^ (uint(k + 4096) * 0x85ebca77u));
}
float vnoise1(float u, int k) {
  float fi = floor(u);
  float f = u - fi;
  float s = f * f * (3.0 - 2.0 * f);
  int i = int(fi);
  return mix(hash2i(i, k), hash2i(i + 1, k), s);
}
float hk(int k, int j) {
  return hashU((uint((k & 63) + 7) * 0x9e3779b1u) ^ (uint(j + 3) * 0x85ebca77u));
}
// wave k: (T, s, A, R)
vec4 waveK(int k) {
  float A = (0.34 + 0.5 * hk(k, 2)) * (0.82 + 0.26 * sin(float(k & 63) * 0.83));
  return vec4(float(k) * WAVE_DT + (hk(k, 0) - 0.5) * 3.2, (hk(k, 1) - 0.5) * 0.016, A, 3.5 + 7.5 * A);
}
float breakTime(vec4 w, int k, float z) { return w.x + w.y * z + (vnoise1(z / 60.0 + float(k & 63) * 7.31, 1) - 0.5) * 1.8; }
float localA(vec4 w, int k, float z) { float n = vnoise1(z / 38.0 + float(k & 63) * 3.7, 2); return w.z * (0.45 + 1.0 * n * n); }
float localR(vec4 w, int k, float z) { return w.w * (0.8 + 0.4 * vnoise1(z / 35.0 + float(k & 63) * 5.1, 3)); }
float tUp(float a) { return 2.2 + 0.6 * a; }
float tDown(float a) { return 3.1 + 0.9 * a; }
float edgeWobble(float z, int k) {
  return 1.0 + 0.1 * (vnoise1(z * 0.35 + float(k & 63) * 1.7, 4) - 0.5) + 0.06 * (vnoise1(z * 1.3 + float(k & 63) * 2.9, 5) - 0.5);
}
float runup(float r, float a, float tp) {
  float up = tUp(a);
  float dn = tDown(a);
  if (tp < 0.0 || tp > up + dn) return 0.0;
  if (tp < up) { float u = 1.0 - tp / up; return r * (1.0 - u * u); }
  float u = (tp - up) / dn;
  return r * (1.0 - u * u);
}
`;

void hash2i;
