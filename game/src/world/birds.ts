// Morning birds, a few of each: brown pelicans gliding in a line low over the water, laughing gulls on the
// sand that take off when you walk at them, sanderlings running with the swash edge (the same swash the
// ocean draws), boat-tailed grackles on the café terraces, one frigatebird hanging high up, a couple of
// cormorants over the water, and distant specks.
import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GeoBuilder, type V3 } from '../core/builder';
import { Rng } from '../core/rng';
import { terrainHeight, X } from './layout';
import { lin } from './materials';
import { swashAt, X_SHORE } from './surf';

const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: 2, name: 'birds' });

interface BirdKit {
  root: Group;
  wingL: Group;
  wingR: Group;
  legs?: Group;
}

/** A bird facing +z: body, head, bill, tail and two wings hinged at the shoulders. */
function bird(o: { len: number; span: number; body: string; belly: string; head: string; bill: string; wing: string; tip: string; billLen: number; tail: number; legs?: string; pouch?: boolean }): BirdKit {
  const root = new Group();
  const b = new GeoBuilder();
  const c = (h: string): V3 => lin(h);
  const L = o.len;
  b.setColor(c(o.body));
  b.cylinder(P(0, 0, -L * 0.45), P(0, 0.01, L * 0.2), L * 0.09, L * 0.14, 8);
  b.setColor(c(o.belly));
  b.cylinder(P(0, -L * 0.03, -L * 0.2), P(0, -L * 0.02, L * 0.18), L * 0.09, L * 0.1, 7);
  b.setColor(c(o.head));
  b.cylinder(P(0, L * 0.04, L * 0.2), P(0, L * 0.08, L * 0.36), L * 0.08, L * 0.07, 7);
  b.setColor(c(o.bill));
  b.cylinder(P(0, L * 0.07, L * 0.36), P(0, L * 0.05, L * 0.36 + o.billLen), L * 0.025, L * 0.008, 5);
  if (o.pouch) {
    b.setColor(c('#6b5a44'));
    b.cylinder(P(0, L * 0.03, L * 0.38), P(0, L * 0.04, L * 0.36 + o.billLen * 0.85), L * 0.035, L * 0.01, 5);
  }
  b.setColor(c(o.body));
  // tail fan
  b.tri(P(0, 0, -L * 0.4), P(-L * 0.08 * o.tail, 0.0, -L * (0.45 + 0.25 * o.tail)), P(L * 0.08 * o.tail, 0.0, -L * (0.45 + 0.25 * o.tail)));
  const body = new Mesh(b.build(), mat);
  body.castShadow = true;
  root.add(body);
  const wing = (s: number) => {
    const g = new Group();
    g.position.set(s * L * 0.08, L * 0.03, L * 0.02);
    const w = new GeoBuilder();
    const half = o.span / 2;
    w.setColor(c(o.wing));
    // broad inner panel raised a little at the wrist (the gull's 'M'), outer panel swept back to a point
    const wy = half * 0.08;
    w.quad(P(0, 0, L * 0.14), P(s * half * 0.48, wy, L * 0.08), P(s * half * 0.48, wy, -L * 0.3), P(0, 0, -L * 0.3));
    w.setColor(c(o.tip));
    w.quad(P(s * half * 0.48, wy, L * 0.08), P(s * half, 0, -L * 0.16), P(s * half * 0.93, 0, -L * 0.3), P(s * half * 0.48, wy, -L * 0.3));
    const m = new Mesh(w.build(), mat);
    m.castShadow = true;
    g.add(m);
    root.add(g);
    return g;
  };
  const kit: BirdKit = { root, wingL: wing(1), wingR: wing(-1) };
  if (o.legs) {
    const lg = new Group();
    const l = new GeoBuilder();
    l.setColor(c(o.legs));
    for (const s of [-1, 1]) l.cylinder(P(s * L * 0.03, -L * 0.05, 0), P(s * L * 0.035, -L * 0.28, L * 0.02), L * 0.012, L * 0.01, 4);
    const m = new Mesh(l.build(), mat);
    lg.add(m);
    root.add(lg);
    kit.legs = lg;
  }
  return kit;
}

function flap(k: BirdKit, ph: number, amp: number, fold = 0): void {
  const a = Math.sin(ph) * amp;
  k.wingL.rotation.z = a;
  k.wingR.rotation.z = -a;
  k.wingL.rotation.y = fold;
  k.wingR.rotation.y = -fold;
  k.wingL.scale.x = 1 - fold * 0.8;
  k.wingR.scale.x = 1 - fold * 0.8;
}

export interface BirdCall {
  pos: Vector3;
  kind: 'gull' | 'pelican' | 'grackle';
}

export interface Birds {
  group: Group;
  /** calls this frame (the audio module plays them where the bird is) */
  calls: BirdCall[];
  update(t: number, dt: number, player: Vector3, cafes: Vector3[]): void;
}

export function buildBirds(): Birds {
  const rng = new Rng(9090);
  const group = new Group();
  group.name = 'birds';
  const calls: BirdCall[] = [];

  // pelicans: a line of six gliding low over the swell
  const pelicans = Array.from({ length: 6 }, () => {
    const k = bird({ len: 1.25, span: 2.1, body: '#6e6358', belly: '#5f564d', head: '#e9dfc6', bill: '#c9a15c', wing: '#5d544b', tip: '#2d2925', billLen: 0.42, tail: 0.6, pouch: true });
    group.add(k.root);
    return k;
  });
  // gulls on the sand
  type Gull = { k: BirdKit; home: Vector3; pos: Vector3; state: 'stand' | 'fly'; vel: Vector3; t: number; peck: number; nextCall: number };
  const gulls: Gull[] = [];
  for (let i = 0; i < 9; i++) {
    const k = bird({ len: 0.4, span: 1.0, body: '#8e969b', belly: '#f2f2ef', head: '#f4f4f0', bill: '#9b1f22', wing: '#8a9398', tip: '#1d1d1d', billLen: 0.05, tail: 0.5, legs: '#3a2a26' });
    const group0 = i < 5 ? -40 : 85;
    const home = P(rng.range(104, 116), 0, group0 + rng.range(-6, 6));
    home.y = terrainHeight(home.x, home.z);
    group.add(k.root);
    gulls.push({ k, home, pos: home.clone(), state: 'stand', vel: new Vector3(), t: 0, peck: rng.range(0, 5), nextCall: rng.range(3, 20) });
  }
  // sanderlings chasing the swash edge
  type Sand = { k: BirdKit; z: number; x: number; ph: number; lag: number };
  const sanderlings: Sand[] = [];
  for (let i = 0; i < 11; i++) {
    const k = bird({ len: 0.19, span: 0.36, body: '#b9b2a6', belly: '#fbfaf6', head: '#c9c3b8', bill: '#141414', wing: '#9a948b', tip: '#2a2a2a', billLen: 0.025, tail: 0.3, legs: '#141414' });
    group.add(k.root);
    sanderlings.push({ k, z: 20 + rng.range(-5, 5), x: X_SHORE - 2, ph: rng.range(0, 6), lag: rng.range(0.1, 0.8) });
  }
  // grackles on the café terraces
  type Grackle = { k: BirdKit; home: Vector3; pos: Vector3; hop: number; dir: number };
  const grackles: Grackle[] = [];
  for (let i = 0; i < 4; i++) {
    const k = bird({ len: 0.36, span: 0.55, body: '#141218', belly: '#1c1a22', head: '#15131a', bill: '#0e0e0e', wing: '#18161d', tip: '#101014', billLen: 0.05, tail: 1.6, legs: '#1a1a1a' });
    group.add(k.root);
    grackles.push({ k, home: new Vector3(), pos: new Vector3(), hop: rng.range(0, 3), dir: rng.range(0, 6.3) });
  }
  // frigatebird: high, still, circling
  const frig = bird({ len: 1.0, span: 2.2, body: '#16151a', belly: '#1c1b21', head: '#16151a', bill: '#6d6d6d', wing: '#18171c', tip: '#111015', billLen: 0.12, tail: 1.8 });
  group.add(frig.root);
  // cormorants low over the water
  const cormorants = Array.from({ length: 3 }, () => {
    const k = bird({ len: 0.8, span: 1.25, body: '#1c1d1b', belly: '#262622', head: '#1c1d1b', bill: '#c4a25a', wing: '#1f201d', tip: '#161614', billLen: 0.08, tail: 0.8 });
    group.add(k.root);
    return k;
  });
  // distant specks
  const specks = Array.from({ length: 7 }, () => {
    const k = bird({ len: 0.4, span: 1.0, body: '#dcdcd8', belly: '#f0f0ec', head: '#ededea', bill: '#333', wing: '#d0d2d2', tip: '#333', billLen: 0.04, tail: 0.5 });
    k.root.scale.setScalar(1.3);
    group.add(k.root);
    return { k, x: rng.range(180, 420), z: rng.range(-400, 400), y: rng.range(8, 30), r: rng.range(20, 60), ph: rng.range(0, 6.3), sp: rng.range(0.05, 0.12) };
  });

  const sw = { depth: 0, edgeX: X_SHORE, flow: 0, highX: X_SHORE };
  let pelZ = -520;
  let pelDelay = 0;

  return {
    group,
    calls,
    update(t: number, dt: number, player: Vector3, cafes: Vector3[]) {
      calls.length = 0;
      // pelicans: pass along the beach every couple of minutes, gliding with a few beats now and then
      if (pelDelay > 0) {
        pelDelay -= dt;
      } else {
        pelZ += 8.5 * dt;
        if (pelZ > 560) {
          pelZ = -560;
          pelDelay = 40;
        }
      }
      pelicans.forEach((k, i) => {
        const z = pelZ - i * 5.2;
        const x = 152 + i * 1.6 + Math.sin(t * 0.3 + i) * 1.2;
        const y = 2.4 + Math.sin(z * 0.03 + i * 0.4) * 0.6 + i * 0.15;
        k.root.position.set(x, y, z);
        k.root.rotation.set(0, 0, Math.sin(t * 0.5 + i) * 0.04);
        k.root.visible = pelDelay <= 0;
        const beat = Math.sin(t * 0.35 + i * 0.25) > 0.75;
        flap(k, beat ? t * 6 + i * 0.4 : 0.15, beat ? 0.55 : 0.12);
      });
      // gulls
      for (const g of gulls) {
        const d = Math.hypot(player.x - g.pos.x, player.z - g.pos.z);
        if (g.state === 'stand') {
          g.peck -= dt;
          const peck = g.peck < 0 && g.peck > -0.5;
          if (g.peck < -0.5) g.peck = rng.range(1.5, 6);
          g.k.root.position.copy(g.pos);
          g.k.root.position.y += 0.1 * 0.4 + (peck ? -0.02 : 0);
          g.k.root.rotation.x = peck ? 0.45 : 0;
          flap(g.k, 0, 0, 1.2);
          g.nextCall -= dt;
          if (g.nextCall < 0) {
            g.nextCall = rng.range(8, 25);
            calls.push({ pos: g.pos.clone(), kind: 'gull' });
          }
          if (d < 7.5) {
            // take off away from you
            g.state = 'fly';
            g.t = 0;
            const away = g.pos.clone().sub(player).setY(0).normalize();
            g.vel.set(away.x * 6, 4.5, away.z * 6);
            calls.push({ pos: g.pos.clone(), kind: 'gull' });
          }
        } else {
          g.t += dt;
          // climb, sweep round over the water, come back down near home
          const back = g.home.clone().setY(g.home.y + 0.05).sub(g.pos);
          const steer = g.t > 5 ? back.multiplyScalar(0.25) : new Vector3(0.6, 0.3, 0);
          g.vel.add(steer.multiplyScalar(dt));
          if (g.pos.y > g.home.y + 9) g.vel.y -= 3 * dt;
          const sp = g.vel.length();
          if (sp > 9) g.vel.multiplyScalar(9 / sp);
          g.pos.addScaledVector(g.vel, dt);
          g.k.root.position.copy(g.pos);
          g.k.root.rotation.set(-g.vel.y * 0.05, Math.atan2(g.vel.x, g.vel.z), 0);
          flap(g.k, t * 11, 0.7);
          const ground = terrainHeight(g.pos.x, g.pos.z);
          if (g.t > 7 && Math.hypot(back.x, back.z) < 2.5 && Math.hypot(player.x - g.pos.x, player.z - g.pos.z) > 9) {
            g.state = 'stand';
            g.pos.y = ground;
          }
          if (g.pos.y < ground + 0.1) g.pos.y = ground + 0.1;
        }
      }
      // sanderlings: a little flock that follows the water's edge up and down the slope
      const s0 = sanderlings[0];
      swashAt(X_SHORE - 4, s0.z, t, sw);
      for (const s of sanderlings) {
        const edge = Math.min(sw.edgeX, X_SHORE + 0.5);
        // stay just above the running water: flee up when it comes, chase it down when it drains
        const target = edge - 0.6 - s.lag * 0.8;
        const dx = target - s.x;
        const run = Math.abs(dx) > 0.15;
        s.x += Math.sign(dx) * Math.min(Math.abs(dx), (sw.flow > 0 ? 3.2 : 2.1) * dt);
        const zz = s.z + Math.sin(t * 0.2 + s.ph) * 2.0;
        const y = terrainHeight(s.x, zz);
        s.k.root.position.set(s.x, y + 0.075, zz);
        s.k.root.rotation.set(run ? 0 : Math.max(0, Math.sin(t * 7 + s.ph)) * 0.6, dx > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        if (s.k.legs) s.k.legs.rotation.x = run ? Math.sin(t * 40 + s.ph) * 0.8 : 0;
        flap(s.k, 0, 0, 1.2);
        // scatter if you come close, then drift back
        const d = Math.hypot(player.x - s.x, player.z - zz);
        if (d < 4) s.z += Math.sign(zz - player.z || 1) * 6 * dt;
      }
      // grackles hopping on the terraces
      grackles.forEach((g, i) => {
        if (g.home.lengthSq() === 0 && cafes.length) {
          const c = cafes[(i * 7) % cafes.length];
          g.home.copy(c);
          g.pos.copy(c).add(P(0.6, 0, 0.4));
        }
        g.hop -= dt;
        if (g.hop < 0) {
          g.hop = rng.range(0.4, 2.2);
          g.dir += rng.range(-1.2, 1.2);
          const next = g.pos.clone().add(P(Math.sin(g.dir) * 0.35, 0, Math.cos(g.dir) * 0.35));
          if (next.distanceTo(g.home) < 2.5) g.pos.copy(next);
          if (rng.chance(0.15)) calls.push({ pos: g.pos.clone(), kind: 'grackle' });
        }
        const hopY = g.hop > 0 && g.hop < 0.15 ? Math.sin((g.hop / 0.15) * Math.PI) * 0.08 : 0;
        g.k.root.position.copy(g.pos).setY(g.home.y + 0.09 + hopY);
        g.k.root.rotation.set(0, g.dir, 0);
        flap(g.k, 0, 0, 1.2);
      });
      // frigatebird: slow circles, barely a wingbeat
      const fa = t * 0.035;
      frig.root.position.set(170 + Math.cos(fa) * 60, 58 + Math.sin(t * 0.07) * 4, -20 + Math.sin(fa) * 60);
      frig.root.rotation.set(0, fa + Math.PI, 0.35);
      flap(frig, 0.3, 0.05);
      // cormorants: low and fast over the water, one after another
      cormorants.forEach((k, i) => {
        const z = ((t * 11 + i * 9) % 1100) - 550;
        k.root.position.set(170 + i * 2, 1.4 + i * 0.2, -z);
        k.root.rotation.set(0, Math.PI, 0);
        flap(k, t * 9 + i, 0.45);
      });
      // specks far out
      for (const s of specks) {
        const a = t * s.sp + s.ph;
        s.k.root.position.set(s.x + Math.cos(a) * s.r, s.y, s.z + Math.sin(a) * s.r);
        s.k.root.rotation.set(0, a + Math.PI, 0.3);
        flap(s.k, t * 8 + s.ph, 0.5);
      }
    },
  };
}

void X;
