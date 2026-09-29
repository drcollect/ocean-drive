// The Collect cars from ~/blender/Collect Car (Rally, Wedge, Endurance, Hypercar, Streamliner), parked on
// Ocean Drive as editions of Collect Car · Drop 01 in their DEMO-seed looks (drop/drop01.ts, drop/livery.ts):
// the five editions the drop spec publishes stand in a row in front of the hotels where the walk starts,
// Common at the north end to Secret Rare nearest you, and more editions, picked at random from the pool,
// take parking places along the street (a new pick on every load; `?drop=N` repeats one).
import { Color, MeshPhysicalMaterial, MeshStandardMaterial, Vector3, type Material, type Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Rng } from '../core/rng';
import { CHARACTER, type Body, type Car } from '../drop/drop01';
import { dressCar } from '../drop/livery';
import type { Taken } from '../vehicles/drive';
import type { RideDef } from '../vehicles/ride';
import { lin } from './materials';

/** length and width (m) of each body */
export const MODEL_SIZE: Record<Body, { l: number; w: number }> = {
  rally: { l: 4.64, w: 1.99 },
  wedge: { l: 4.4, w: 1.93 },
  endurance: { l: 4.9, w: 1.97 },
  hypercar: { l: 4.7, w: 2.05 },
  streamliner: { l: 5.2, w: 1.63 },
};

/** chassis numbers from the GLBs (cars.json) and a driver's eye for the seat view */
const CHASSIS: Record<Body, { wheelbase: number; track: number; wheelR: number; eye: [number, number, number] }> = {
  rally: { wheelbase: 3.243, track: 1.742, wheelR: 0.521, eye: [0.4, 1.45, -0.25] },
  wedge: { wheelbase: 2.746, track: 1.63, wheelR: 0.365, eye: [0.38, 0.98, -0.35] },
  endurance: { wheelbase: 3.244, track: 1.625, wheelR: 0.403, eye: [0.36, 0.95, -0.15] },
  hypercar: { wheelbase: 3.229, track: 1.624, wheelR: 0.414, eye: [0.36, 0.98, -0.3] },
  streamliner: { wheelbase: 2.969, track: 1.42, wheelR: 0.348, eye: [0, 0.92, 0.05] },
};

/**
 * How an edition drives, from its six ratings (a scaled-down, game-feel reading of the spec's table: top
 * speed from the Speed rating, pull from Acceleration and Launch, stopping from Braking, lock from Handling,
 * sand from Off-road). The Streamliner is fastest in a straight line, the Rally barely slows in sand.
 */
export function editionRide(car: Car): RideDef {
  const [spd, acc, lau, han, brk, off] = car.ratings;
  const body = car.tier.body;
  const c = CHASSIS[body];
  const size = MODEL_SIZE[body];
  const top = ((200 + 3.4 * (spd - 35)) / 3.6) * 0.36;
  const sand = 0.18 + (off - 35) * 0.012;
  return {
    kind: 'car',
    label: `the ${car.tier.name} ${car.tier.bodyName} #${String(car.edition).padStart(4, '0')}`,
    dims: size,
    reverse: 6,
    mass: CHARACTER[body].mass,
    wheelbase: c.wheelbase,
    track: c.track,
    radius: size.w / 2 - 0.08,
    maxSteer: 0.5 + (han - 50) * 0.005,
    accel: 3 + (acc - 35) * 0.13 + (lau - 35) * 0.03,
    brake: 6 + (brk - 35) * 0.16,
    stepUp: body === 'rally' ? 0.45 : 0.28,
    top: { default: top, grass: top * 0.55, sand: top * sand, wetsand: top * (sand + 0.12), water: 2, wood: 3 },
    eye: new Vector3(...c.eye),
    wheelR: c.wheelR,
  };
}

/** Hand a dressed Collect car over to be driven: its wheel nodes spin, the front ones steer. */
export function collectTaken(obj: Object3D, car: Car): Taken {
  const wheels = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'].map((n) => obj.getObjectByName(n)).filter((w): w is Object3D => !!w);
  const fronts = wheels.filter((w) => /F[LR]$/.test(w.name));
  return { root: obj, wheels, fronts, def: editionRide(car) };
}

const loader = new GLTFLoader();
const models = new Map<Body, Promise<Object3D | null>>();

/** One GLB per body, loaded once; clone the result. */
export function loadModel(body: Body): Promise<Object3D | null> {
  let p = models.get(body);
  if (!p) {
    // relative to wherever the site is served from (the root on Vercel, /ocean-drive/ on GitHub Pages)
    p = loader.loadAsync(`${import.meta.env.BASE_URL}models/cars/${body}.glb`).then(
      (g) => g.scene,
      (e) => {
        console.warn('Collect car failed to load', body, e);
        return null;
      },
    );
    models.set(body, p);
  }
  return p;
}

const col = (h: string) => new Color().setRGB(...lin(h));
let shared: Record<string, Material> | null = null;
/** the materials every Collect car shares, by material name in the GLBs */
export function sharedMaterials(): Record<string, Material> {
  shared ??= {
    Trim: new MeshStandardMaterial({ color: col('#161718'), roughness: 0.55 }),
    Carbon: new MeshStandardMaterial({ color: col('#1b1d20'), roughness: 0.35, metalness: 0.3 }),
    Metal: new MeshStandardMaterial({ color: col('#b8bbbe'), roughness: 0.3, metalness: 1 }),
    Void: new MeshStandardMaterial({ color: col('#050505'), roughness: 0.9 }),
    Glass: new MeshPhysicalMaterial({ color: col('#0c1114'), roughness: 0.04, metalness: 0, ior: 1.6, envMapIntensity: 1.4 }),
    Taillight: new MeshStandardMaterial({ color: col('#9e1010'), roughness: 0.2, emissive: col('#ff2010'), emissiveIntensity: 0.08 }),
    Tire: new MeshStandardMaterial({ color: col('#121212'), roughness: 0.92 }),
  };
  return shared;
}

/** A dressed copy of an edition's body, origin on the ground between the axles, nose +z. */
export async function collectCar(car: Car, opts: { glow?: number; shared?: Record<string, Material> } = {}): Promise<{ obj: Object3D; materials: Material[] } | null> {
  const src = await loadModel(car.tier.body);
  if (!src) return null;
  const obj = src.clone(true);
  const dressed = dressCar(obj, car, opts.shared ?? sharedMaterials(), { glow: opts.glow });
  obj.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
  });
  obj.name = `collect-${String(car.edition).padStart(4, '0')}`;
  obj.userData.collect = true;
  obj.userData.edition = car.edition;
  return { obj, materials: dressed.materials };
}

/** The street's pick: `?drop=N`, otherwise a new one on every load. */
export function dropSeed(): number {
  const p = new URLSearchParams(location.search).get('drop');
  return p !== null && p !== '' && Number.isFinite(Number(p)) ? Math.floor(Number(p)) : Math.floor(Math.random() * 1e6);
}

/** `n` editions picked from the pool at random (not those in `exclude`), for parking places along the street. */
export function streetEditions(seed: number, n: number, exclude: number[]): number[] {
  const rng = new Rng(seed);
  const out: number[] = [];
  while (out.length < n) {
    const e = 1 + Math.floor(rng.f() * 1000);
    if (!exclude.includes(e) && !out.includes(e)) out.push(e);
  }
  return out;
}
