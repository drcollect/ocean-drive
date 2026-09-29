// Cars on Ocean Drive: about ninety parked road cars (sedans, SUVs, hatchbacks, red pickups, white
// convertibles, one 1950s convertible with fins), built in world/carModel.ts at three levels of detail that
// swap with distance; the Collect cars (world/collect.ts) as Drop 01 editions, the five published ones in a
// row in front of the hotels where the walk starts and more editions along the street; and one car that
// drives slowly up and down the street (it stops for you). Paint, glass and chrome switch to a street-level reflection probe
// once main has captured it (setEnv).
import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
  Vector4,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { blobTexture } from '../textures/blob';
import { Rng } from '../core/rng';
import { buildBody, buildWheel, DESIGNS, LOD_DETAIL, paintParams, type CarGeometry, type Design, type Kind } from './carModel';
import { collectCar, collectTaken, dropSeed, editionRide, MODEL_SIZE, sharedMaterials, streetEditions } from './collect';
import type { CandidateSource, CarCandidate, Taken } from '../vehicles/drive';
import type { RideDef } from '../vehicles/ride';
import { dropPool } from '../drop/drop01';
import { CROSS_Z, terrainHeight, Z_MAX, Z_MIN } from './layout';
import { lin } from './materials';
import { addBox, addDynamicBox, type Collider } from './registry';

export interface MovingCar {
  pos: Vector3;
  vel: Vector3;
  heading: number;
  speed: number;
  visible: boolean;
}

export interface Cars {
  root: Object3D;
  moving: MovingCar;
  update(t: number, dt: number, player: Vector3): void;
  /** switch glass, chrome and trim to this (PMREM) environment (paint keeps the sky: cleaner on hoods and roofs) */
  setEnv(env: Texture): void;
  /** the street pick's seed (`?drop=` repeats it) and which editions stand where */
  drop: { seed: number; cars: CollectSpot[] };
  /** where every parked car stands (dev: to look at them) */
  spots: { kind: string; x: number; z: number }[];
  /** the cars near a point you could get into and drive */
  carCandidates: CandidateSource;
  /** how a hit car becomes a moving body (the driving manager's) */
  knockWith(fn: (c: CarCandidate) => unknown): void;
}

const KIND_NAME: Record<Kind, string> = { sedan: 'sedan', suv: 'SUV', hatch: 'hatchback', pickup: 'pickup', convertible: 'convertible', classic: '1950s convertible' };
const COLOUR_NAME: Record<string, string> = {
  '#f1f1ee': 'white', '#e4e2dc': 'pearl white', '#0e0f11': 'black', '#16181b': 'black', '#a9afb5': 'silver', '#6a6f75': 'grey',
  '#3b3e43': 'charcoal', '#1c2a45': 'navy', '#6d1a20': 'burgundy', '#b39d74': 'champagne', '#9a1b1d': 'red', '#2f4a3a': 'green',
  '#b3261e': 'red', '#f3f2ee': 'white', '#f4efe2': 'cream',
};

/** How a road car drives: nothing like a Collect car, but it goes. */
function carRide(kind: Kind, label: string): RideDef {
  const d = DESIGNS[kind];
  const sill = paintParams(d).lid[0];
  const seatZ = kind === 'classic' ? -0.3 : kind === 'convertible' ? -0.45 : kind === 'pickup' ? 0.12 : (d.pillarB ?? -0.1) + 0.25;
  const eyeY = (d.open ? 0.5 : sill + 0.18) + 0.26 + 0.6;
  const tall = kind === 'pickup' || kind === 'suv';
  return {
    kind: 'car',
    label,
    dims: { l: d.L, w: d.W },
    reverse: 5,
    mass: { sedan: 1500, suv: 2000, hatch: 1250, pickup: 2200, convertible: 1450, classic: 1750 }[kind],
    wheelbase: d.wf - d.wr,
    track: d.track,
    radius: d.W / 2 - 0.08,
    maxSteer: 0.58,
    accel: kind === 'classic' ? 3.2 : tall ? 4 : 4.8,
    brake: 10,
    stepUp: tall ? 0.36 : 0.26,
    top: { default: kind === 'classic' ? 20 : 25, grass: 13, sand: tall ? 11 : 6.5, wetsand: 12, water: 2, wood: 3 },
    eye: new Vector3(0.38, eyeY, seatZ + 0.05),
    wheelR: d.wheelR,
  };
}

/** [colour, metallic flake 0–1]: the spread of a real street, mostly white, black, silver and grey */
const PAINTS: [string, number][] = [
  ['#f1f1ee', 0],
  ['#f1f1ee', 0],
  ['#e4e2dc', 0.3],
  ['#0e0f11', 0],
  ['#16181b', 0.55],
  ['#a9afb5', 0.8],
  ['#a9afb5', 0.8],
  ['#6a6f75', 0.7],
  ['#3b3e43', 0.6],
  ['#1c2a45', 0.6],
  ['#6d1a20', 0.5],
  ['#b39d74', 0.6],
  ['#9a1b1d', 0],
  ['#2f4a3a', 0.5],
];

interface Parked {
  kind: Kind;
  x: number;
  z: number;
  rot: number;
  color: string;
  metal: number;
  special?: boolean;
}

/** the west curb lane faces south (+z), the east curb lane north */
const WEST = -5.72;
const EAST = 5.72;
const rotOf = (x: number) => (x < 0 ? 0 : Math.PI);
/** the Collect row in front of the hotels, on the parking grid (camera A looks up the street at it) */
const ROW = [89.7, 96.3, 102.9, 109.5, 116.1].map((z) => ({ x: WEST, z }));
/** the five editions the drop spec publishes, Common at the north end of the row to Secret Rare nearest you */
const ROW_EDITIONS = [4, 1, 3, 20, 32];
/** how many more editions stand along the street */
const DROP_EXTRA = 10;

export interface CollectSpot {
  edition: number;
  x: number;
  z: number;
}

/** The row, then `extra` editions on parking places picked from `slots`, never two within 24 m. */
function placeCollect(seed: number, slots: { x: number; z: number }[]): CollectSpot[] {
  const out: CollectSpot[] = ROW.map((p, i) => ({ edition: ROW_EDITIONS[i], x: p.x, z: p.z }));
  const editions = streetEditions(seed, DROP_EXTRA, ROW_EDITIONS);
  const rng = new Rng(seed ^ 0x5bd1e995);
  const order = slots.map((s) => ({ s, k: rng.f() })).sort((a, b) => a.k - b.k);
  for (const { s } of order) {
    if (out.length >= ROW.length + editions.length) break;
    if (out.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 24)) continue;
    out.push({ edition: editions[out.length - ROW.length], x: s.x, z: s.z });
  }
  return out;
}

function planParking(): Parked[] {
  const rng = new Rng(8080);
  const out: Parked[] = [];
  const nearCross = (z: number, pad: number) => CROSS_Z.some((c) => Math.abs(z - c) < 8.5 + pad);
  for (const x of [WEST, EAST]) {
    let z = Z_MIN + 4;
    while (z < Z_MAX - 4) {
      const len = 6.6;
      const zc = z + len / 2;
      z += len;
      if (nearCross(zc, x < 0 ? 3 : 2)) continue;
      if (ROW.some((c) => c.x === x && Math.abs(c.z - zc) < 5.6)) continue;
      if (!rng.chance(0.66)) continue;
      const kind: Kind = rng.chance(0.1) ? 'suv' : rng.chance(0.12) ? 'hatch' : 'sedan';
      const [color, metal] = rng.pick(PAINTS);
      out.push({ kind, x, z: zc + rng.range(-0.3, 0.3), rot: rotOf(x), color, metal });
    }
  }
  // the specials: red pickups, white convertibles, and the 1950s convertible by the curb
  const place = (kind: Kind, x: number, zc: number, color: string) => {
    for (let i = out.length - 1; i >= 0; i--) if (out[i].x === x && Math.abs(out[i].z - zc) < 6) out.splice(i, 1);
    out.push({ kind, x, z: zc, rot: rotOf(x), color, metal: 0, special: true });
  };
  place('pickup', EAST, 64, '#b3261e');
  place('convertible', EAST, 124.8, '#f3f2ee');
  place('classic', WEST, -62, '#f4efe2');
  place('convertible', EAST, -176, '#f3f2ee');
  place('pickup', WEST, 205, '#b3261e');
  return out;
}

/**
 * Car paint for one body design: clearcoat over a solid or metallic base (per car), shut lines, handles,
 * and the lamps and grille, drawn in the car's own space so their edges stay clean at any level of detail.
 */
function paintMaterial(d: Design): MeshPhysicalMaterial {
  const pp = paintParams(d);
  const m = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.09, name: `car-paint-${d.kind}` });
  const uniforms = {
    uSeam: { value: new Vector4().fromArray(pp.seam) },
    uLid: { value: new Vector4().fromArray(pp.lid) },
    uHead: { value: new Vector4().fromArray(pp.head) },
    uTail: { value: new Vector4().fromArray(pp.tail) },
    uWrap: { value: new Vector4().fromArray(pp.wrap) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 finish;\nvarying vec3 vCarP;\nvarying vec3 vCarN;\nvarying vec2 vFinish;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarP = position;\nvCarN = normal;\nvFinish = finish;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec4 uSeam;
        uniform vec4 uLid;
        uniform vec4 uHead;
        uniform vec4 uTail;
        uniform vec4 uWrap;
        varying vec3 vCarP;
        varying vec3 vCarN;
        varying vec2 vFinish;
        float carLine(float d) { return 1.0 - smoothstep(0.0035, 0.0095, abs(d)); }
        float carIn(float v, float a, float b) { float w = fwidth(v) * 0.75 + 0.001; return smoothstep(a - w, a + w, v) * (1.0 - smoothstep(b - w, b + w, v)); }
        float carUnder(float v, float a) { float w = fwidth(v) * 0.75 + 0.001; return 1.0 - smoothstep(a - w, a + w, v); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float carSeam = 0.0;
        float carLamp = 0.0;
        vec2 carLampRM = vec2(0.45, 0.0);
        {
          vec3 cn = normalize(vCarN);
          float sideF = smoothstep(0.5, 0.8, abs(cn.x));
          float topF = smoothstep(0.3, 0.6, cn.y);
          float y = vCarP.y;
          float z = vCarP.z;
          float ax = abs(vCarP.x);
          // door shut lines between sill and belt; hood and boot lids across and along the top
          float band = step(uLid.x + 0.07, y) * step(y, uSeam.w - 0.015);
          float doors = max(max(carLine(z - uSeam.x), carLine(z - uSeam.y)), carLine(z - uSeam.z));
          carSeam = sideF * band * doors;
          float hood = max(carLine(z - uLid.y), step(uLid.y, z) * carLine(ax - uLid.w));
          float boot = step(uLid.z, 50.0) * max(carLine(z - uLid.z), step(z, uLid.z) * carLine(ax - uLid.w));
          carSeam = max(carSeam, topF * max(hood, boot));
          // door handles near the rear edge of each door
          float hy = uSeam.w - 0.1;
          float handle = step(abs(y - hy), 0.015) * max(step(abs(z - uSeam.y - 0.22), 0.075), step(abs(z - uSeam.z - 0.22), 0.075));
          diffuseColor.rgb *= 1.0 - 0.35 * sideF * handle;
          // road grime low on the body
          diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(uLid.x, uLid.x + 0.18, y));
          if (uHead.x > 0.0) {
            float notTop = 1.0 - smoothstep(0.6, 0.85, cn.y);
            // headlamps wrap round the front corners: u back along the flank from the nose, v in across the nose
            float u = uHead.x - z;
            float v = uHead.w - ax;
            float sweep = clamp(v / uWrap.y, 0.0, 1.0);
            float h0 = uHead.y + 0.02 * sweep;
            float h1 = uHead.z - 0.04 * sweep;
            float head = carIn(y, h0, h1) * carUnder(u, uWrap.x) * carUnder(v, uWrap.y) * notTop;
            float headRim = carIn(y, h0 - 0.012, h1 + 0.012) * carUnder(u, uWrap.x + 0.012) * carUnder(v, uWrap.y + 0.012) * notTop;
            // tail lamps round the rear corners
            float ut = z + uHead.x;
            float vt = uTail.z - ax;
            float tail = carIn(y, uTail.x, uTail.y) * carUnder(ut, uWrap.z) * carUnder(vt, uWrap.w) * notTop;
            float tailRim = carIn(y, uTail.x - 0.01, uTail.y + 0.01) * carUnder(ut, uWrap.z + 0.01) * carUnder(vt, uWrap.w + 0.01) * notTop;
            // grille in the middle of the nose, below the lamps
            float grille = smoothstep(0.5, 0.8, cn.z) * carIn(y, uHead.y - 0.17, uHead.y + 0.005) * carUnder(ax, uTail.w);
            float rim = max(headRim, tailRim);
            vec3 lens = vec3(0.3, 0.32, 0.34) * (0.7 + 0.3 * step(0.5, fract(v * 7.0)));
            vec3 red = vec3(0.3, 0.012, 0.01) * (0.8 + 0.2 * step(0.5, fract(y * 40.0)));
            vec3 grid = vec3(0.012) * (0.6 + 0.4 * step(0.5, fract(y * 55.0)));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.01), rim);
            diffuseColor.rgb = mix(diffuseColor.rgb, lens, head);
            diffuseColor.rgb = mix(diffuseColor.rgb, red, tail);
            diffuseColor.rgb = mix(diffuseColor.rgb, grid, grille);
            carLamp = max(max(rim, grille), max(head, tail));
            carLampRM = head > 0.5 ? vec2(0.05, 0.85) : tail > 0.5 ? vec2(0.12, 0.1) : vec2(0.45, 0.0);
          }
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(vFinish.y, carLampRM.x, carLamp);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(vFinish.x, carLampRM.y, carLamp);')
      .replace('#include <opaque_fragment>', 'outgoingLight *= 1.0 - 0.75 * carSeam;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'od-car-paint-3';
  return m;
}

/** Everything that isn't paint or glass: vertex colours, roughness and metalness per vertex (`aux`). */
function partsMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, name: 'car-parts' });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aux;\nvarying vec2 vRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aux.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vRM.y;');
  };
  m.customProgramCacheKey = () => 'od-car-parts';
  return m;
}

/** Tinted glass. Near cars: dimly see-through to the cabin, turning to mirror at grazing angles; far: opaque. */
function glassMaterial(see: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: new Color().setRGB(...lin('#0b0e11')), roughness: 0.02, metalness: 0, envMapIntensity: 1.4, name: see ? 'car-glass' : 'car-glass-far' });
  if (see) {
    m.side = DoubleSide;
    m.transparent = true;
    m.opacity = 0.72;
    m.depthWrite = false;
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `{
          float nv = abs(dot(normalize(vViewPosition), normal));
          diffuseColor.a = mix(diffuseColor.a, 1.0, pow(1.0 - nv, 2.0));
        }
        #include <opaque_fragment>`,
      );
    };
    m.customProgramCacheKey = () => 'od-car-glass';
  }
  return m;
}

/** after the other see-through things (awnings, umbrellas, blobs), so what's behind a car's glass stays behind it */
const GLASS_ORDER = 5;

interface Level {
  paint: InstancedMesh;
  glass: InstancedMesh;
  parts: InstancedMesh;
  wheels: InstancedMesh;
  finish: InstancedBufferAttribute;
}

interface KindGroup {
  kind: Kind;
  cars: { p: Parked; m: Matrix4; wheels: Matrix4[]; col: Color; collider: Collider | null; blob: number }[];
  levels: Level[];
}

/** distance (m) up to which each level of detail is used */
const LOD_RANGE = [36, 125, Infinity];

export async function buildCars(): Promise<Cars> {
  const root = new Object3D();
  root.name = 'cars';
  const parts = partsMaterial();
  const glassNear = glassMaterial(true);
  const glassFar = glassMaterial(false);
  const paints = new Map<Kind, MeshPhysicalMaterial>();
  const paintFor = (k: Kind) => {
    if (!paints.has(k)) paints.set(k, paintMaterial(DESIGNS[k]));
    return paints.get(k)!;
  };
  const envMats: Material[] = [parts, glassNear, glassFar];

  // the parking plan, then the drop: the row, and more Collect cars on places taken from ordinary cars
  let parked = planParking();
  const seed = dropSeed();
  const slots = parked.filter((p) => !p.special);
  const drop = placeCollect(seed, slots);
  const pool = dropPool();
  const bodyOf = (e: number) => pool[e - 1].tier.body;
  console.info(`Collect street pick ${seed}: editions ${drop.map((c) => c.edition).join(', ')} (?drop=${seed} parks the same ones again)`);
  parked = parked.filter((p) => !drop.some((c) => c.x === p.x && c.z === p.z));

  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const one = new Vector3(1, 1, 1);
  const groups: KindGroup[] = [];
  for (const kind of Array.from(new Set(parked.map((p) => p.kind)))) {
    const d = DESIGNS[kind];
    const paint = paintFor(kind);
    const list = parked.filter((p) => p.kind === kind);
    const cars = list.map((p) => {
      const m = new Matrix4().compose(new Vector3(p.x, terrainHeight(p.x, p.z), p.z), q.setFromAxisAngle(up, p.rot), one);
      const wheels = ([[1, d.wf], [-1, d.wf], [1, d.wr], [-1, d.wr]] as [number, number][]).map(([sx, wz]) =>
        m.clone().multiply(new Matrix4().compose(new Vector3(sx * (d.track / 2), d.wheelR, wz), new Quaternion().setFromAxisAngle(up, sx > 0 ? 0 : Math.PI), one)),
      );
      return { p, m, wheels, col: new Color().setRGB(...lin(p.color)), collider: null as Collider | null, blob: parked.indexOf(p) };
    });
    const levels = LOD_DETAIL.map((detail, lv) => {
      const g = buildBody(d, detail);
      const finish = new InstancedBufferAttribute(new Float32Array(list.length * 2), 2);
      finish.setUsage(DynamicDrawUsage);
      g.paint.setAttribute('finish', finish);
      const mk = (geo: BufferGeometry, mat: Material, n: number, cast: boolean) => {
        const im = new InstancedMesh(geo, mat, n);
        im.instanceMatrix.setUsage(DynamicDrawUsage);
        im.castShadow = cast;
        im.receiveShadow = true;
        im.count = 0;
        im.name = `cars-${kind}-${lv}`;
        root.add(im);
        return im;
      };
      const level: Level = {
        paint: mk(g.paint, paint, list.length, lv < 2),
        glass: mk(g.glass, lv === 0 ? glassNear : glassFar, list.length, false),
        parts: mk(g.parts, parts, list.length, lv < 2),
        wheels: mk(buildWheel(d, detail), parts, list.length * 4, lv < 2),
        finish,
      };
      if (lv === 0) level.glass.renderOrder = GLASS_ORDER;
      level.paint.setColorAt(0, new Color());
      level.paint.instanceColor!.setUsage(DynamicDrawUsage);
      return level;
    });
    groups.push({ kind, cars, levels });
    for (const c of cars) c.collider = addBox(c.p.x, c.p.z, d.W / 2 + 0.05, d.L / 2, c.p.rot, 0, 1.6, 'car');
  }

  /** Sort the parked cars into the three levels of detail by their distance from you. */
  const rebucket = (px: number, pz: number) => {
    for (const g of groups) {
      const n = [0, 0, 0];
      for (const c of g.cars) {
        const dist = Math.hypot(c.p.x - px, c.p.z - pz);
        const lv = dist < LOD_RANGE[0] ? 0 : dist < LOD_RANGE[1] ? 1 : 2;
        const L = g.levels[lv];
        const i = n[lv]++;
        L.paint.setMatrixAt(i, c.m);
        L.glass.setMatrixAt(i, c.m);
        L.parts.setMatrixAt(i, c.m);
        L.paint.setColorAt(i, c.col);
        L.finish.setXY(i, c.p.metal * 0.85, c.p.metal > 0 ? 0.34 : 0.45);
        for (let w = 0; w < 4; w++) L.wheels.setMatrixAt(i * 4 + w, c.wheels[w]);
      }
      g.levels.forEach((L, lv) => {
        for (const im of [L.paint, L.glass, L.parts, L.wheels]) {
          im.count = n[lv] * (im === L.wheels ? 4 : 1);
          im.visible = n[lv] > 0;
          im.instanceMatrix.needsUpdate = true;
          if (im.visible) im.computeBoundingSphere();
        }
        L.paint.instanceColor!.needsUpdate = true;
        L.finish.needsUpdate = true;
      });
    }
  };

  // the Collect cars
  envMats.push(...Object.values(sharedMaterials()));
  const collect: Object3D[] = [];
  const made = await Promise.all(drop.map((s) => collectCar(pool[s.edition - 1])));
  made.forEach((m, i) => {
    const s = drop[i];
    const rot = rotOf(s.x);
    const size = MODEL_SIZE[bodyOf(s.edition)];
    const col = addBox(s.x, s.z, size.w / 2, size.l / 2, rot, 0, 1.3, 'car');
    if (!m) return;
    m.obj.userData.col = col;
    m.obj.userData.blob = parked.length + i;
    m.obj.position.set(s.x, terrainHeight(s.x, s.z), s.z);
    m.obj.rotation.y = rot;
    root.add(m.obj);
    collect.push(m.obj);
    envMats.push(...m.materials.filter((x) => x.name === 'drop-rim' || x.name === 'drop-trim'));
  });

  // contact shadows: the sky can't reach under a car
  const blobMat = new MeshBasicMaterial({ color: 0x000000, map: blobTexture(), transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const blobGeo = new PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  const allCars = [
    ...parked.map((p) => ({ x: p.x, z: p.z, rot: p.rot, w: DESIGNS[p.kind].W + 0.25, l: DESIGNS[p.kind].L + 0.2 })),
    ...drop.map((c) => ({ x: c.x, z: c.z, rot: rotOf(c.x), w: MODEL_SIZE[bodyOf(c.edition)].w + 0.2, l: MODEL_SIZE[bodyOf(c.edition)].l + 0.15 })),
  ];
  const blobs = new InstancedMesh(blobGeo, blobMat, allCars.length);
  const m = new Matrix4();
  allCars.forEach((c, i) => {
    m.compose(new Vector3(c.x, terrainHeight(c.x, c.z) + 0.012, c.z), q.setFromAxisAngle(up, c.rot), new Vector3(c.w, 1, c.l));
    blobs.setMatrixAt(i, m);
  });
  blobs.computeBoundingSphere();
  blobs.renderOrder = 1;
  root.add(blobs);

  const hideBlob = (i: number) => {
    blobs.setMatrixAt(i, new Matrix4().makeScale(0, 0, 0));
    blobs.instanceMatrix.needsUpdate = true;
  };

  // a car of its own (the moving one, and any parked car you get into): full detail, wheels that spin and steer
  const freeGeo = new Map<Kind, { body: CarGeometry; wheel: BufferGeometry }>();
  const makeFreeCar = (kind: Kind, color: string, metal: number) => {
    const d = DESIGNS[kind];
    let fg = freeGeo.get(kind);
    if (!fg) {
      fg = { body: buildBody(d, 1), wheel: buildWheel(d, 1) };
      freeGeo.set(kind, fg);
    }
    const group = new Group();
    const paintGeo = fg.body.paint.clone();
    paintGeo.setAttribute('finish', new InstancedBufferAttribute(new Float32Array([metal * 0.85, metal > 0 ? 0.34 : 0.45]), 2));
    const paintMesh = new InstancedMesh(paintGeo, paintFor(kind), 1);
    paintMesh.setMatrixAt(0, new Matrix4());
    paintMesh.setColorAt(0, new Color().setRGB(...lin(color)));
    paintMesh.computeBoundingSphere();
    const glass = new Mesh(fg.body.glass, glassNear);
    glass.renderOrder = GLASS_ORDER;
    for (const mesh of [paintMesh, glass, new Mesh(fg.body.parts, parts)]) {
      mesh.castShadow = mesh !== glass;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    const wheels: Object3D[] = [];
    const fronts: Object3D[] = [];
    for (const [sx, wz] of [[1, d.wf], [-1, d.wf], [1, d.wr], [-1, d.wr]] as [number, number][]) {
      const pivot = new Group();
      pivot.position.set(sx * (d.track / 2), d.wheelR, wz);
      const spin = new Group();
      spin.rotation.order = 'YXZ';
      const side = new Group();
      side.rotation.y = sx > 0 ? 0 : Math.PI;
      const tyre = new Mesh(fg.wheel, parts);
      tyre.castShadow = true;
      side.add(tyre);
      spin.add(side);
      pivot.add(spin);
      group.add(pivot);
      wheels.push(spin);
      if (wz === d.wf) fronts.push(pivot);
    }
    const blob = new Mesh(blobGeo, blobMat);
    blob.scale.set(d.W + 0.25, 1, d.L + 0.2);
    blob.position.y = 0.012;
    group.add(blob);
    return { root: group, wheels, fronts };
  };

  // the one moving car: a silver sedan cruising the lanes
  const md = DESIGNS.sedan;
  const traffic = makeFreeCar('sedan', '#aeb3b8', 0.82);
  const car = traffic.root;
  const wheels = traffic.wheels;
  car.name = 'moving-car';
  root.add(car);
  let hijacked = false;
  const moving: MovingCar = { pos: new Vector3(), vel: new Vector3(), heading: 0, speed: 0, visible: false };
  // a slow loop: south in the west lane, a pause, north in the east lane, a pause
  const REACH = 720;
  let leg = 0; // 0 southbound, 1 northbound
  let along = -REACH;
  let pause = 0;
  let speed = 0;
  const cruise = 9.5;
  let lastX = NaN;
  let lastZ = NaN;

  const takeParked = (g: KindGroup, c: KindGroup['cars'][number], label: string): Taken | null => {
    const i = g.cars.indexOf(c);
    if (i < 0) return null;
    g.cars.splice(i, 1);
    rebucket(c.p.x, c.p.z);
    lastX = c.p.x;
    lastZ = c.p.z;
    if (c.collider) c.collider.off = true;
    hideBlob(c.blob);
    const fc = makeFreeCar(g.kind, c.p.color, c.p.metal);
    fc.root.position.set(c.p.x, terrainHeight(c.p.x, c.p.z), c.p.z);
    fc.root.rotation.y = c.p.rot;
    root.add(fc.root);
    return { root: fc.root, wheels: fc.wheels, fronts: fc.fronts, def: carRide(g.kind, label) };
  };
  const takeCollect = (o: Object3D): Taken => {
    const car = pool[o.userData.edition - 1];
    const i = collect.indexOf(o);
    if (i >= 0) collect.splice(i, 1);
    if (o.userData.col) (o.userData.col as Collider).off = true;
    hideBlob(o.userData.blob);
    o.visible = true;
    o.traverse((m) => ((m as Mesh).isMesh ? ((m as Mesh).castShadow = true) : null));
    const s = MODEL_SIZE[car.tier.body];
    const b = new Mesh(blobGeo, blobMat);
    b.scale.set(s.w + 0.2, 1, s.l + 0.15);
    b.position.y = 0.012;
    o.add(b);
    return collectTaken(o, car);
  };
  const near = (px: number, pz: number, x: number, z: number, r: number) => Math.abs(px - x) < r + 3 && Math.abs(pz - z) < r + 3;
  const parkedCandidate = (g: KindGroup, c: KindGroup['cars'][number]): CarCandidate => {
    const d = DESIGNS[g.kind];
    const label = `the ${COLOUR_NAME[c.p.color] ?? ''} ${KIND_NAME[g.kind]}`.replace('  ', ' ');
    return { label, x: c.p.x, y: terrainHeight(c.p.x, c.p.z), z: c.p.z, yaw: c.p.rot, l: d.L, w: d.W, take: () => takeParked(g, c, label) };
  };
  const collectCandidate = (o: Object3D): CarCandidate => {
    const car = pool[o.userData.edition - 1];
    const s = MODEL_SIZE[car.tier.body];
    return { label: editionRide(car).label ?? 'the car', x: o.position.x, y: o.position.y, z: o.position.z, yaw: o.rotation.y, l: s.l, w: s.w, take: () => takeCollect(o) };
  };
  const trafficCandidate = (): CarCandidate => ({
    label: 'the silver sedan',
    x: car.position.x,
    y: car.position.y,
    z: car.position.z,
    yaw: car.rotation.y,
    l: md.L,
    w: md.W,
    take: () => {
      hijacked = true;
      moving.visible = false;
      trafficCol.off = true;
      return { root: car, wheels: traffic.wheels, fronts: traffic.fronts, def: carRide('sedan', 'the silver sedan') };
    },
  });
  const carCandidates: CandidateSource = (x, z, r) => {
    const out: CarCandidate[] = [];
    for (const g of groups) for (const c of g.cars) if (near(c.p.x, c.p.z, x, z, r)) out.push(parkedCandidate(g, c));
    for (const o of collect) if (near(o.position.x, o.position.z, x, z, r)) out.push(collectCandidate(o));
    // the moving car, once it has stopped for you
    if (!hijacked && moving.visible && moving.speed < 0.6 && near(car.position.x, car.position.z, x, z, r)) out.push(trafficCandidate());
    return out;
  };
  // crashes: every car's collider knows how to come loose
  let knockFn: ((c: CarCandidate) => unknown) | null = null;
  for (const g of groups)
    for (const c of g.cars)
      if (c.collider) c.collider.knock = () => (knockFn && g.cars.includes(c) ? knockFn(parkedCandidate(g, c)) : null);
  for (const o of collect) if (o.userData.col) (o.userData.col as Collider).knock = () => (knockFn && collect.includes(o) ? knockFn(collectCandidate(o)) : null);
  // the moving car can be hit too: it carries a collider along, and comes loose at its own speed
  const trafficCol = addDynamicBox(0, 0, md.W / 2, md.L / 2, 0, -50, -49, 'car');
  trafficCol.knock = () => {
    if (!knockFn || hijacked) return null;
    const v = moving.speed;
    const dir = Math.cos(car.rotation.y) >= 0 ? 1 : -1;
    const r = knockFn(trafficCandidate()) as { speed: number } | null;
    if (r) r.speed = v * (dir > 0 ? 1 : 1);
    return r;
  };

  return {
    root,
    moving,
    drop: { seed, cars: drop },
    spots: [...parked.map((p) => ({ kind: p.kind as string, x: p.x, z: p.z })), ...drop.map((c) => ({ kind: bodyOf(c.edition) as string, x: c.x, z: c.z }))],
    carCandidates,
    knockWith(fn) {
      knockFn = fn;
    },
    setEnv(env: Texture) {
      for (const mat of envMats) {
        (mat as MeshStandardMaterial).envMap = env;
        mat.needsUpdate = true;
      }
    },
    update(t: number, dt: number, player: Vector3) {
      void t;
      if (!(Math.abs(player.x - lastX) + Math.abs(player.z - lastZ) < 2)) {
        lastX = player.x;
        lastZ = player.z;
        rebucket(player.x, player.z);
      }
      // the detailed Collect cars only cast shadows near you, and aren't drawn at all far down the street
      for (const o of collect) {
        const dist = Math.hypot(o.position.x - player.x, o.position.z - player.z);
        o.visible = dist < 280;
        const near = dist < 70;
        if (o.userData.near !== near) {
          o.userData.near = near;
          o.traverse((c) => ((c as Mesh).isMesh ? ((c as Mesh).castShadow = near) : null));
        }
      }
      // you took the moving car: it goes where you drive it now
      if (hijacked) {
        moving.visible = false;
        moving.speed = 0;
        return;
      }
      if (pause > 0) {
        pause -= dt;
        trafficCol.y0 = -50;
        trafficCol.y1 = -49;
        car.visible = false;
        moving.visible = false;
        moving.speed = 0;
        return;
      }
      car.visible = true;
      moving.visible = true;
      const dir = leg === 0 ? 1 : -1;
      const laneX = leg === 0 ? -2.25 : 2.25;
      const z = dir * along;
      // stop for anyone standing in the lane ahead
      const ahead = (player.z - z) * dir;
      const inLane = Math.abs(player.x - laneX) < 1.9 && ahead > 0 && ahead < 16 && player.y < 3;
      const target = inLane ? 0 : cruise;
      speed += Math.max(-6 * dt, Math.min(2.2 * dt, target - speed));
      along += speed * dt;
      if (along > REACH) {
        along = -REACH;
        leg = 1 - leg;
        pause = 25;
      }
      const zz = dir * along;
      car.position.set(laneX, terrainHeight(laneX, zz), zz);
      car.rotation.y = dir > 0 ? 0 : Math.PI;
      trafficCol.x = laneX;
      trafficCol.z = zz;
      trafficCol.rot = car.rotation.y;
      trafficCol.y0 = car.position.y;
      trafficCol.y1 = car.position.y + 1.4;
      for (const w of wheels) w.rotation.x += (speed * dt) / md.wheelR;
      moving.pos.copy(car.position);
      moving.vel.set(0, 0, dir * speed);
      moving.heading = car.rotation.y;
      moving.speed = speed;
    },
  };
}
