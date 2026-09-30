// You: a first-person walker with a pair of bare feet under the camera. Walks (Shift faster, Space to
// jump), steps up curbs, terraces and tower stairs, slides along walls, trunks, cars and railings, wades
// into the shallows up to the knees. The walk changes with the ground: a soft, slower, sinking gait in dry
// sand, a firm one on wet sand, splashing in the swash. E gets on the beach cruiser or the ATV nearby, or into
// any car you stand next to (a chase camera follows it; C puts you in the driver's seat).
import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { GeoBuilder } from '../core/builder';
import type { Ride, RideControls } from '../vehicles/ride';
import { carDistance, type Driving } from '../vehicles/drive';
import type { Surface } from '../world/layout';
import { lin } from '../world/materials';
import { collide, groundAt } from '../world/registry';
import { swashAt, X_SHORE, type SwashState } from '../world/surf';
import type { Input } from './input';

export type StepSurface = Surface | 'splash';

export interface StepEvent {
  surface: StepSurface;
  pos: Vector3;
  strength: number;
}

const EYE = 1.64;
const RADIUS = 0.28;
const STEP_UP = 0.45;

function feetModel(): { root: Group; l: Group; r: Group } {
  const root = new Group();
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const mk = () => {
    const b = new GeoBuilder();
    b.setColor(lin('#d9a784'));
    // foot, toes and a bit of ankle and shin
    b.box(-0.045, 0.0, -0.08, 0.045, 0.06, 0.12);
    b.box(-0.042, 0.0, 0.12, 0.042, 0.035, 0.17);
    b.cylinder(new Vector3(0, 0.04, -0.05), new Vector3(0, 0.45, -0.07), 0.042, 0.05, 8);
    b.setColor(lin('#6f7f6a'));
    b.cylinder(new Vector3(0, 0.45, -0.07), new Vector3(0, 0.62, -0.08), 0.075, 0.085, 8); // shorts hem
    const g = new Group();
    const m = new Mesh(b.build(), mat);
    m.castShadow = false; // the shadow-only body casts yours
    m.receiveShadow = true;
    g.add(m);
    root.add(g);
    return g;
  };
  return { root, l: mk(), r: mk() };
}

/** Something E acts on when you stand within `radius` of it. */
export interface Interactable {
  pos: Vector3;
  radius: number;
  /** the prompt ("E  …"), or null for none right now */
  label(): string | null;
  act(): void;
}

export class Player {
  readonly feet = new Vector3();
  readonly vel = new Vector3();
  yaw = 0;
  pitch = 0;
  onGround = true;
  surface: StepSurface = 'pavement';
  waterDepth = 0;
  riding: Ride | null = null;
  /** yaw of the head relative to the vehicle while riding */
  headYaw = 0;
  readonly steps: StepEvent[] = [];
  readonly feetMesh = feetModel();
  private bob = 0;
  private lastStepHalf = 0;
  private landed = 0;
  private sw: SwashState = { depth: 0, edgeX: X_SHORE, flow: 0, highX: X_SHORE };
  speed = 0;
  /** prompt text the UI shows ("E to ride") */
  prompt = '';
  /** things E does something with when you stand near them (the rides come first) */
  interactables: Interactable[] = [];
  /** M was pressed this frame */
  muteRequested = false;
  /** the cars you can get into */
  drive: Driving | null = null;
  /** driving: behind the car, or in the driver's seat */
  carView: 'chase' | 'seat' = 'chase';
  /** drive from code instead of the keys (the trailer's autopilot) */
  pilot: ((r: Ride, t: number) => RideControls) | null = null;
  private chase = new Vector3();
  private chaseSet = false;
  private lastDt = 1 / 60;

  constructor(private camera: PerspectiveCamera, private rides: Ride[]) {}

  /** Place the walker (feet on the ground) facing yaw. */
  teleport(x: number, z: number, yaw: number, pitch = 0): void {
    this.riding = null;
    this.feet.set(x, groundAt(x, z, 1e9).y, z);
    const g = groundAt(x, z, this.feet.y + 0.1);
    this.feet.y = g.y;
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
  }

  mount(r: Ride): void {
    this.riding = r;
    this.headYaw = 0;
    this.pitch = r.def.kind === 'bike' ? -0.24 : r.def.kind === 'car' ? -0.06 : -0.2;
    this.chaseSet = false;
    if (r.def.kind === 'car') this.drive?.entered(r);
  }

  private dismount(): void {
    const r = this.riding!;
    this.riding = null;
    const side = new Vector3(-Math.cos(r.yaw), 0, Math.sin(r.yaw)); // the vehicle's right
    const car = r.def.kind === 'car';
    // out of a car on the driver's side (its left) first, clear of the door
    const out = car ? (r.def.dims?.w ?? 1.9) / 2 + 0.55 : 1.1;
    for (const s of car ? [-1, 1] : [1, -1]) {
      const p = { x: r.pos.x + side.x * s * out, z: r.pos.z + side.z * s * out };
      const q = { ...p };
      if (!collide(q, RADIUS, r.pos.y + 0.2, r.pos.y + 1.7) || s < 0) {
        this.feet.set(q.x, groundAt(q.x, q.z, r.pos.y + 0.6).y, q.z);
        break;
      }
    }
    this.yaw = r.yaw;
    r.speed = 0;
    if (car) this.drive?.left(r);
  }

  update(dt: number, t: number, input: Input): void {
    input.poll();
    const one = input.consume();
    this.muteRequested = one.mute;
    this.steps.length = 0;
    this.prompt = '';
    // look
    if (this.riding) {
      this.headYaw -= one.lookX * 0.6;
      this.headYaw *= Math.pow(0.1, dt); // eyes drift back to the road
    } else {
      this.yaw += one.lookX;
    }
    this.pitch = Math.max(-1.45, Math.min(1.35, this.pitch - one.lookY));

    // ride / dismount, get into a car, or use what you stand at
    this.lastDt = dt;
    const nearRide = !this.riding ? this.nearestRide() : null;
    const car = !this.riding && !nearRide && this.drive ? this.drive.nearest(this.feet.x, this.feet.y, this.feet.z) : null;
    const use = !this.riding && !nearRide && !car ? this.nearestInteractable() : null;
    if (one.ride) {
      if (this.riding) this.dismount();
      else if (nearRide) this.mount(nearRide);
      else if (car) {
        const r = this.drive!.take(car);
        if (r) this.mount(r);
      } else use?.act();
    }
    if (this.riding) {
      const r = this.riding;
      const isCar = r.def.kind === 'car';
      if (isCar && input.took('KeyC')) {
        this.carView = this.carView === 'chase' ? 'seat' : 'chase';
        this.chaseSet = false;
      }
      // the mouse steers a bike or the ATV; in a car it looks around
      const steerMouse = isCar ? 0 : Math.max(-1, Math.min(1, -one.lookX * 12));
      const throttle = input.s.moveZ * (isCar || (input.s.fast && r.def.kind === 'atv') ? 1 : 0.85);
      r.update(dt, t, this.pilot?.(r, t) ?? { throttle, steer: Math.max(-1, Math.min(1, -input.s.moveX + steerMouse)) });
      this.feet.copy(r.pos);
      this.surface = r.surface;
      this.speed = Math.abs(r.speed);
      if (isCar) this.prompt = `${Math.round(Math.abs(r.speed) * 3.6)} km/h    E  get out  ·  C  ${this.carView === 'chase' ? "driver's seat" : 'view from behind'}`;
      this.placeCamera(t);
      this.feetMesh.root.visible = false;
      return;
    }
    if (nearRide) this.prompt = nearRide.def.kind === 'car' ? `E  drive ${nearRide.def.label ?? 'the car'}` : `E  ride the ${nearRide.def.kind === 'bike' ? 'bike' : 'ATV'}`;
    else if (car) this.prompt = `E  drive ${car.label}`;
    else if (use) {
      const label = use.label();
      if (label) this.prompt = label;
    }

    // ground and water under the feet
    const g = groundAt(this.feet.x, this.feet.z, this.feet.y + STEP_UP);
    let surf: StepSurface = g.surface;
    this.waterDepth = 0;
    if (this.feet.x > X_SHORE - 16) {
      swashAt(this.feet.x, this.feet.z, t, this.sw);
      const sea = Math.max(0, -g.y + 0.04 * Math.sin(t * 1.3 + this.feet.x * 0.3));
      this.waterDepth = Math.max(this.sw.depth, sea);
      if (this.waterDepth > 0.02) surf = 'splash';
      else if (g.surface === 'sand' && this.feet.x > this.sw.highX - 1.5) surf = 'wetsand';
    }
    this.surface = surf;

    // walking
    const fast = input.s.fast;
    let top = fast ? 3.4 : 1.5;
    const k = surf === 'sand' ? 0.82 : surf === 'wetsand' ? 0.95 : surf === 'splash' ? Math.max(0.4, 0.95 - this.waterDepth * 1.2) : surf === 'grass' ? 0.97 : 1;
    top *= k;
    const f = new Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const want = f.multiplyScalar(input.s.moveZ * top).addScaledVector(r, input.s.moveX * top);
    const acc = this.onGround ? (surf === 'sand' ? 7 : 11) : 2;
    const dv = want.sub(new Vector3(this.vel.x, 0, this.vel.z));
    const dl = dv.length();
    if (dl > acc * dt) dv.multiplyScalar((acc * dt) / dl);
    this.vel.x += dv.x;
    this.vel.z += dv.z;
    // jump
    if (one.jump && this.onGround) {
      this.vel.y = surf === 'sand' ? 3.7 : surf === 'splash' ? 3.2 : 4.2;
      this.onGround = false;
    }
    this.vel.y -= 9.81 * dt;
    // horizontal move with collisions; high ground ahead (a terrace, a deck) is a wall
    const nx = this.feet.x + this.vel.x * dt;
    const nz = this.feet.z + this.vel.z * dt;
    const hi = groundAt(nx, nz);
    const blocked = hi.y > this.feet.y + STEP_UP && hi.y < this.feet.y + 2.2;
    const deep = -groundAt(nx, nz).y > 0.8;
    if (!blocked && !deep && nz > -337 && nz < 337 && nx > -62 && nx < X_SHORE + 30) {
      this.feet.x = nx;
      this.feet.z = nz;
    } else {
      this.vel.x *= 0.2;
      this.vel.z *= 0.2;
    }
    const p = { x: this.feet.x, z: this.feet.z };
    collide(p, RADIUS, this.feet.y + 0.25, this.feet.y + 1.75);
    // parked rides are solid too
    for (const rd of this.rides) {
      const d = Math.hypot(p.x - rd.pos.x, p.z - rd.pos.z);
      const m = rd.def.kind === 'atv' ? 1.0 : 0.6;
      if (d < m && d > 1e-4) {
        p.x = rd.pos.x + ((p.x - rd.pos.x) / d) * m;
        p.z = rd.pos.z + ((p.z - rd.pos.z) / d) * m;
      }
    }
    this.feet.x = p.x;
    this.feet.z = p.z;
    // vertical
    const floor = groundAt(this.feet.x, this.feet.z, this.feet.y + STEP_UP).y;
    this.feet.y += this.vel.y * dt;
    if (this.feet.y <= floor) {
      if (!this.onGround && this.vel.y < -2.5) {
        this.steps.push({ surface: this.surface, pos: this.feet.clone(), strength: Math.min(1.5, -this.vel.y / 4) });
        this.landed = 0.25;
      }
      // step up smoothly
      this.feet.y = floor - this.feet.y > 0.05 ? this.feet.y + (floor - this.feet.y) * Math.min(1, dt * 18) : floor;
      if (this.feet.y < floor - 0.12) this.feet.y = floor - 0.12;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.feet.y - floor > 0.05) {
      this.onGround = false;
    }
    // gait: bob and footsteps
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && this.speed > 0.2) {
      const stride = fast ? 1.55 : 1.3;
      this.bob += (this.speed / stride) * Math.PI * dt;
      const half = Math.floor(this.bob / Math.PI);
      if (half !== this.lastStepHalf) {
        this.lastStepHalf = half;
        this.steps.push({ surface: this.surface, pos: this.feet.clone(), strength: Math.min(1.3, 0.55 + this.speed * 0.18) });
      }
    }
    this.landed = Math.max(0, this.landed - dt);
    this.placeCamera(t);
  }

  private nearestInteractable(): Interactable | null {
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of this.interactables) {
      const d = Math.hypot(it.pos.x - this.feet.x, it.pos.z - this.feet.z);
      if (d < it.radius && d < bd && Math.abs(it.pos.y - this.feet.y) < 1.5) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  private nearestRide(): Ride | null {
    let best: Ride | null = null;
    let bd = 2.4;
    for (const r of this.rides) {
      const dims = r.def.dims;
      // a car: from anywhere around it; a bike or the ATV: near its middle
      const d = dims ? carDistance(this.feet.x, this.feet.z, r.pos.x, r.pos.z, r.yaw, dims.l, dims.w) + 1.3 : Math.hypot(r.pos.x - this.feet.x, r.pos.z - this.feet.z);
      if (d < bd && Math.abs(r.pos.y - this.feet.y) < 1.2) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  private placeCamera(t: number): void {
    const cam = this.camera;
    // a wider view while riding, so the bars, basket or rack sit in the bottom of the frame
    const fov = this.riding ? 68 : 52;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * (this.riding && cam.fov < 53 ? 1 : 0.15);
      cam.updateProjectionMatrix();
    }
    if (this.riding && this.riding.def.kind === 'car' && this.carView === 'chase') {
      // behind the car, a little above, easing after it; the mouse swings round it and tilts
      const r = this.riding;
      const l = r.def.dims?.l ?? 4.6;
      const orbit = r.yaw + this.headYaw * 2.2;
      const dist = l * 0.5 + 4.4 + Math.min(2.5, Math.abs(r.speed) * 0.07);
      const height = Math.max(0.5, Math.min(4.5, 1.5 - this.pitch * 3));
      const target = new Vector3(r.pos.x, r.pos.y + 1.0, r.pos.z);
      const want = new Vector3(target.x - Math.sin(orbit) * dist, target.y + height, target.z - Math.cos(orbit) * dist);
      want.y = Math.max(want.y, groundAt(want.x, want.z, want.y + 3).y + 0.5);
      if (!this.chaseSet) {
        this.chase.copy(want);
        this.chaseSet = true;
      }
      this.chase.lerp(want, 1 - Math.exp(-this.lastDt * 6));
      cam.position.copy(this.chase);
      // a knock shakes the view
      const shake = Math.min(0.35, r.impact * 0.03);
      if (shake > 0.004) cam.position.add(new Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
      cam.lookAt(target.x + Math.sin(r.yaw) * 2.2, target.y + 0.2, target.z + Math.cos(r.yaw) * 2.2);
      return;
    }
    if (this.riding) {
      const r = this.riding;
      r.eyeWorld(cam.position);
      // a little road buzz on the ATV, a gentle sway on the bike
      if (r.def.kind === 'atv') cam.position.y += Math.sin(t * 31) * 0.004 * Math.min(1, Math.abs(r.speed) / 6);
      const shake = Math.min(0.12, r.impact * 0.012);
      if (shake > 0.002) cam.position.add(new Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
      cam.rotation.set(this.pitch + r.pitch * 0.6, r.yaw + Math.PI + this.headYaw, -r.roll * 0.5, 'YXZ');
      return;
    }
    const soft = this.surface === 'sand' ? 0.6 : 1;
    const amp = (0.022 + 0.02 * Math.min(1, this.speed / 3)) * soft * Math.min(1, this.speed / 1.2);
    const bobY = Math.abs(Math.sin(this.bob)) * amp * 1.6 - amp * 0.8 - this.landed * 0.25;
    const sway = Math.sin(this.bob) * amp * 0.4;
    const sink = this.surface === 'sand' ? 0.015 : this.surface === 'splash' ? 0.02 : 0;
    cam.position.set(this.feet.x + Math.cos(this.yaw) * sway, this.feet.y + EYE + bobY - sink, this.feet.z + Math.sin(this.yaw) * sway);
    cam.rotation.set(this.pitch, -this.yaw, 0, 'YXZ');
    // the feet: a step apart, swinging with the gait
    const fm = this.feetMesh;
    fm.root.visible = true;
    fm.root.position.set(this.feet.x, this.feet.y - sink, this.feet.z);
    fm.root.rotation.y = -this.yaw + Math.PI;
    const swing = Math.sin(this.bob) * Math.min(1, this.speed / 1.5) * 0.28;
    fm.l.position.set(-0.12, Math.max(0, Math.sin(this.bob)) * 0.06 * Math.min(1, this.speed), -swing);
    fm.r.position.set(0.12, Math.max(0, -Math.sin(this.bob)) * 0.06 * Math.min(1, this.speed), swing);
  }
}
