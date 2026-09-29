// A few early people, no crowd: a jogger on the promenade, someone walking the wet sand at the edge of the
// swash, a café worker setting out a terrace, and a cyclist on the path. Built from simple limbs on joints
// and animated procedurally (walk, run, pedal, work); they cast the same long shadows as everything else.
import { Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import { GeoBuilder, type V3 } from '../core/builder';
import { buildBikeModel } from '../vehicles/bikeModel';
import { promenadeE, promenadeW, PROMENADE_Y, terrainHeight, X, Z_MAX, Z_MIN } from './layout';
import { lin } from './materials';
import { swashAt, X_SHORE } from './surf';

const P = (x: number, y: number, z: number) => new Vector3(x, y, z);

interface Outfit {
  skin: string;
  top: string;
  bottom: string;
  shoes: string;
  hair: string;
  longSleeves?: boolean;
  shorts?: boolean;
  apron?: string;
  cap?: string;
}

export interface Body {
  root: Group;
  hips: Group;
  torso: Group;
  head: Group;
  thigh: [Group, Group];
  shin: [Group, Group];
  upper: [Group, Group];
  fore: [Group, Group];
}

const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, name: 'people' });

function part(parent: Object3D, b: GeoBuilder, at: Vector3): Group {
  const g = new Group();
  g.position.copy(at);
  const m = new Mesh(b.build(), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  parent.add(g);
  return g;
}

/** A person standing with feet at y = 0, facing +z. */
export function buildBody(o: Outfit, scale = 1): Body {
  const root = new Group();
  const c = (h: string): V3 => lin(h);
  const hips = new Group();
  hips.position.y = 0.94;
  root.add(hips);
  // pelvis
  const pel = new GeoBuilder();
  pel.setColor(c(o.bottom));
  pel.box(-0.16, -0.12, -0.1, 0.16, 0.06, 0.1);
  part(hips, pel, P(0, 0, 0));
  // torso (tapered)
  const tor = new GeoBuilder();
  tor.setColor(c(o.top));
  tor.cylinder(P(0, 0.04, 0), P(0, 0.32, 0), 0.15, 0.17, 8);
  tor.cylinder(P(0, 0.32, 0), P(0, 0.52, 0), 0.17, 0.14, 8);
  if (o.apron) {
    tor.setColor(c(o.apron));
    tor.box(-0.15, -0.3, 0.1, 0.15, 0.3, 0.14);
  }
  tor.setColor(c(o.skin));
  tor.cylinder(P(0, 0.52, 0), P(0, 0.6, 0), 0.05, 0.05, 6);
  const torso = part(hips, tor, P(0, 0.05, 0));
  // head with hair
  const hd = new GeoBuilder();
  hd.setColor(c(o.skin));
  hd.cylinder(P(0, 0, 0), P(0, 0.08, 0.005), 0.085, 0.1, 8);
  hd.cylinder(P(0, 0.08, 0.005), P(0, 0.2, 0), 0.1, 0.08, 8);
  hd.setColor(c(o.hair));
  hd.cylinder(P(0, 0.1, -0.012), P(0, 0.23, -0.015), 0.105, 0.07, 8);
  if (o.cap) {
    hd.setColor(c(o.cap));
    hd.cylinder(P(0, 0.16, 0), P(0, 0.24, 0), 0.105, 0.09, 8);
    hd.box(-0.07, 0.16, 0.06, 0.07, 0.175, 0.2);
  }
  const head = part(torso, hd, P(0, 0.6, 0));
  // limbs
  const limb = (len: number, r0: number, r1: number, col: string, col2?: string, split = 1) => {
    const b = new GeoBuilder();
    b.setColor(c(col));
    b.cylinder(P(0, 0, 0), P(0, -len * split, 0), r0, r0 + (r1 - r0) * split, 7);
    if (split < 1) {
      b.setColor(c(col2 ?? col));
      b.cylinder(P(0, -len * split, 0), P(0, -len, 0), r0 + (r1 - r0) * split, r1, 7);
    }
    return b;
  };
  const thigh: Group[] = [];
  const shin: Group[] = [];
  const upper: Group[] = [];
  const fore: Group[] = [];
  for (const s of [-1, 1]) {
    const th = part(hips, limb(0.44, 0.075, 0.058, o.bottom, o.skin, o.shorts ? 0.55 : 1), P(s * 0.09, -0.08, 0));
    const sh = new GeoBuilder();
    sh.setColor(c(o.shorts ? o.skin : o.bottom));
    sh.cylinder(P(0, 0, 0), P(0, -0.42, 0), 0.055, 0.04, 7);
    sh.setColor(c(o.shoes));
    sh.box(-0.05, -0.47, -0.06, 0.05, -0.41, 0.17);
    const sg = part(th, sh, P(0, -0.44, 0));
    thigh.push(th);
    shin.push(sg);
    const ua = part(torso, limb(0.29, 0.048, 0.04, o.longSleeves ? o.top : o.skin, o.skin, o.longSleeves ? 1 : 0.35), P(s * 0.2, 0.46, 0));
    const fa = new GeoBuilder();
    fa.setColor(c(o.longSleeves ? o.top : o.skin));
    fa.cylinder(P(0, 0, 0), P(0, -0.25, 0), 0.04, 0.032, 7);
    fa.setColor(c(o.skin));
    fa.box(-0.03, -0.33, -0.025, 0.03, -0.24, 0.035);
    const fg = part(ua, fa, P(0, -0.29, 0));
    upper.push(ua);
    fore.push(fg);
  }
  root.scale.setScalar(scale);
  return { root, hips, torso, head, thigh: thigh as [Group, Group], shin: shin as [Group, Group], upper: upper as [Group, Group], fore: fore as [Group, Group] };
}

/** Gait pose: phase in radians; run 0 (walk) … 1 (run). */
export function gait(b: Body, ph: number, run: number): void {
  const amp = 0.45 + 0.35 * run;
  for (let i = 0; i < 2; i++) {
    const p = ph + i * Math.PI;
    b.thigh[i].rotation.x = -Math.sin(p) * amp - run * 0.15;
    b.shin[i].rotation.x = Math.max(0, Math.sin(p - 1.2)) * (0.8 + 0.9 * run) + 0.05;
    b.upper[i].rotation.x = Math.sin(p) * (0.35 + 0.4 * run);
    b.upper[i].rotation.z = (i === 0 ? -1 : 1) * -0.08;
    b.fore[i].rotation.x = -0.3 - run * 1.1;
  }
  b.hips.position.y = 0.94 - (0.02 + 0.04 * run) * Math.abs(Math.cos(ph)) + run * 0.02;
  b.torso.rotation.x = run * 0.22;
  b.torso.rotation.y = Math.sin(ph) * 0.08;
}

export interface Person {
  id: string;
  root: Group;
  pos: Vector3;
  surface: 'pavement' | 'sand' | 'wetsand';
  /** step events for the footstep sounds */
  steps: number;
}

export interface People {
  group: Group;
  list: Person[];
  update(t: number, dt: number, player: Vector3): void;
}

export function buildPeople(musicSpot: Vector3): People {
  const group = new Group();
  group.name = 'people';
  const list: Person[] = [];

  // jogger on the promenade
  const jog = buildBody({ skin: '#8d5a3c', top: '#e8716b', bottom: '#1f2530', shoes: '#f2f2f2', hair: '#1b1512', shorts: true });
  group.add(jog.root);
  const jogger: Person = { id: 'jogger', root: jog.root, pos: new Vector3(), surface: 'pavement', steps: 0 };
  list.push(jogger);

  // walker on the wet sand
  const walk = buildBody({ skin: '#e2b996', top: '#f1f0ea', bottom: '#b6a27f', shoes: '#c79d7a', hair: '#6b4b2e', shorts: true, cap: '#2f5d86' });
  group.add(walk.root);
  const walker: Person = { id: 'walker', root: walk.root, pos: new Vector3(), surface: 'wetsand', steps: 0 };
  list.push(walker);

  // café worker
  const cafe = buildBody({ skin: '#c28b65', top: '#f5f4ef', bottom: '#222222', shoes: '#111111', hair: '#23180f', apron: '#26323f', longSleeves: true });
  group.add(cafe.root);
  const worker: Person = { id: 'worker', root: cafe.root, pos: musicSpot.clone(), surface: 'pavement', steps: 0 };
  list.push(worker);

  // cyclist on the promenade
  const cyc = buildBody({ skin: '#f0c8a6', top: '#7fb6d8', bottom: '#d9cbb0', shoes: '#ffffff', hair: '#c9a66b', shorts: true });
  const bike = buildBikeModel('#f2a7b6');
  const rider = new Group();
  rider.add(bike.root);
  cyc.root.position.set(0, 0, -0.22);
  rider.add(cyc.root);
  group.add(rider);
  const cyclist: Person = { id: 'cyclist', root: rider, pos: new Vector3(), surface: 'pavement', steps: 0 };
  list.push(cyclist);

  const sw = { depth: 0, edgeX: X_SHORE, flow: 0, highX: X_SHORE };
  // lap state
  let jz = -200;
  let jdir = 1;
  let wz = 60;
  let wdir = -1;
  let cz = 150;
  let cdir = -1;
  let workT = 0;
  const workPts = [0, 1, 2, 3].map((i) => musicSpot.clone().add(new Vector3(((i % 2) - 0.5) * 1.6, 0, (Math.floor(i / 2) - 0.5) * 3.0)));
  let workI = 0;
  const lastPhase: Record<string, number> = {};

  const face = (g: Group, dirZ: number, dirX = 0) => {
    g.rotation.y = Math.atan2(dirX, dirZ);
  };
  const stepCount = (p: Person, ph: number) => {
    const k = Math.floor(ph / Math.PI);
    if (lastPhase[p.id] !== undefined && k !== lastPhase[p.id]) p.steps++;
    lastPhase[p.id] = k;
  };

  return {
    group,
    list,
    update(t: number, dt: number, player: Vector3) {
      // jogger: laps of the promenade, 3.1 m/s
      jz += jdir * 3.1 * dt;
      if (jz > Z_MAX - 20) jdir = -1;
      if (jz < Z_MIN + 20) jdir = 1;
      const jx = (promenadeW(jz) + promenadeE(jz)) / 2 + jdir * 1.1;
      jog.root.position.set(jx, PROMENADE_Y, jz);
      face(jog.root, jdir);
      const jph = t * 9.2;
      gait(jog, jph, 1);
      jog.root.position.y += Math.abs(Math.sin(jph)) * 0.05;
      jogger.pos.copy(jog.root.position);
      stepCount(jogger, jph);

      // walker: along the wet sand, stepping up the beach when the swash comes in
      const near = Math.hypot(player.x - walk.root.position.x, player.z - walk.root.position.z) < 1.2;
      if (!near) wz += wdir * 1.25 * dt;
      if (wz > 240) wdir = -1;
      if (wz < -240) wdir = 1;
      swashAt(X_SHORE - 4, wz, t, sw);
      const targetX = Math.min(X_SHORE - 3.2, sw.edgeX - 0.8);
      const wx = walk.root.position.x ? walk.root.position.x + (targetX - walk.root.position.x) * Math.min(1, dt * 0.8) : targetX;
      walk.root.position.set(wx, terrainHeight(wx, wz), wz);
      face(walk.root, wdir, (targetX - wx) * 0.3);
      const wph = near ? 0 : t * 5.4;
      gait(walk, wph, 0);
      walker.pos.copy(walk.root.position);
      stepCount(walker, wph);

      // café worker: moves between tables, pauses to wipe
      workT -= dt;
      const target = workPts[workI];
      const d = target.clone().sub(cafe.root.position.clone().setY(target.y));
      if (cafe.root.position.lengthSq() === 0) cafe.root.position.copy(workPts[0]).setY(musicSpot.y - 1.2);
      if (d.length() > 0.15 && workT <= 0) {
        const stepv = d.normalize().multiplyScalar(Math.min(d.length(), 1.0 * dt));
        cafe.root.position.add(stepv);
        face(cafe.root, stepv.z, stepv.x);
        const cph = t * 5.2;
        gait(cafe, cph, 0);
        stepCount(worker, cph);
      } else {
        if (workT <= 0) {
          workT = 3 + (workI % 3);
          workI = (workI + 1) % workPts.length;
        }
        gait(cafe, 0, 0);
        // wiping: one arm sweeps over the table
        cafe.upper[1].rotation.x = -1.0 + Math.sin(t * 4) * 0.15;
        cafe.upper[1].rotation.z = 0.3 + Math.sin(t * 4) * 0.25;
        cafe.torso.rotation.x = 0.35;
      }
      cafe.root.position.y = musicSpot.y - 1.2;
      worker.pos.copy(cafe.root.position);

      // cyclist: along the promenade at 4.5 m/s, pedalling
      cz += cdir * 4.4 * dt;
      if (cz > Z_MAX - 20) cdir = -1;
      if (cz < Z_MIN + 20) cdir = 1;
      const cx = (promenadeW(cz) + promenadeE(cz)) / 2 - cdir * 1.2;
      rider.position.set(cx, PROMENADE_Y, cz);
      face(rider, cdir);
      const crank = t * 5.5;
      bike.cranks.rotation.x = crank;
      for (const w of bike.wheels) w.rotation.x = t * 13.3;
      // seated rider, feet on the pedals
      cyc.hips.position.set(0, 0.98, 0);
      cyc.torso.rotation.x = 0.35;
      for (let i = 0; i < 2; i++) {
        const a = crank + i * Math.PI;
        cyc.thigh[i].rotation.x = -1.05 + Math.sin(a) * 0.38;
        cyc.shin[i].rotation.x = 0.95 + Math.sin(a + 0.9) * 0.4;
        cyc.upper[i].rotation.x = -0.95;
        cyc.fore[i].rotation.x = -0.35;
      }
      cyclist.pos.copy(rider.position);
    },
  };
}

void X;
