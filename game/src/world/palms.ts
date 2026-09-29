// About 160 palms of three species along both sidewalks, through the park and on the dune edge, plus low
// detail rows running on past the district. Coconut palms lean and curve with heavy drooping crowns, royal
// palms stand straight with a green crownshaft, sabal palms carry dense balls of fan leaves. No two are
// alike: height, lean, curve, frond count and ageing are drawn per tree. Fronds sway in the shared wind,
// glow when backlit by the low sun, and cast shadows cut from the same alpha as the leaves.
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { GeoBuilder } from '../core/builder';
import type { Ctx } from '../core/ctx';
import { fbm2, Rng } from '../core/rng';
import { frondAtlas } from '../textures/fronds';
import { noiseTexture } from '../textures/noise';
import { CROSS_Z, promenadeE, promenadeW, X, Z_MAX, Z_MIN } from './layout';
import { inDropSite } from '../drop/site';
import { lin } from './materials';
import { addCircle, groundAt } from './registry';
import { WIND_GLSL } from './wind';

export type Species = 'coconut' | 'royal' | 'sabal';

export interface PalmSpec {
  x: number;
  z: number;
  y: number;
  species: Species;
  height: number;
  lean: number;
  leanDir: number;
  seed: number;
  far: boolean;
}

/** Foliage vertices: position, normal, uv (atlas), colour, frond base + phase, bend (0 base → 1 tip). */
class Foliage {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  base: number[] = [];
  bend: number[] = [];
  vert(p: Vector3, n: Vector3, u: number, v: number, c: [number, number, number], base: Vector3, phase: number, bend: number): void {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    this.base.push(base.x, base.y, base.z, phase);
    this.bend.push(bend);
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aFrond', new BufferAttribute(new Float32Array(this.base), 4));
    g.setAttribute('aBend', new BufferAttribute(new Float32Array(this.bend), 1));
    g.computeBoundingSphere();
    return g;
  }
  get count(): number {
    return this.pos.length / 3;
  }
}

const UP = new Vector3(0, 1, 0);

/** Pinnate frond as a folded strip; atlas column `col`. */
function pinnate(
  f: Foliage,
  crown: Vector3,
  base: Vector3,
  az: number,
  el: number,
  len: number,
  droop: number,
  width: number,
  drop: number,
  twist: number,
  segs: number,
  col: number,
  tint: [number, number, number],
  phase: number,
): void {
  const horiz = new Vector3(Math.cos(az), 0, Math.sin(az));
  const rows: { l: Vector3; c: Vector3; r: Vector3; s: number }[] = [];
  const p = base.clone();
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const a = el - droop * Math.pow(s, 1.5);
    const dir = horiz.clone().multiplyScalar(Math.cos(a)).addScaledVector(UP, Math.sin(a));
    if (i > 0) p.addScaledVector(dir, len / segs);
    let side = new Vector3().crossVectors(dir, UP);
    if (side.lengthSq() < 1e-6) side = new Vector3(-horiz.z, 0, horiz.x);
    side.normalize();
    let up = new Vector3().crossVectors(side, dir).normalize();
    // twist the leaflet plane along the frond
    const tw = twist * s;
    const side2 = side.clone().multiplyScalar(Math.cos(tw)).addScaledVector(up, Math.sin(tw));
    up = new Vector3().crossVectors(side2, dir).normalize();
    side = side2;
    const hw = width * (0.3 + 0.7 * Math.sin(Math.min(1, s * 1.1) * Math.PI * 0.92 + 0.12)) * (s > 0.92 ? (1 - s) / 0.08 + 0.05 : 1);
    const lift = drop * hw;
    rows.push({
      l: p.clone().addScaledVector(side, -hw).addScaledVector(up, lift),
      c: p.clone(),
      r: p.clone().addScaledVector(side, hw).addScaledVector(up, lift),
      s,
    });
  }
  const u = (x: number) => (col + x) / 3;
  const n = new Vector3();
  const radial = new Vector3();
  const emit = (a: Vector3, b: Vector3, c: Vector3, ua: number, va: number, ub: number, vb: number, uc: number, vc: number) => {
    n.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    radial.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(crown).normalize();
    // wind so the front face looks away from the crown (double-sided shading then stays consistent)
    if (n.dot(radial) < 0) {
      n.negate();
      [b, c] = [c, b];
      [ub, uc] = [uc, ub];
      [vb, vc] = [vc, vb];
    }
    const nn = n.clone().multiplyScalar(0.55).addScaledVector(radial, 0.45).normalize();
    f.vert(a, nn, u(ua), va, tint, base, phase, va);
    f.vert(b, nn, u(ub), vb, tint, base, phase, vb);
    f.vert(c, nn, u(uc), vc, tint, base, phase, vc);
  };
  for (let i = 0; i < rows.length - 1; i++) {
    const A = rows[i];
    const B = rows[i + 1];
    emit(A.l, A.c, B.c, 0, A.s, 0.5, A.s, 0.5, B.s);
    emit(A.l, B.c, B.l, 0, A.s, 0.5, B.s, 0, B.s);
    emit(A.c, A.r, B.r, 0.5, A.s, 1, A.s, 1, B.s);
    emit(A.c, B.r, B.c, 0.5, A.s, 1, B.s, 0.5, B.s);
  }
}

/** Sabal fan leaf on a petiole: folded (costapalmate) fan, radial pleats. */
function fanLeaf(f: Foliage, crown: Vector3, base: Vector3, az: number, el: number, pet: number, R: number, near: boolean, tint: [number, number, number], phase: number, petiole: GeoBuilder): void {
  const dir = new Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  const c = base.clone().addScaledVector(dir, pet);
  petiole.bar(base, c, new Vector3(0, 0.03, 0), 0.035);
  // fan plane: facing out and a little up
  const nrm = dir.clone().addScaledVector(UP, 0.5).normalize();
  let a1 = new Vector3().crossVectors(nrm, UP);
  if (a1.lengthSq() < 1e-6) a1 = new Vector3(1, 0, 0);
  a1.normalize();
  const a2 = new Vector3().crossVectors(a1, nrm).normalize(); // "up" in the fan plane
  const segs = near ? 12 : 6;
  const rings = near ? 3 : 2;
  const span = 1.9; // radians either side
  const pts: Vector3[][] = [];
  for (let r = 0; r <= rings; r++) {
    const rr = (r / rings) * R;
    const row: Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = -span + (2 * span * i) / segs;
      const pleat = (i % 2 ? 1 : -1) * 0.04 * (r / rings);
      const fold = -Math.abs(Math.sin(a * 0.5)) * rr * 0.75;
      const droopY = -rr * rr * 0.22;
      row.push(c.clone().addScaledVector(a1, Math.sin(a) * rr).addScaledVector(a2, Math.cos(a) * rr).addScaledVector(nrm, fold + pleat).addScaledVector(UP, droopY));
    }
    pts.push(row);
  }
  const uOf = (i: number) => (2 + i / segs) / 3;
  const n = new Vector3();
  for (let r = 0; r < rings; r++)
    for (let i = 0; i < segs; i++) {
      const A = pts[r][i];
      const B = pts[r][i + 1];
      const C = pts[r + 1][i + 1];
      const D = pts[r + 1][i];
      const va = r / rings;
      const vb = (r + 1) / rings;
      const bendA = 0.35 + 0.65 * va;
      const bendB = 0.35 + 0.65 * vb;
      n.crossVectors(B.clone().sub(A), C.clone().sub(A)).normalize();
      const rad = A.clone().add(C).multiplyScalar(0.5).sub(crown).normalize();
      const flip = n.dot(rad) < 0;
      if (flip) n.negate();
      const nn = n.clone().multiplyScalar(0.6).addScaledVector(rad, 0.4).normalize();
      const quad: [Vector3, number, number, number][] = [
        [A, uOf(i), va, bendA],
        [B, uOf(i + 1), va, bendA],
        [C, uOf(i + 1), vb, bendB],
        [D, uOf(i), vb, bendB],
      ];
      const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      for (const o of order) f.vert(quad[o][0], nn, quad[o][1], quad[o][2], tint, base, phase, quad[o][3]);
    }
}

const TRUNK_COLORS: Record<Species, string> = { coconut: '#8a7f6c', royal: '#cdc8bc', sabal: '#877b68' };

function bezier(p0: Vector3, p1: Vector3, p2: Vector3, t: number): Vector3 {
  const a = p0.clone().multiplyScalar((1 - t) * (1 - t));
  return a.addScaledVector(p1, 2 * (1 - t) * t).addScaledVector(p2, t * t);
}

function buildPalm(s: PalmSpec, trunks: GeoBuilder, fol: Foliage, near: boolean): void {
  const rng = new Rng(s.seed);
  const base = new Vector3(s.x, s.y - 0.05, s.z);
  const H = s.height;
  const ld = new Vector3(Math.cos(s.leanDir), 0, Math.sin(s.leanDir));
  const off = H * Math.sin(s.lean);
  let p1: Vector3;
  let top: Vector3;
  if (s.species === 'coconut') {
    // leans from the foot, the top turns back up towards the light
    top = base.clone().addScaledVector(ld, off).addScaledVector(UP, H * Math.cos(s.lean * 0.6));
    p1 = base.clone().addScaledVector(ld, off * rng.range(0.75, 1.05)).addScaledVector(UP, H * rng.range(0.35, 0.5));
  } else {
    top = base.clone().addScaledVector(ld, off).addScaledVector(UP, H);
    p1 = base.clone().addScaledVector(ld, off * 0.5).addScaledVector(UP, H * 0.5);
  }
  const segs = near ? 12 : 5;
  const radial = near ? 8 : 5;
  trunks.setColor(lin(TRUNK_COLORS[s.species]).map((v) => v * rng.range(0.85, 1.12)) as [number, number, number]);
  const code = s.species === 'coconut' ? 0 : s.species === 'royal' ? 1 : 2;
  trunks.auxv = [code, H, (s.seed % 997) / 997, 0];
  const radius = (t: number) => {
    if (s.species === 'coconut') return 0.145 + 0.06 * (1 - t) + 0.1 * Math.exp(-t * 18);
    if (s.species === 'royal') return 0.2 + 0.1 * Math.exp(-(((t - 0.45) / 0.3) ** 2)) + 0.1 * Math.exp(-t * 20);
    return 0.19 + 0.04 * (1 - t) + 0.06 * Math.exp(-t * 18);
  };
  const crownT = s.species === 'royal' ? 0.86 : 1;
  for (let i = 0; i < segs; i++) {
    const t0 = (i / segs) * crownT;
    const t1 = ((i + 1) / segs) * crownT;
    trunks.cylinder(bezier(base, p1, top, t0), bezier(base, p1, top, t1), radius(t0), radius(t1), radial, false, t0 * H, t1 * H);
  }
  // royal palm crownshaft: smooth, glossy green
  if (s.species === 'royal') {
    trunks.setColor(lin('#5d8a3c'));
    trunks.auxv = [3, H, 0, 0];
    trunks.cylinder(bezier(base, p1, top, crownT), top, radius(crownT) * 1.05, 0.17, radial, true, 0, 1);
  }
  // crown
  const crown = top.clone().addScaledVector(UP, s.species === 'royal' ? 0.15 : 0.05);
  const frondBase = (k: number, az: number) => crown.clone().add(new Vector3(Math.cos(az), 0, Math.sin(az)).multiplyScalar(0.12 + 0.03 * (k % 3)));
  const golden = 2.39996;
  const az0 = rng.range(0, Math.PI * 2);
  if (s.species === 'sabal') {
    const n = near ? rng.int(15, 21) : rng.int(9, 12);
    const petiole = trunks;
    petiole.setColor(lin('#8a8a5c'));
    trunks.auxv = [4, H, 0, 0];
    for (let k = 0; k < n; k++) {
      const az = az0 + k * golden;
      const el = (1 - (k + 0.5) / n) * 1.75 - 0.85 + rng.range(-0.12, 0.12);
      const tint = lin('#ffffff').map((v) => v * rng.range(0.85, 1.08)) as [number, number, number];
      const old = el < -0.4 && rng.chance(0.35);
      const c: [number, number, number] = old ? [tint[0] * 1.25, tint[1] * 1.0, tint[2] * 0.55] : tint;
      fanLeaf(fol, crown, frondBase(k, az), az, el, rng.range(1.2, 1.9), rng.range(1.05, 1.4), near, c, rng.range(0, 6.28), petiole);
    }
    return;
  }
  const coconut = s.species === 'coconut';
  const n = coconut ? (near ? rng.int(18, 26) : rng.int(10, 13)) : near ? rng.int(12, 16) : rng.int(8, 10);
  const fsegs = near ? 10 : 5;
  for (let k = 0; k < n; k++) {
    const az = az0 + k * golden + rng.range(-0.15, 0.15);
    const age = (k + 0.5) / n; // 0 young (upright) → 1 old (hanging)
    const el = coconut ? 1.05 - age * 1.7 + rng.range(-0.1, 0.1) : 0.95 - age * 1.15 + rng.range(-0.08, 0.08);
    const len = coconut ? rng.range(4.1, 5.4) * (0.85 + 0.15 * age) : rng.range(3.2, 4.1);
    const droop = coconut ? 1.0 + age * 0.9 + rng.range(-0.15, 0.2) : 0.75 + age * 0.5 + rng.range(-0.1, 0.1);
    const yellow = age > 0.8 && rng.chance(0.45);
    const k2 = rng.range(0.85, 1.08);
    const tint: [number, number, number] = yellow ? [1.28 * k2, 1.12 * k2, 0.62 * k2] : [k2, k2 * rng.range(0.97, 1.03), k2 * 0.95];
    pinnate(fol, crown, frondBase(k, az), az, el, len, droop, coconut ? rng.range(0.78, 0.95) : rng.range(0.68, 0.8), coconut ? -0.55 : 0.2, coconut ? 0 : 0.5, fsegs, coconut ? 0 : 1, tint, rng.range(0, 6.28));
  }
  if (coconut) {
    // dead fronds hanging against the trunk, and the nuts
    const dead = near ? rng.int(0, 3) : 0;
    for (let k = 0; k < dead; k++) {
      const az = rng.range(0, Math.PI * 2);
      pinnate(fol, crown, frondBase(k, az), az, -1.2, rng.range(2.8, 3.6), 0.25, 0.45, -0.2, 0, 5, 0, [1.55, 1.05, 0.45], rng.range(0, 6));
    }
    if (near) {
      trunks.setColor(lin(rng.pick(['#6f7a35', '#8a6a35', '#7b8a3a'])));
      trunks.auxv = [5, H, 0, 0];
      const nn = rng.int(3, 9);
      for (let k = 0; k < nn; k++) {
        const a = rng.range(0, Math.PI * 2);
        const p = crown.clone().add(new Vector3(Math.cos(a) * 0.22, -0.28 - rng.range(0, 0.2), Math.sin(a) * 0.22));
        trunks.cylinder(p.clone().addScaledVector(UP, -0.11), p.clone().addScaledVector(UP, 0.1), 0.1, 0.09, 6);
      }
    }
  }
}

/** Where the palms go. */
function plant(): PalmSpec[] {
  const rng = new Rng(3131);
  const out: PalmSpec[] = [];
  const nearCross = (z: number, pad: number) => CROSS_Z.some((c) => Math.abs(z - c) < 8.5 + pad);
  const add = (x: number, z: number, species: Species, far = false, leanBias = 0) => {
    const y = groundAt(x, z, 50).y;
    const coconut = species === 'coconut';
    const height = species === 'coconut' ? rng.range(8, 16.5) : species === 'royal' ? rng.range(13, 20) : rng.range(5, 10.5);
    const lean = coconut ? rng.range(0.05, 0.36) : species === 'sabal' ? rng.range(0, 0.08) : rng.range(0, 0.03);
    // coconuts lean towards the light and the sea, a few the other way
    const leanDir = coconut ? (rng.chance(0.75) ? rng.range(-0.9, 0.9) + leanBias : rng.range(0, Math.PI * 2)) : rng.range(0, Math.PI * 2);
    out.push({ x, z, y, species, height, lean, leanDir, seed: rng.int(1, 1e9), far });
  };
  const sp = (w: [Species, number][]) => {
    let t = rng.f() * w.reduce((a, b) => a + b[1], 0);
    for (const [s, k] of w) if ((t -= k) <= 0) return s;
    return w[0][0];
  };
  // east sidewalk: a loose row along the park edge
  for (let z = Z_MIN + 3; z < Z_MAX - 2; z += rng.range(8.5, 15)) add(X.curbE + rng.range(1.6, 2.6), z, sp([['coconut', 7], ['royal', 2], ['sabal', 1]]));
  // west sidewalk: tree pits by the kerb, away from the cross streets
  for (let z = Z_MIN + 6; z < Z_MAX - 4; z += rng.range(17, 30)) if (!nearCross(z, 3)) add(X.curbW - rng.range(0.9, 1.3), z, sp([['royal', 5], ['coconut', 4]]));
  // the park: scattered, some in little groves
  const parkPts: [number, number][] = [];
  let tries = 0;
  while (parkPts.length < 58 && tries++ < 5000) {
    const z = rng.range(Z_MIN + 2, Z_MAX - 2);
    const pw = promenadeW(z);
    const x = rng.range(X.parkW + 2.5, pw - 1.6);
    // groves: denser where a slow noise field says so
    if (fbm2(x * 0.02, z * 0.02, 2, 91) < rng.range(0.25, 0.62)) continue;
    if (parkPts.some(([a, b]) => Math.hypot(a - x, b - z) < 5.5)) continue;
    parkPts.push([x, z]);
    add(x, z, sp([['coconut', 6], ['sabal', 3], ['royal', 1.4]]), false, 0);
  }
  // dune edge: coconuts leaning out to sea, sabal clumps
  for (let z = Z_MIN + 2; z < Z_MAX - 2; z += rng.range(12, 26)) {
    const x = rng.range(promenadeE(z) + 1.5, X.beachW + 1.5);
    add(x, z, sp([['coconut', 3], ['sabal', 1]]), false, 0);
  }
  // beyond the district, low detail
  for (const dir of [1, -1]) {
    for (let z = dir > 0 ? Z_MAX + 4 : Z_MIN - 4; Math.abs(z) < 1000; z += dir * rng.range(9, 16)) {
      add(X.curbE + rng.range(1.6, 2.6), z, sp([['coconut', 7], ['royal', 2]]), true);
      if (rng.chance(0.55)) add(rng.range(15, 34), z + rng.range(-4, 4), sp([['coconut', 5], ['sabal', 2]]), true);
      if (rng.chance(0.35)) add(rng.range(43, 50), z, 'coconut', true);
    }
  }
  // the Collect Drop garage stands in the park (planted first, so the rest of the park stays as it was)
  return out.filter((p) => !inDropSite(p.x, p.z, 1.5));
}

const WIND_VERTEX = /* glsl */ `
  {
    vec3 w = windAt(aFrond.xyz, uTime);
    float b2 = aBend * aBend;
    float ph = aFrond.w;
    float sway = sin(uTime * 1.7 + ph) * 0.35 + sin(uTime * 2.9 + ph * 1.7) * 0.2;
    vec3 disp = w * b2 * (0.95 + sway) + vec3(0.0, -length(w) * b2 * 0.35, 0.0);
    // leaflet flutter, strongest at the tips
    float fl = sin(uTime * 9.1 + ph * 13.0 + aBend * 11.0 + position.x * 0.7) * 0.05 * aBend * (0.4 + length(w));
    disp += normal * fl;
    transformed += disp;
  }
`;

function foliageMaterials(q: { msaa: number }): { mat: MeshStandardMaterial; depth: MeshDepthMaterial; time: { value: number } } {
  const atlas = frondAtlas();
  const time = { value: 0 };
  const mat = new MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: DoubleSide, vertexColors: true, roughness: 0.62, metalness: 0, alphaToCoverage: q.msaa > 0 });
  mat.name = 'fronds';
  const inject = (shader: WebGLProgramParametersWithUniforms, lit: boolean) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nattribute vec4 aFrond;\nattribute float aBend;\n${WIND_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_VERTEX}`);
    // keep leaves from thinning out in the distance: boost alpha with the mip level
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      {
        vec2 ts = vec2(384.0, 512.0);
        vec2 dx = dFdx(vMapUv * ts);
        vec2 dy = dFdy(vMapUv * ts);
        float lod = 0.5 * log2(max(dot(dx, dx), dot(dy, dy)));
        diffuseColor.a *= 1.0 + max(lod, 0.0) * 0.32;
      }`,
    );
    if (lit) {
      // light through the leaves: backlit fronds glow with the low sun behind them
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_pars_fragment>',
        `#include <lights_physical_pars_fragment>
        void RE_Direct_Leaf( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
          RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
          float back = saturate( -dot( geometryNormal, directLight.direction ) );
          float toward = pow( saturate( dot( -geometryViewDir, directLight.direction ) ), 3.0 );
          vec3 trans = material.diffuseColor * vec3( 1.05, 1.1, 0.55 );
          reflectedLight.directDiffuse += directLight.color * trans * ( back * 0.3 + toward * 0.9 ) * 0.45;
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Leaf`,
      );
    }
  };
  mat.onBeforeCompile = (s) => inject(s, true);
  mat.customProgramCacheKey = () => 'od-fronds';
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: atlas, alphaTest: 0.5, side: DoubleSide });
  depth.onBeforeCompile = (s) => inject(s, false);
  depth.customProgramCacheKey = () => 'od-fronds-depth';
  return { mat, depth, time };
}

function trunkMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, name: 'trunks' });
  const noise = noiseTexture();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOdNoise = { value: noise };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aux;\nvarying vec4 vAux;\nvarying vec2 vTUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAux = aux;\nvTUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uOdNoise;\nvarying vec4 vAux;\nvarying vec2 vTUv;\nfloat odRough = -1.0;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float sp = vAux.x;
          float h = vTUv.y;       // metres up the trunk
          float a = vTUv.x;       // around
          vec3 c = diffuseColor.rgb;
          float n = texture2D(uOdNoise, vec2(a * 2.0, h * 0.35 + vAux.z)).b;
          if (sp < 0.5) {
            // coconut: leaf-scar rings, darker grooves, lichen-grey patches
            float ring = fract(h / (0.13 + 0.04 * n));
            c *= 0.8 + 0.25 * smoothstep(0.0, 0.25, ring) * smoothstep(1.0, 0.7, ring);
            c *= 0.85 + 0.3 * texture2D(uOdNoise, vec2(a * 3.0, h * 0.8)).g;
          } else if (sp < 1.5) {
            // royal: smooth concrete-grey column, faint rings
            float ring = fract(h / 0.32);
            c *= 0.93 + 0.07 * smoothstep(0.0, 0.1, ring);
            c *= 0.92 + 0.14 * n;
          } else if (sp < 2.5) {
            // sabal: criss-cross leaf boots up high, smoother lower down
            vec2 q = vec2(a * 9.0, h * 3.2);
            float x = abs(fract(q.x + q.y) - 0.5) + abs(fract(q.x - q.y) - 0.5);
            float boots = smoothstep(0.35, 0.65, h / max(vAux.y, 1.0));
            c *= mix(0.9 + 0.15 * n, 0.65 + 0.5 * smoothstep(0.3, 0.8, x), boots);
          } else if (sp < 3.5) {
            // royal crownshaft: glossy green
            c *= 0.9 + 0.2 * n;
            odRough = 0.35;
          } else {
            c *= 0.85 + 0.3 * n;
          }
          diffuseColor.rgb = c;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (odRough > 0.0) roughnessFactor = odRough;');
  };
  m.customProgramCacheKey = () => 'od-trunks';
  return m;
}

export interface Palms {
  group: Group;
  specs: PalmSpec[];
  update(t: number, cam: Vector3): void;
  /** how many palm crowns are within r metres (for the wind sound) */
  crownsNear(x: number, z: number, r: number): number;
}

export function buildPalms(ctx: Ctx): Palms {
  const specs = plant();
  const { mat, depth, time } = foliageMaterials(ctx.q);
  const tmat = trunkMaterial();
  const group = new Group();
  group.name = 'palms';
  const CH = 85;
  type Chunk = { z: number; near: Group; far: Group };
  const chunks: Chunk[] = [];
  const byChunk = new Map<number, PalmSpec[]>();
  for (const s of specs) {
    const k = Math.floor(s.z / CH);
    if (!byChunk.has(k)) byChunk.set(k, []);
    byChunk.get(k)!.push(s);
    if (!s.far) addCircle(s.x, s.z, s.species === 'royal' ? 0.32 : 0.26, s.y - 1, s.y + 6, 'palm');
  }
  const mk = (tb: GeoBuilder, fb: Foliage, name: string, g: Group) => {
    if (tb.count) {
      const t = new Mesh(tb.build(true), tmat);
      t.castShadow = t.receiveShadow = true;
      t.name = `${name}-trunks`;
      g.add(t);
    }
    if (fb.count) {
      const f = new Mesh(fb.build(), mat);
      f.customDepthMaterial = depth;
      f.castShadow = f.receiveShadow = true;
      f.name = `${name}-fronds`;
      g.add(f);
    }
  };
  for (const [k, list] of byChunk) {
    const near = new Group();
    const far = new Group();
    const allFar = list.every((s) => s.far);
    if (!allFar) {
      const tb = new GeoBuilder();
      const fb = new Foliage();
      for (const s of list) buildPalm(s, tb, fb, !s.far);
      mk(tb, fb, `palms${k}-near`, near);
    }
    const tb2 = new GeoBuilder();
    const fb2 = new Foliage();
    for (const s of list) buildPalm(s, tb2, fb2, false);
    mk(tb2, fb2, `palms${k}-far`, far);
    near.visible = !allFar;
    far.visible = allFar;
    group.add(near, far);
    chunks.push({ z: (k + 0.5) * CH, near: allFar ? far : near, far });
  }
  return {
    group,
    specs,
    update(t: number, cam: Vector3) {
      time.value = t;
      for (const c of chunks) {
        if (c.near === c.far) continue;
        const d = Math.abs(cam.z - c.z) - CH / 2;
        const nearNow = c.near.visible ? d < 140 : d < 125;
        c.near.visible = nearNow;
        c.far.visible = !nearNow;
      }
    },
    crownsNear(x: number, z: number, r: number) {
      let n = 0;
      for (const s of specs) if (Math.abs(s.z - z) < r && Math.hypot(s.x - x, s.z - z) < r) n++;
      return n;
    },
  };
}
