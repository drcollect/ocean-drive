// The eight review cameras (A–H) from the brief. Positions are in world metres; heights are above the
// ground at that spot. Stages that add towers or vehicles register a resolver that refines their camera.
import { Vector3 } from 'three';
import { SUN_DIR } from '../sky/atmosphere';
import { terrainHeight } from '../world/layout';
import { dropToWorld } from '../drop/site';

export interface CamPose {
  pos: Vector3;
  /** yaw: 0 = looking north (−Z), positive turns towards east (+X) */
  yaw: number;
  pitch: number;
  /** mount this vehicle first (C, F) */
  ride?: 'bike' | 'atv';
}

const deg = Math.PI / 180;
const sunYaw = Math.atan2(SUN_DIR.x, -SUN_DIR.z);

function at(x: number, z: number, eye: number, yaw: number, pitch: number, ride?: CamPose['ride']): CamPose {
  return { pos: new Vector3(x, terrainHeight(x, z) + eye, z), yaw, pitch, ride };
}

export const CAMERA_NOTES: Record<string, string> = {
  A: 'street looking north between hotels and palms',
  B: 'street looking south with parked cars and café patios',
  C: 'first-person on the bike in the park strip',
  D: 'wide beach toward the sun and wet sand',
  E: 'close lifeguard tower with sun flare and ATV',
  F: 'first-person riding the ATV down the beach',
  G: 'standing in the swash looking into the glitter path',
  H: 'looking back from the sand toward the hotel row',
  I: 'the five Collect cars parked in a row in front of the hotels',
  J: 'the Collect Drop garage in the park: kiosk, odds board, door',
};

const resolvers: Partial<Record<string, () => CamPose>> = {};

/** Later stages refine a camera (e.g. E needs the tower's real position). */
export function registerCamera(id: string, fn: () => CamPose): void {
  resolvers[id] = fn;
}

export function cameraPose(id: string): CamPose {
  const r = resolvers[id];
  if (r) return r();
  switch (id) {
    case 'A':
      return at(3.2, 132, 1.65, 0 * deg - 4 * deg, 1.5 * deg);
    case 'B':
      return at(-10.2, -68, 1.65, 180 * deg - 12 * deg, 0.5 * deg);
    case 'C':
      return at(24, 60, 1.6, 4 * deg, -4 * deg, 'bike');
    case 'D':
      return at(94, 8, 1.7, sunYaw - 6 * deg, -5 * deg);
    case 'E': {
      const px = 96;
      const pz = -118;
      const back = 13;
      const h = Math.hypot(SUN_DIR.x, SUN_DIR.z);
      const x = px - (SUN_DIR.x / h) * back;
      const z = pz - (SUN_DIR.z / h) * back;
      return at(x, z, 1.7, sunYaw, 6 * deg);
    }
    case 'F':
      return at(110, -40, 1.45, 172 * deg, -7 * deg, 'atv');
    case 'G':
      return at(121.2, 22, 1.65, sunYaw + 3 * deg, -9 * deg);
    case 'H':
      return at(86, 30, 1.7, -90 * deg - 8 * deg, 4 * deg);
    case 'J': {
      const [x, z] = dropToWorld(0.6, 13.5);
      return at(x, z, 1.7, 90 * deg + 9 * deg, 6 * deg);
    }
    case 'I':
      return at(0.4, 123.5, 1.65, -17 * deg, -3 * deg);
  }
  throw new Error(`unknown camera ${id}`);
}
