// Single-scattering atmosphere (Rayleigh + Mie + ozone), evaluated twice: in GLSL to bake the sky dome and in
// JS for the sun's colour, the haze colours at the horizon and the light levels. Same constants in both, so
// the sunlight on the facades, the sky behind them and the haze in between all agree.
import { Vector3 } from 'three';

export const SUN_ELEVATION_DEG = 7;
/** from north (−Z) clockwise towards east (+X): a winter sunrise, a little south of east */
export const SUN_AZIMUTH_DEG = 112;

const el = (SUN_ELEVATION_DEG * Math.PI) / 180;
const az = (SUN_AZIMUTH_DEG * Math.PI) / 180;
/** unit vector towards the sun */
export const SUN_DIR = new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();

export const R_E = 6360e3;
export const R_A = 6420e3;
export const BETA_R: V3 = [5.802e-6, 13.558e-6, 33.1e-6];
export const H_R = 8000;
/** Mie scattering at 550 nm: humid, hazy tropical morning (aerosol optical depth ≈ 0.04) */
export const BETA_M550 = 2.2e-5;
/** Ångström exponent 1.2: the haze scatters blue a little more than red, which keeps the horizon peach-pink */
export const BETA_M: V3 = [BETA_M550 * Math.pow(680 / 550, -1.2), BETA_M550, BETA_M550 * Math.pow(440 / 550, -1.2)];
export const H_M = 1100;
export const BETA_O: V3 = [0.65e-6, 1.881e-6, 0.085e-6];
export const G_M = 0.74;
/** sun irradiance at the top of the atmosphere, in scene units */
export const SUN_E = 24;
/** crude multiple-scattering lift (sunlight, isotropic) */
export const MS_K = 1.0;
/** skylight that also lights the air: blue, isotropic; this is what turns the far haze peach-lavender */
export const SKY_AMB: V3 = [0.0042, 0.0066, 0.0118].map((v) => v * 24) as V3;

type V3 = [number, number, number];

function raySphere(o: V3, d: V3, r: number): [number, number] {
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
  const disc = b * b - c;
  if (disc < 0) return [1e12, -1e12];
  const s = Math.sqrt(disc);
  return [-b - s, -b + s];
}

function dens(h: number): V3 {
  return [Math.exp(-h / H_R), Math.exp(-h / H_M), Math.max(0, 1 - Math.abs(h - 25000) / 15000)];
}

function odToSun(p: V3, s: V3, steps = 16): V3 {
  const t = raySphere(p, s, R_A)[1];
  const ds = t / steps;
  const od: V3 = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const q: V3 = [p[0] + s[0] * (i + 0.5) * ds, p[1] + s[1] * (i + 0.5) * ds, p[2] + s[2] * (i + 0.5) * ds];
    const h = Math.hypot(q[0], q[1], q[2]) - R_E;
    const d = dens(h);
    od[0] += d[0] * ds;
    od[1] += d[1] * ds;
    od[2] += d[2] * ds;
  }
  return od;
}

function tauOf(od: V3): V3 {
  return [0, 1, 2].map((c) => BETA_R[c] * od[0] + (BETA_M[c] / 0.9) * od[1] + BETA_O[c] * od[2]) as V3;
}

/** Transmittance from height h (m) towards the sun. */
export function sunTransmittance(h: number): V3 {
  const s: V3 = [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z];
  const od = odToSun([0, R_E + h, 0], s, 64);
  const t = tauOf(od);
  return [Math.exp(-t[0]), Math.exp(-t[1]), Math.exp(-t[2])];
}

/** Sky radiance seen from height camH in direction d (unit). */
export function skyRadiance(d: V3, camH = 2): V3 {
  const s: V3 = [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z];
  const o: V3 = [0, R_E + camH, 0];
  const ta = raySphere(o, d, R_A);
  const tg = raySphere(o, d, R_E);
  let tMax = ta[1];
  if (tg[0] > 0) tMax = Math.min(tMax, tg[0]);
  const N = 48;
  const odV: V3 = [0, 0, 0];
  const sumR: V3 = [0, 0, 0];
  const sumM: V3 = [0, 0, 0];
  const sumA: V3 = [0, 0, 0];
  let tPrev = 0;
  for (let i = 0; i < N; i++) {
    const f = (i + 1) / N;
    const t1 = (tMax * (Math.pow(2, f * 7) - 1)) / 127;
    const ds = t1 - tPrev;
    const tm = tPrev + ds * 0.5;
    tPrev = t1;
    const p: V3 = [o[0] + d[0] * tm, o[1] + d[1] * tm, o[2] + d[2] * tm];
    const h = Math.hypot(p[0], p[1], p[2]) - R_E;
    const dd = dens(h);
    for (let k = 0; k < 3; k++) odV[k] += dd[k] * ds * 0.5;
    const ods = odToSun(p, s, 12);
    const tau = tauOf([odV[0] + ods[0], odV[1] + ods[1], odV[2] + ods[2]]);
    const tv = tauOf(odV);
    for (let c = 0; c < 3; c++) {
      const T = Math.exp(-tau[c]);
      sumR[c] += T * dd[0] * ds;
      sumM[c] += T * dd[1] * ds;
      sumA[c] += Math.exp(-tv[c]) * (BETA_R[c] * dd[0] + BETA_M[c] * dd[1]) * ds;
    }
    for (let k = 0; k < 3; k++) odV[k] += dd[k] * ds * 0.5;
  }
  const mu = d[0] * s[0] + d[1] * s[1] + d[2] * s[2];
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const g = G_M;
  const pM = (3 / (8 * Math.PI)) * ((1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  const iso = 1 / (4 * Math.PI);
  return [0, 1, 2].map((c) => SUN_E * (sumR[c] * BETA_R[c] * (pR + MS_K * iso) + sumM[c] * BETA_M[c] * (pM + MS_K * iso)) + sumA[c] * SKY_AMB[c]) as V3;
}

/** Angles (deg from the sun's azimuth) of the horizon haze table. Dense near the sun, where Mie peaks. */
export const HAZE_ANGLES = [0, 3, 6, 10, 16, 25, 40, 65, 105, 180];

export interface SkyConstants {
  /** sunlight reaching the ground, scene irradiance units (linear RGB) */
  sunIrradiance: V3;
  /** sunlight at the cloud layer */
  sunAtClouds: V3;
  /** horizon haze radiance by angle from the sun (HAZE_ANGLES) */
  hazeTable: V3[];
  /** zenith radiance, for reference */
  zenith: V3;
  /** average radiance of the ground seen in the env map (lower hemisphere) */
  groundRadiance: V3;
}

let cached: SkyConstants | null = null;

export function skyConstants(): SkyConstants {
  if (cached) return cached;
  const T = sunTransmittance(2);
  const sunIrradiance = T.map((t) => t * SUN_E) as V3;
  const Tc = sunTransmittance(3200);
  const sunAtClouds = Tc.map((t) => t * SUN_E) as V3;
  const sunAz = Math.atan2(SUN_DIR.x, -SUN_DIR.z);
  const e = (0.8 * Math.PI) / 180;
  const hazeTable = HAZE_ANGLES.map((deg) => {
    const a = sunAz + (deg * Math.PI) / 180;
    const d: V3 = [Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)];
    return skyRadiance(d);
  });
  const zenith = skyRadiance([0, 1, 0]);
  // ground: sand/asphalt/grass mix, lit by the low sun and the sky
  const skyAvg = skyRadiance([0, 0.5, 0.866]).map((v, i) => (v + zenith[i]) * 0.5) as V3;
  const groundRadiance = [0, 1, 2].map((c) => 0.26 * ((sunIrradiance[c] * SUN_DIR.y) / Math.PI + skyAvg[c] * 0.9)) as V3;
  cached = { sunIrradiance, sunAtClouds, hazeTable, zenith, groundRadiance };
  return cached;
}

const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : v.toPrecision(7));
export const vec3s = (v: ArrayLike<number>) => `vec3(${f(v[0])}, ${f(v[1])}, ${f(v[2])})`;

/** GLSL: constants and the scattering integral (used by the sky bake). */
export function atmosphereGLSL(): string {
  return /* glsl */ `
const float R_E = ${f(R_E)};
const float R_A = ${f(R_A)};
const vec3 BETA_R = ${vec3s(BETA_R)};
const float H_R = ${f(H_R)};
const vec3 BETA_M = ${vec3s(BETA_M)};
const float H_M = ${f(H_M)};
const vec3 BETA_O = ${vec3s(BETA_O)};
const float G_M = ${f(G_M)};
const float SUN_E = ${f(SUN_E)};
const float MS_K = ${f(MS_K)};
const vec3 SKY_AMB = ${vec3s(SKY_AMB)};

vec2 raySphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float disc = b * b - c;
  if (disc < 0.0) return vec2(1e12, -1e12);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}
vec3 atmDens(float h) {
  return vec3(exp(-h / H_R), exp(-h / H_M), max(0.0, 1.0 - abs(h - 25000.0) / 15000.0));
}
vec3 atmTau(vec3 od) {
  return BETA_R * od.x + (BETA_M / 0.9) * od.y + BETA_O * od.z;
}
vec3 odToSun(vec3 p, vec3 s) {
  float t = raySphere(p, s, R_A).y;
  float ds = t / 12.0;
  vec3 od = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    vec3 q = p + s * (float(i) + 0.5) * ds;
    od += atmDens(length(q) - R_E) * ds;
  }
  return od;
}
vec3 skyRadiance(vec3 d, vec3 s, float camH) {
  vec3 o = vec3(0.0, R_E + camH, 0.0);
  vec2 ta = raySphere(o, d, R_A);
  vec2 tg = raySphere(o, d, R_E);
  float tMax = ta.y;
  if (tg.x > 0.0) tMax = min(tMax, tg.x);
  vec3 odV = vec3(0.0);
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  vec3 sumA = vec3(0.0);
  float tPrev = 0.0;
  const int N = 48;
  for (int i = 0; i < N; i++) {
    float fr = float(i + 1) / float(N);
    float t1 = tMax * (exp2(fr * 7.0) - 1.0) / 127.0;
    float ds = t1 - tPrev;
    float tm = tPrev + ds * 0.5;
    tPrev = t1;
    vec3 p = o + d * tm;
    vec3 dd = atmDens(length(p) - R_E);
    odV += dd * ds * 0.5;
    vec3 T = exp(-atmTau(odV + odToSun(p, s)));
    sumR += T * dd.x * ds;
    sumM += T * dd.y * ds;
    sumA += exp(-atmTau(odV)) * (BETA_R * dd.x + BETA_M * dd.y) * ds;
    odV += dd * ds * 0.5;
  }
  float mu = dot(d, s);
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g = G_M;
  float pM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  float iso = 1.0 / (4.0 * PI);
  return SUN_E * (sumR * BETA_R * (pR + MS_K * iso) + sumM * BETA_M * (pM + MS_K * iso)) + sumA * SKY_AMB;
}
`;
}
