// A simple ride model for the beach cruiser, the lifeguard ATV and every car you can get into: throttle and
// brake along the heading, bicycle steering (yaw rate = speed · tan(steer) / wheelbase), ground following
// with pitch and roll from the ground under the wheels, a lean into turns on the bike, collisions with
// everything the walker bumps into, and a limit on steps and water depth. Speed depends on the surface (the
// cruiser bogs down in dry sand, the ATV doesn't, a rally car barely notices).
import { Vector3, type Object3D } from 'three';
import type { Surface } from '../world/layout';
import { collide, groundAt, type Collider, type Contact } from '../world/registry';
import { swashAt, X_SHORE } from '../world/surf';

export interface RideDef {
  kind: 'bike' | 'atv' | 'car';
  /** what the prompt calls it ("the bike", "the Rally #0004") */
  label?: string;
  /** cars: length and width, for getting in and out */
  dims?: { l: number; w: number };
  /** top speed backwards (m/s) */
  reverse?: number;
  /** kg, for crashes */
  mass?: number;
  wheelbase: number;
  track: number;
  radius: number;
  maxSteer: number;
  accel: number;
  brake: number;
  stepUp: number;
  /** top speed by surface (m/s) */
  top: Partial<Record<Surface, number>> & { default: number };
  /** rider's eye in the vehicle's local space */
  eye: Vector3;
  wheelR: number;
}

export const BIKE_DEF: RideDef = {
  kind: 'bike',
  wheelbase: 1.12,
  track: 0.1,
  radius: 0.4,
  maxSteer: 0.55,
  accel: 2.6,
  brake: 4.5,
  stepUp: 0.17,
  top: { default: 6.8, grass: 4.6, sand: 2.4, wetsand: 4.2, water: 1.2, wood: 2 },
  eye: new Vector3(0, 1.58, -0.12),
  wheelR: 0.33,
};

export const ATV_DEF: RideDef = {
  kind: 'atv',
  wheelbase: 1.24,
  track: 1.0,
  radius: 0.75,
  maxSteer: 0.5,
  accel: 3.2,
  brake: 7,
  stepUp: 0.3,
  top: { default: 11, grass: 9, sand: 11.5, wetsand: 13, water: 3, wood: 2 },
  eye: new Vector3(0, 1.5, -0.2),
  wheelR: 0.29,
};

export interface RideControls {
  throttle: number; // -1..1
  steer: number; // -1..1
}

export class Ride {
  readonly pos = new Vector3();
  yaw = 0;
  speed = 0;
  steer = 0;
  pitch = 0;
  roll = 0;
  surface: Surface = 'sand';
  /** distance travelled (for wheel spin, cranks, freewheel ticks) */
  odo = 0;
  throttle = 0;
  bumped = 0;
  /** sideways speed (m/s, to the right) and extra yaw rate (rad/s) after a knock; both die away */
  lat = 0;
  spin = 0;
  /** the last hit's closing speed (m/s), fading: the camera shakes with it */
  impact = 0;
  /** this car's own collider (the others bump into it; it ignores itself) */
  col: Collider | null = null;
  private sw = { depth: 0, edgeX: X_SHORE, flow: 0, highX: X_SHORE };
  private contacts: Contact[] = [];

  /** crash hook (sound, sparks): where, how hard (m/s), and whether it was car on car */
  static onCrash: ((x: number, y: number, z: number, strength: number, cars: boolean) => void) | null = null;

  get mass(): number {
    return this.def.mass ?? (this.def.kind === 'bike' ? 95 : this.def.kind === 'atv' ? 380 : 1400);
  }
  get inertia(): number {
    const l = this.def.dims?.l ?? this.def.wheelbase + 0.6;
    const w = this.def.dims?.w ?? Math.max(0.6, this.def.track);
    return (this.mass * (l * l + w * w)) / 12;
  }
  /** the car's right (x, z) */
  get right(): { x: number; z: number } {
    return { x: -Math.cos(this.yaw), z: Math.sin(this.yaw) };
  }
  /** world velocity (x, z) */
  velocity(): { x: number; z: number } {
    const f = this.forward;
    const r = this.right;
    return { x: f.x * this.speed + r.x * this.lat, z: f.z * this.speed + r.z * this.lat };
  }
  /** Is it still going (or sliding, or spinning)? */
  get moving(): boolean {
    return Math.abs(this.speed) > 0.03 || Math.abs(this.lat) > 0.03 || Math.abs(this.spin) > 0.02;
  }
  /** An impulse (N·s) at a point: changes the speed, the slide and the spin. */
  addImpulse(jx: number, jz: number, px: number, pz: number): void {
    const f = this.forward;
    const r = this.right;
    const dvx = jx / this.mass;
    const dvz = jz / this.mass;
    this.speed += dvx * f.x + dvz * f.z;
    this.lat += dvx * r.x + dvz * r.z;
    const rx = px - this.pos.x;
    const rz = pz - this.pos.z;
    this.spin += (rz * jx - rx * jz) / this.inertia;
  }

  constructor(
    readonly def: RideDef,
    readonly root: Object3D,
    readonly wheels: Object3D[],
    readonly steerPart: Object3D | null,
    x: number,
    z: number,
    yaw: number,
    /** cars: the front wheels' steering pivots */
    readonly fronts: Object3D[] = [],
  ) {
    this.pos.set(x, groundAt(x, z, 100).y, z);
    this.yaw = yaw;
    this.place(0);
  }

  get forward(): Vector3 {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  private groundY(x: number, z: number, maxY: number): number {
    return groundAt(x, z, maxY).y;
  }

  update(dt: number, t: number, c: RideControls | null): void {
    const d = this.def;
    this.bumped = Math.max(0, this.bumped - dt);
    const g = groundAt(this.pos.x, this.pos.z, this.pos.y + d.stepUp);
    let surf: Surface = g.surface;
    // water: the swash sheet on the foreshore, the sea beyond it
    let depth = 0;
    if (this.pos.x > X_SHORE - 16) {
      swashAt(this.pos.x, this.pos.z, t, this.sw);
      depth = Math.max(this.sw.depth, -g.y);
      if (depth > 0.03) surf = 'water';
      else if (this.pos.x > this.sw.highX - 1) surf = 'wetsand';
    }
    this.surface = surf;
    const top = d.top[surf] ?? d.top.default;
    const throttle = c ? c.throttle : 0;
    this.throttle = throttle;
    this.impact *= Math.exp(-dt * 5);
    const steerIn = c ? c.steer : 0;
    // steering eases in, less lock at speed
    const lock = d.maxSteer / (1 + Math.abs(this.speed) * 0.08);
    this.steer += (steerIn * lock - this.steer) * Math.min(1, dt * 5);
    // throttle / brake / rolling resistance (sand drags hard on the bike)
    const drag = surf === 'sand' ? (d.kind === 'bike' ? 1.4 : 0.5) : surf === 'grass' ? 0.3 : d.kind === 'car' ? 0.35 : 0.15;
    if (throttle > 0) {
      if (this.speed < 0) this.speed = Math.min(0, this.speed + d.brake * dt);
      else this.speed += d.accel * throttle * dt * (1 - this.speed / top);
    } else if (throttle < 0) {
      if (this.speed > 0.05) this.speed = Math.max(0, this.speed - d.brake * dt);
      else this.speed = Math.max(-(d.reverse ?? (d.kind === 'bike' ? 1.2 : 3.5)), this.speed - d.accel * 0.6 * dt);
    }
    // nobody driving (a parked car that was hit): the handbrake is on
    const brakeHard = !c && d.kind === 'car' ? 6 : 0;
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (drag + brakeHard) * dt);
    if (this.speed > top) this.speed += (top - this.speed) * Math.min(1, dt * 2);
    // a slide and a spin from a knock die away as the tyres bite
    this.lat *= Math.exp(-dt * (c ? 3.2 : 2.6));
    this.spin *= Math.exp(-dt * (c ? 2.8 : 2.2));
    if (Math.abs(this.lat) < 0.01) this.lat = 0;
    if (Math.abs(this.spin) < 0.005) this.spin = 0;
    // integrate
    const yawRate = (this.speed * Math.tan(this.steer)) / d.wheelbase;
    this.yaw += (yawRate + this.spin) * dt;
    const f = this.forward;
    const rt = this.right;
    const nx = this.pos.x + (f.x * this.speed + rt.x * this.lat) * dt;
    const nz = this.pos.z + (f.z * this.speed + rt.z * this.lat) * dt;
    // blocked by a step too high or water too deep?
    const ahead = groundAt(nx + f.x * 0.6 * Math.sign(this.speed), nz + f.z * 0.6 * Math.sign(this.speed));
    const tooHigh = ahead.y > this.pos.y + d.stepUp && ahead.y < this.pos.y + 3;
    const tooDeep = -groundAt(nx, nz).y > (d.kind === 'bike' ? 0.35 : d.kind === 'car' ? 0.45 : 0.55);
    const outOfBounds = nz < -336 || nz > 336 || nx < -60 || nx > X_SHORE + 30;
    if (tooHigh || tooDeep || outOfBounds) {
      this.speed *= -0.15;
      this.lat *= -0.2;
      this.bumped = 0.4;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    // collisions: a circle at each axle; cars get knocked, everything else bounces you off
    for (const s of [0.5, -0.5]) {
      const p = { x: this.pos.x + f.x * d.wheelbase * s, z: this.pos.z + f.z * d.wheelbase * s };
      const ox = p.x;
      const oz = p.z;
      this.contacts.length = 0;
      // the bike and the ATV skip their own parked colliders by tag; a car skips just its own collider
      if (collide(p, d.radius, this.pos.y + 0.2, this.pos.y + 1.4, d.kind === 'car' ? undefined : d.kind, this.contacts, this.col)) {
        this.pos.x += p.x - ox;
        this.pos.z += p.z - oz;
        for (const ct of this.contacts) this.hit(ct, p.x, p.z);
      }
    }
    this.odo += this.speed * dt;
    this.place(dt);
  }

  /** A contact at the circle (cx, cz): a car takes an impulse and pushes back; a wall only pushes back. */
  private hit(ct: Contact, cx: number, cz: number): void {
    const d = this.def;
    const px = cx - ct.nx * d.radius;
    const pz = cz - ct.nz * d.radius;
    const vA = this.velocity();
    const other = ct.c.knock ? (ct.c.knock() as Ride | null) : null;
    if (other && other !== this) {
      const vB = other.velocity();
      // closing speed along the line from us to them (they are on the far side of -n)
      const closing = (vA.x - vB.x) * -ct.nx + (vA.z - vB.z) * -ct.nz;
      if (closing <= 0) return;
      const j = (1.3 * closing) / (1 / this.mass + 1 / other.mass);
      other.addImpulse(-ct.nx * j, -ct.nz * j, px, pz);
      this.addImpulse(ct.nx * j, ct.nz * j, px, pz);
      this.impact = Math.max(this.impact, closing);
      other.impact = Math.max(other.impact, closing);
      if (closing > 0.8) Ride.onCrash?.(px, this.pos.y + 0.6, pz, closing, true);
      if (closing > 1.5) this.bumped = 0.4;
      return;
    }
    // a wall, a trunk, a post: bounce off with a little energy lost, and turn about the contact
    const vn = vA.x * ct.nx + vA.z * ct.nz;
    if (vn >= 0) return;
    const j = -1.2 * vn * this.mass;
    this.addImpulse(ct.nx * j, ct.nz * j, px, pz);
    this.impact = Math.max(this.impact, -vn);
    if (-vn > 1.5) {
      this.bumped = 0.4;
      Ride.onCrash?.(px, this.pos.y + 0.6, pz, -vn, false);
    }
  }

  /** Ground-follow and update the model's transform. */
  place(dt: number): void {
    const d = this.def;
    const f = this.forward;
    const side = new Vector3(f.z, 0, -f.x);
    const maxY = this.pos.y + d.stepUp + 0.05;
    const hf = this.groundY(this.pos.x + f.x * d.wheelbase * 0.5, this.pos.z + f.z * d.wheelbase * 0.5, maxY);
    const hr = this.groundY(this.pos.x - f.x * d.wheelbase * 0.5, this.pos.z - f.z * d.wheelbase * 0.5, maxY);
    const hl = this.groundY(this.pos.x + side.x * d.track * 0.5, this.pos.z + side.z * d.track * 0.5, maxY);
    const hrt = this.groundY(this.pos.x - side.x * d.track * 0.5, this.pos.z - side.z * d.track * 0.5, maxY);
    const y = (hf + hr) / 2;
    const k = dt > 0 ? Math.min(1, dt * 10) : 1;
    this.pos.y += (y - this.pos.y) * k;
    const pitch = Math.atan2(hf - hr, d.wheelbase);
    let roll = d.kind !== 'bike' ? Math.atan2(hl - hrt, d.track) : 0;
    if (d.kind === 'car') {
      // the body leans out of a turn a little
      const yawRate = (this.speed * Math.tan(this.steer)) / d.wheelbase;
      roll += Math.max(-0.05, Math.min(0.05, (this.speed * yawRate) / 9.81) * 0.04);
    }
    if (d.kind === 'bike') {
      // lean into the turn
      const yawRate = (this.speed * Math.tan(this.steer)) / d.wheelbase;
      roll = -Math.atan((this.speed * yawRate) / 9.81) * 0.9;
    }
    this.pitch += (pitch - this.pitch) * k;
    this.roll += (roll - this.roll) * k;
    this.root.position.copy(this.pos);
    this.root.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    for (const w of this.wheels) w.rotation.x = this.odo / d.wheelR;
    if (this.steerPart) {
      if (d.kind === 'atv') this.steerPart.rotation.y = this.steer * 0.9;
      else this.steerPart.rotation.y = this.steer;
    }
    for (const f of this.fronts) f.rotation.y = this.steer;
  }

  /** The rider's eye in world space. */
  eyeWorld(out = new Vector3()): Vector3 {
    this.root.updateMatrixWorld();
    return out.copy(this.def.eye).applyMatrix4(this.root.matrixWorld);
  }
}
