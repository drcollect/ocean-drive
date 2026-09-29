// Getting into any car, and crashing into the others: the parked road cars, the Collect cars on the street,
// the cars in the drop garage and the one that drives up and down. Each world module offers the cars near a
// point as candidates; E next to one takes it out of its owner (an instanced parked car becomes a car of its
// own) and turns it into a Ride. A car you hit is taken out the same way, as a ride nobody drives: it slides,
// spins and stops, and it can knock the next one. Every such car keeps a collider that moves with it.
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, Points, PointsMaterial, SRGBColorSpace, Vector3, type Object3D } from 'three';
import { addDynamicBox, type Collider } from '../world/registry';
import { Ride, type RideDef } from './ride';

export interface Taken {
  root: Object3D;
  /** spin about their own x */
  wheels: Object3D[];
  /** steer about their own y */
  fronts: Object3D[];
  def: RideDef;
}

export interface CarCandidate {
  label: string;
  x: number;
  y: number;
  z: number;
  /** heading: the nose points along (sin yaw, 0, cos yaw) */
  yaw: number;
  l: number;
  w: number;
  take(): Taken | null;
}

/** Cars within `r` of (x, z) that could be driven. */
export type CandidateSource = (x: number, z: number, r: number) => CarCandidate[];

/** How far (m) a point is from a car's footprint (0 inside). */
export function carDistance(px: number, pz: number, x: number, z: number, yaw: number, l: number, w: number): number {
  const dx = px - x;
  const dz = pz - z;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // into the car's frame: forward (sin, cos), left (cos, -sin)
  const lf = dx * s + dz * c;
  const ll = dx * c - dz * s;
  const ex = Math.max(0, Math.abs(ll) - w / 2);
  const ez = Math.max(0, Math.abs(lf) - l / 2);
  return Math.hypot(ex, ez);
}

export class Driving {
  readonly sources: CandidateSource[] = [];
  private cols = new Map<Ride, Collider>();
  /** a car was knocked loose (for its alarm) */
  onLoose: ((r: Ride) => void) | null = null;
  private sparks: Points;
  private sparkPos = new Float32Array(96 * 3);
  private sparkVel = new Float32Array(96 * 3);
  private sparkLife = new Float32Array(96);
  private nextSpark = 0;

  constructor(
    private world: Object3D,
    private rides: Ride[],
  ) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.sparkPos, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d')!;
    const grd = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 32, 32);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    this.sparks = new Points(g, new PointsMaterial({ size: 0.12, map: tex, color: new Color(6, 3.2, 1.2), transparent: true, depthWrite: false, blending: AdditiveBlending }));
    this.sparks.frustumCulled = false;
    this.sparkPos.fill(-100);
    world.add(this.sparks);
  }

  /** A shower of sparks where metal met metal. */
  spark(x: number, y: number, z: number, strength: number): void {
    const n = Math.min(40, Math.round(strength * 4));
    for (let k = 0; k < n; k++) {
      const i = this.nextSpark++ % 96;
      this.sparkPos.set([x, y, z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const v = 1.5 + Math.random() * strength * 0.6;
      this.sparkVel.set([Math.cos(a) * v, 1 + Math.random() * 3, Math.sin(a) * v], i * 3);
      this.sparkLife[i] = 0.35 + Math.random() * 0.45;
    }
  }

  /** Cars sliding after a knock, their colliders, the sparks. */
  update(dt: number, t: number, driven: Ride | null): void {
    for (const r of this.rides) {
      if (r === driven || !r.col || !r.moving) continue;
      r.update(dt, t, null);
      const col = r.col;
      col.x = r.pos.x;
      col.z = r.pos.z;
      col.rot = r.yaw;
      col.y0 = r.pos.y;
      col.y1 = r.pos.y + 1.4;
    }
    for (let i = 0; i < 96; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      const o = i * 3;
      this.sparkVel[o + 1] -= 9.8 * dt;
      this.sparkPos[o] += this.sparkVel[o] * dt;
      this.sparkPos[o + 1] += this.sparkVel[o + 1] * dt;
      this.sparkPos[o + 2] += this.sparkVel[o + 2] * dt;
      if (this.sparkLife[i] <= 0) this.sparkPos[o + 1] = -100;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
  }

  /** A car that was hit: out of its owner, as a ride nobody drives. */
  loose(c: CarCandidate): Ride | null {
    const r = this.take(c);
    if (!r || !r.col) return r;
    r.col.off = false;
    this.onLoose?.(r);
    return r;
  }

  /** The car you are standing next to, if any. */
  nearest(x: number, y: number, z: number, reach = 1.1): CarCandidate | null {
    let best: CarCandidate | null = null;
    let bd = reach;
    for (const src of this.sources)
      for (const c of src(x, z, 8)) {
        if (Math.abs(c.y - y) > 1.4) continue;
        const d = carDistance(x, z, c.x, c.z, c.yaw, c.l, c.w);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
    return best;
  }

  /** Take the car out of its owner and make it a ride. */
  take(c: CarCandidate): Ride | null {
    const t = c.take();
    if (!t) return null;
    // the ride sets a world transform, so the car hangs straight off the world
    if (t.root.parent !== this.world) this.world.attach(t.root);
    for (const w of t.wheels) w.rotation.order = 'YXZ';
    const r = new Ride(t.def, t.root, t.wheels, null, c.x, c.z, c.yaw, t.fronts);
    const dims = t.def.dims ?? { l: c.l, w: c.w };
    const col = addDynamicBox(c.x, c.z, dims.w / 2, dims.l / 2, c.yaw, r.pos.y, r.pos.y + 1.4, 'car');
    col.off = true;
    col.knock = () => r;
    r.col = col;
    this.cols.set(r, col);
    this.rides.push(r);
    return r;
  }

  /** You got in: the car stops being an obstacle for itself. */
  entered(r: Ride): void {
    const col = this.cols.get(r);
    if (col) col.off = true;
  }

  /** You got out: it becomes an obstacle where it stands. */
  left(r: Ride): void {
    const col = this.cols.get(r);
    if (!col) return;
    col.x = r.pos.x;
    col.z = r.pos.z;
    col.rot = r.yaw;
    col.y0 = r.pos.y;
    col.y1 = r.pos.y + 1.4;
    col.off = false;
  }
}

/** A driver's eye (local) for the chase camera to aim past, and a first-person seat. */
export const eyeAt = (x: number, y: number, z: number) => new Vector3(x, y, z);
