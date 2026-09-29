// What the walker and the vehicles collide with and stand on: terrain plus everything the world modules
// register (terraces, steps, tower decks and stairs as height boxes; walls, trunks, cars and furniture as
// colliders). A coarse grid keeps queries local.
import { terrainHeight, terrainSurface, type Surface } from './layout';

export interface HeightBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** top height; for ramps the height at the low end */
  y: number;
  /** ramp: rises by `rise` along +x ('x') or +z ('z'), or down ('-x', '-z'); stairs quantise to `step` */
  ramp?: { axis: 'x' | 'z' | '-x' | '-z'; rise: number; step?: number };
  /** underside (a deck you can walk under); default: solid to the ground */
  bottom?: number;
  surface: Surface;
}

/** Vertical cylinder or oriented box, from y0 to y1. */
export interface Collider {
  kind: 'circle' | 'box';
  x: number;
  z: number;
  /** circle radius, or box half extents along its own axes */
  r: number;
  hx: number;
  hz: number;
  /** box yaw (rad) */
  rot: number;
  y0: number;
  y1: number;
  /** walkers slide off it; vehicles too */
  tag?: string;
  /** switched off for now (a door that is open) */
  off?: boolean;
  /** a car that can be knocked: returns the moving body it becomes (a Ride) */
  knock?: () => unknown;
}

/** One contact from collide(): what was hit and which way it pushed you (unit vector). */
export interface Contact {
  c: Collider;
  nx: number;
  nz: number;
}

const CELL = 8;

class Grid<T> {
  private m = new Map<number, T[]>();
  private key(i: number, j: number) {
    return (i + 1000) * 4096 + (j + 1000);
  }
  add(x0: number, z0: number, x1: number, z1: number, item: T): void {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = this.key(i, j);
        let a = this.m.get(k);
        if (!a) this.m.set(k, (a = []));
        a.push(item);
      }
  }
  near(x: number, z: number, r: number, out: Set<T>): Set<T> {
    out.clear();
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const a = this.m.get(this.key(i, j));
        if (a) for (const it of a) out.add(it);
      }
    return out;
  }
}

const heights = new Grid<HeightBox>();
const colliders = new Grid<Collider>();
const _hs = new Set<HeightBox>();
const _cs = new Set<Collider>();

export function addHeightBox(h: HeightBox): void {
  heights.add(Math.min(h.x0, h.x1), Math.min(h.z0, h.z1), Math.max(h.x0, h.x1), Math.max(h.z0, h.z1), h);
}

export function addCircle(x: number, z: number, r: number, y0: number, y1: number, tag?: string): void {
  colliders.add(x - r, z - r, x + r, z + r, { kind: 'circle', x, z, r, hx: r, hz: r, rot: 0, y0, y1, tag });
}

export function addBox(x: number, z: number, hx: number, hz: number, rot: number, y0: number, y1: number, tag?: string): Collider {
  const e = Math.hypot(hx, hz);
  const c: Collider = { kind: 'box', x, z, r: e, hx, hz, rot, y0, y1, tag };
  colliders.add(x - e, z - e, x + e, z + e, c);
  return c;
}

/** Colliders that move (cars you have driven and left somewhere): checked everywhere, not through the grid. */
const dynamic: Collider[] = [];
export function addDynamicBox(x: number, z: number, hx: number, hz: number, rot: number, y0: number, y1: number, tag?: string): Collider {
  const c: Collider = { kind: 'box', x, z, r: Math.hypot(hx, hz), hx, hz, rot, y0, y1, tag };
  dynamic.push(c);
  return c;
}

/** Axis-aligned box collider from extents. */
export function addAABB(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tag?: string): void {
  addBox((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, 0, y0, y1, tag);
}

function boxTop(h: HeightBox, x: number, z: number): number {
  if (!h.ramp) return h.y;
  const r = h.ramp;
  let t: number;
  if (r.axis === 'x') t = (x - h.x0) / (h.x1 - h.x0);
  else if (r.axis === '-x') t = (h.x1 - x) / (h.x1 - h.x0);
  else if (r.axis === 'z') t = (z - h.z0) / (h.z1 - h.z0);
  else t = (h.z1 - z) / (h.z1 - h.z0);
  t = Math.min(1, Math.max(0, t));
  let y = h.y + r.rise * t;
  if (r.step) y = h.y + Math.min(r.rise, Math.ceil((y - h.y) / r.step - 1e-3) * r.step);
  return y;
}

export interface GroundHit {
  y: number;
  surface: Surface;
}

/**
 * Highest walkable surface at (x, z) that is not above `maxY` (so you can walk under a deck, and step up
 * onto things no higher than maxY).
 */
export function groundAt(x: number, z: number, maxY = 1e9, out: GroundHit = { y: 0, surface: 'pavement' }): GroundHit {
  out.y = terrainHeight(x, z);
  out.surface = terrainSurface(x, z);
  heights.near(x, z, 0, _hs);
  for (const h of _hs) {
    if (x < Math.min(h.x0, h.x1) || x > Math.max(h.x0, h.x1) || z < Math.min(h.z0, h.z1) || z > Math.max(h.z0, h.z1)) continue;
    const top = boxTop(h, x, z);
    if (top <= maxY && top >= out.y) {
      out.y = top;
      out.surface = h.surface;
    }
  }
  return out;
}

/**
 * Push a circle of radius `r` at (x, z), spanning heights [y0, y1], out of every collider it overlaps.
 * Returns the corrected position in `p` and whether anything was hit.
 */
export function collide(p: { x: number; z: number }, r: number, y0: number, y1: number, ignoreTag?: string, contacts?: Contact[], skip?: Collider | null): boolean {
  let hit = false;
  colliders.near(p.x, p.z, r + 1, _cs);
  for (const c of dynamic) if (Math.abs(c.x - p.x) < c.r + r + 1 && Math.abs(c.z - p.z) < c.r + r + 1) _cs.add(c);
  for (let iter = 0; iter < 2; iter++) {
    for (const c of _cs) {
      if (c.off || c === skip || y1 < c.y0 || y0 > c.y1) continue;
      if (ignoreTag && c.tag === ignoreTag) continue;
      if (c.kind === 'circle') {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const m = c.r + r;
        if (d < m && d > 1e-6) {
          p.x = c.x + (dx / d) * m;
          p.z = c.z + (dz / d) * m;
          hit = true;
          if (contacts && iter === 0) contacts.push({ c, nx: dx / d, nz: dz / d });
        }
      } else {
        // to box space
        const cs = Math.cos(c.rot);
        const sn = Math.sin(c.rot);
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const lx = dx * cs - dz * sn;
        const lz = dx * sn + dz * cs;
        const qx = Math.max(-c.hx, Math.min(c.hx, lx));
        const qz = Math.max(-c.hz, Math.min(c.hz, lz));
        let ex = lx - qx;
        let ez = lz - qz;
        let d = Math.hypot(ex, ez);
        if (d >= r) continue;
        let nx: number;
        let nz: number;
        if (d < 1e-6) {
          // centre inside: push out along the shallowest axis
          const px = c.hx - Math.abs(lx);
          const pz = c.hz - Math.abs(lz);
          if (px < pz) {
            nx = Math.sign(lx) || 1;
            nz = 0;
            d = -px;
          } else {
            nx = 0;
            nz = Math.sign(lz) || 1;
            d = -pz;
          }
        } else {
          nx = ex / d;
          nz = ez / d;
        }
        const push = r - d;
        const wx = nx * cs + nz * sn;
        const wz = -nx * sn + nz * cs;
        p.x += wx * push;
        p.z += wz * push;
        hit = true;
        if (contacts && iter === 0) contacts.push({ c, nx: wx, nz: wz });
        ex = ez = 0;
      }
    }
  }
  return hit;
}

/** Is there a solid collider covering this point at this height (for placement checks)? */
export function blocked(x: number, z: number, y: number, r = 0.2): boolean {
  const p = { x, z };
  return collide(p, r, y, y + 0.1);
}
