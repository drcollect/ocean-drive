// Three Miami Beach lifeguard towers along the sand, each its own design in bold colour blocks (teal,
// yellow, coral, mint): a cabin on a deck on pilings, a railing round the deck, a ramp of wooden stairs up
// the landward side, a flagpole with the day's flags. The cabins have open windows fore and aft, so from
// the sand you can see the sun through them. The stairs and deck are walkable.
import { Group, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry } from 'three';
import { GeoBuilder, type V3 } from '../core/builder';
import type { Ctx } from '../core/ctx';
import { buildAtvModel, type AtvModel } from '../vehicles/atvModel';
import { buildWall, frameFrom, newBuilders, wallBox, type Opening } from './facade';
import { terrainHeight } from './layout';
import { lin, materials } from './materials';
import { addAABB, addCircle, addHeightBox } from './registry';
import { WIND_GLSL } from './wind';

interface TowerSpec {
  x: number;
  z: number;
  wall: string;
  trim: string;
  roof: string;
  accent: string;
  roofKind: 'barrel' | 'peak' | 'flat';
  ports: boolean;
}

export const TOWERS: TowerSpec[] = [
  { x: 96, z: -118, wall: '#2fa7a2', trim: '#f4c63f', roof: '#f4c63f', accent: '#ef7f6a', roofKind: 'barrel', ports: false },
  { x: 97, z: 20, wall: '#9fe0c8', trim: '#ee7d6b', roof: '#ee7d6b', accent: '#f6f2e6', roofKind: 'peak', ports: true },
  { x: 95, z: 168, wall: '#f5d04e', trim: '#b38bd6', roof: '#ef8fae', accent: '#3fa9c9', roofKind: 'flat', ports: false },
];

const DECK_H = 2.05;
const DX = 2.1; // deck half size along x
const DZ = 1.85;

function flagMaterial(time: { value: number }): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: 2 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\n${WIND_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // uv.x: 0 at the pole → 1 at the fly
          float f = uv.x;
          vec3 w = windAt(position, uTime);
          float wave = sin(uTime * 7.0 - f * 7.0 + position.y * 2.0) * 0.09 * f + sin(uTime * 11.0 - f * 13.0) * 0.03 * f;
          transformed.z += wave;
          transformed.y -= f * f * 0.06 * (1.3 - length(w));
        }`,
      );
  };
  m.customProgramCacheKey = () => 'od-flag';
  return m;
}

function buildTower(t: TowerSpec, i: number, flags: GeoBuilder): { geos: Record<string, BufferGeometry>; } {
  const B = newBuilders();
  const g = terrainHeight(t.x, t.z);
  const deckY = g + DECK_H;
  const wall = lin(t.wall);
  const trim = lin(t.trim);
  const accent = lin(t.accent);
  const wood = lin('#9c7d5c');
  const P = (x: number, y: number, z: number) => new Vector3(t.x + x, y, t.z + z);
  const S = B.stucco; // painted wood panels share the stucco shader (weathering)
  const T = B.trim;
  // pilings
  T.setColor(lin('#d9d2c4'));
  for (const [px, pz] of [[-DX + 0.2, -DZ + 0.2], [DX - 0.2, -DZ + 0.2], [-DX + 0.2, DZ - 0.2], [DX - 0.2, DZ - 0.2], [0, -DZ + 0.2], [0, DZ - 0.2]]) {
    T.box(t.x + px - 0.11, g - 0.4, t.z + pz - 0.11, t.x + px + 0.11, deckY, t.z + pz + 0.11);
    addCircle(t.x + px, t.z + pz, 0.16, g - 0.4, deckY - 0.02, 'piling');
  }
  // cross bracing under the deck
  for (const pz of [-DZ + 0.2, DZ - 0.2]) {
    T.bar(P(-DX + 0.2, g + 0.2, pz), P(0, deckY - 0.25, pz), new Vector3(0, 0, 0.06), 0.08);
    T.bar(P(DX - 0.2, g + 0.2, pz), P(0, deckY - 0.25, pz), new Vector3(0, 0, 0.06), 0.08);
  }
  // deck, painted edge
  B.tiles.setColor(wood);
  B.tiles.box(t.x - DX, deckY - 0.18, t.z - DZ, t.x + DX, deckY, t.z + DZ);
  T.setColor(trim);
  T.box(t.x - DX - 0.03, deckY - 0.26, t.z - DZ - 0.03, t.x + DX + 0.03, deckY - 0.14, t.z + DZ + 0.03);
  // cabin walls with openings (no glass: open window frames, the sun comes straight through)
  const cx0 = t.x - 1.05;
  const cx1 = t.x + 1.35;
  const cz0 = t.z - 1.2;
  const cz1 = t.z + 1.2;
  const cy0 = deckY;
  const cy1 = deckY + 2.35;
  const walls: [Vector3, Vector3, Opening[]][] = [];
  const win = (u0: number, u1: number, v0: number, v1: number): Opening => ({ u0, u1, v0: cy0 + v0, v1: cy0 + v1, kind: 'win', type: 0, recess: 0.08, sill: false });
  const port = (u: number, v: number): Opening => ({ u0: u - 0.35, u1: u + 0.35, v0: cy0 + v - 0.35, v1: cy0 + v + 0.35, kind: 'port', type: 4 });
  // east (sea) face: a wide window
  walls.push([new Vector3(cx1, 0, cz1), new Vector3(cx1, 0, cz0), [win(0.3, 2.1, 0.95, 2.0)]]);
  // west face: door and a window lined up with the sea window (so the sun shows through)
  walls.push([new Vector3(cx0, 0, cz0), new Vector3(cx0, 0, cz1), [win(0.25, 1.2, 0.95, 1.95), { u0: 1.45, u1: 2.2, v0: cy0, v1: cy0 + 2.0, kind: 'door', type: 2, recess: 0.08 }]]);
  // north and south faces
  const side = (): Opening[] => (t.ports ? [port(0.8, 1.45), port(1.75, 1.45)] : [win(0.45, 2.0, 1.05, 1.9)]);
  walls.push([new Vector3(cx0, 0, cz1), new Vector3(cx1, 0, cz1), side()]);
  walls.push([new Vector3(cx1, 0, cz0), new Vector3(cx0, 0, cz0), side()]);
  S.setColor(wall);
  for (const [a, b, ops] of walls) {
    const f = frameFrom(a, b);
    buildWall(B, f, cy0, cy1, ops, true, trim, trim);
    // colour block band and corner trims
    T.setColor(accent);
    wallBox(T, f, -0.03, f.len + 0.03, cy0 + 0.55, cy0 + 0.75, 0, 0.04);
    T.setColor(trim);
    wallBox(T, f, -0.06, 0.06, cy0, cy1, 0, 0.05);
    for (const o of ops) {
      if (o.kind === 'port') continue;
      wallBox(T, f, o.u0 - 0.08, o.u1 + 0.08, o.v1, o.v1 + 0.08, 0, 0.05);
      wallBox(T, f, o.u0 - 0.08, o.u1 + 0.08, o.v0 - 0.08, o.v0, 0, 0.05);
      wallBox(T, f, o.u0 - 0.08, o.u0, o.v0, o.v1, 0, 0.05);
      wallBox(T, f, o.u1, o.u1 + 0.08, o.v0, o.v1, 0, 0.05);
    }
  }
  // cabin floor and ceiling (inside faces)
  S.setColor(lin('#e9e2d2'));
  S.box(cx0, cy1 - 0.05, cz0, cx1, cy1, cz1);
  // roofs
  T.setColor(lin(t.roof));
  if (t.roofKind === 'barrel') {
    const n = 10;
    for (let k = 0; k < n; k++) {
      const a0 = (Math.PI * k) / n;
      const a1 = (Math.PI * (k + 1)) / n;
      const r = 1.45;
      const p0 = new Vector3(t.x + 0.15 + Math.cos(a0) * r, cy1 + Math.sin(a0) * 0.65, 0);
      const p1 = new Vector3(t.x + 0.15 + Math.cos(a1) * r, cy1 + Math.sin(a1) * 0.65, 0);
      T.bar(p0.clone().setZ(t.z), p1.clone().setZ(t.z), new Vector3(Math.sin(a0 + 0.15), -Math.cos(a0 + 0.15), 0).multiplyScalar(-0.07), 2.9);
    }
  } else if (t.roofKind === 'peak') {
    const r0 = new Vector3(t.x - 1.35, cy1, t.z);
    const r1 = new Vector3(t.x + 1.65, cy1, t.z);
    for (const s of [-1, 1]) {
      const eave = s * 1.55;
      T.quad(
        s > 0 ? r0.clone().setZ(t.z + eave) : r1.clone().setZ(t.z + eave),
        s > 0 ? r1.clone().setZ(t.z + eave) : r0.clone().setZ(t.z + eave),
        s > 0 ? r1.clone().setY(cy1 + 0.95) : r0.clone().setY(cy1 + 0.95),
        s > 0 ? r0.clone().setY(cy1 + 0.95) : r1.clone().setY(cy1 + 0.95),
      );
    }
    S.setColor(wall);
    for (const x of [cx0, cx1]) {
      const f = x === cx0 ? -1 : 1;
      S.tri(new Vector3(x, cy1, t.z - 1.2 * f), new Vector3(x, cy1, t.z + 1.2 * f), new Vector3(x, cy1 + 0.95 * (1.2 / 1.55), t.z));
    }
  } else {
    T.box(t.x - 1.45, cy1, t.z - 1.6, t.x + 1.75, cy1 + 0.22, t.z + 1.6);
    T.setColor(accent);
    T.box(t.x - 1.47, cy1 + 0.22, t.z - 1.62, t.x + 1.77, cy1 + 0.3, t.z + 1.62);
    // a sunshade fin over the sea window
    T.setColor(lin(t.roof));
    T.box(cx1, cy1 - 0.3, t.z - 1.2, cx1 + 0.55, cy1 - 0.2, t.z + 1.2);
  }
  // deck railing: posts, top and mid rails (gap on the west side for the stairs)
  B.metal.setColor(lin(t.trim));
  const rail = (a: Vector3, b: Vector3) => {
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / 1.0));
    for (let k = 0; k <= n; k++) {
      const p = a.clone().lerp(b, k / n);
      B.metal.box(p.x - 0.04, deckY, p.z - 0.04, p.x + 0.04, deckY + 1.05, p.z + 0.04);
    }
    for (const y of [deckY + 0.5, deckY + 1.02]) B.metal.bar(a.clone().setY(y), b.clone().setY(y), new Vector3(0, 0.06, 0), 0.06);
  };
  rail(P(-DX + 0.05, 0, -DZ + 0.05), P(DX - 0.05, 0, -DZ + 0.05));
  rail(P(DX - 0.05, 0, -DZ + 0.05), P(DX - 0.05, 0, DZ - 0.05));
  rail(P(DX - 0.05, 0, DZ - 0.05), P(-DX + 0.05, 0, DZ - 0.05));
  rail(P(-DX + 0.05, 0, DZ - 0.05), P(-DX + 0.05, 0, 0.55));
  rail(P(-DX + 0.05, 0, -0.55), P(-DX + 0.05, 0, -DZ + 0.05));
  // stairs up the landward side
  const steps = 11;
  const rise = DECK_H / steps;
  const run = 0.34;
  const sx1 = t.x - DX;
  const sx0 = sx1 - steps * run;
  B.tiles.setColor(wood);
  for (let k = 0; k < steps; k++) {
    const top = g + rise * (k + 1);
    B.tiles.box(sx0 + k * run, top - 0.05, t.z - 0.5, sx0 + (k + 1) * run + 0.02, top, t.z + 0.5);
  }
  T.setColor(lin(t.accent));
  for (const s of [-1, 1]) {
    T.bar(new Vector3(sx0, g, t.z + s * 0.55), new Vector3(sx1, deckY, t.z + s * 0.55), new Vector3(0, 0.22, 0), 0.06); // stringer
    B.metal.bar(new Vector3(sx0 + 0.1, g + 0.95, t.z + s * 0.58), new Vector3(sx1, deckY + 1.0, t.z + s * 0.58), new Vector3(0, 0.05, 0), 0.05); // handrail
    B.metal.box(sx0 + 0.06, g, t.z + s * 0.58 - 0.035, sx0 + 0.13, g + 0.98, t.z + s * 0.58 + 0.035);
  }
  // flagpole and flags on the deck's sea corner
  const pole = P(DX - 0.2, 0, DZ - 0.2);
  B.metal.setColor([0.9, 0.9, 0.88]);
  B.metal.cylinder(pole.clone().setY(deckY), pole.clone().setY(deckY + 5.2), 0.04, 0.03, 8);
  const flagCols: V3[] = i === 1 ? [lin('#f2cf2b'), lin('#7a3fa0')] : [lin('#f2cf2b')];
  flagCols.forEach((c, k) => {
    flags.setColor(c);
    const y1 = deckY + 5.1 - k * 0.85;
    const y0 = y1 - 0.62;
    const nx = 8;
    for (let a = 0; a < nx; a++) {
      const u0 = a / nx;
      const u1 = (a + 1) / nx;
      const p0 = pole.clone().setY(0).add(new Vector3(-u0 * 0.95, 0, 0));
      const p1 = pole.clone().setY(0).add(new Vector3(-u1 * 0.95, 0, 0));
      flags.quad(p0.clone().setY(y0), p1.clone().setY(y0), p1.clone().setY(y1), p0.clone().setY(y1), [u0, 0, u1, 1]);
    }
  });

  // walkable: stairs (stepped ramp) and deck; the deck is solid below
  addHeightBox({ x0: sx0, x1: sx1, z0: t.z - 0.52, z1: t.z + 0.52, y: g, ramp: { axis: 'x', rise: DECK_H, step: rise }, surface: 'wood' });
  addHeightBox({ x0: t.x - DX, x1: t.x + DX, z0: t.z - DZ, z1: t.z + DZ, y: deckY, surface: 'wood' });
  addAABB(t.x - DX, t.z - DZ, t.x + DX, t.z + DZ, g - 1, deckY - 0.05, 'tower');
  // cabin walls (with the door gap on the west side)
  addAABB(cx1 - 0.1, cz0, cx1, cz1, deckY, cy1, 'cabin');
  addAABB(cx0, cz0, cx1, cz0 + 0.1, deckY, cy1, 'cabin');
  addAABB(cx0, cz1 - 0.1, cx1, cz1, deckY, cy1, 'cabin');
  addAABB(cx0, cz0, cx0 + 0.1, t.z + 0.2, deckY, cy1, 'cabin');
  // railing
  addAABB(t.x - DX, t.z - DZ, t.x + DX, t.z - DZ + 0.1, deckY, deckY + 1.05, 'rail');
  addAABB(t.x - DX, t.z + DZ - 0.1, t.x + DX, t.z + DZ, deckY, deckY + 1.05, 'rail');
  addAABB(t.x + DX - 0.1, t.z - DZ, t.x + DX, t.z + DZ, deckY, deckY + 1.05, 'rail');
  addAABB(t.x - DX, t.z + 0.55, t.x - DX + 0.1, t.z + DZ, deckY, deckY + 1.05, 'rail');
  addAABB(t.x - DX, t.z - DZ, t.x - DX + 0.1, t.z - 0.55, deckY, deckY + 1.05, 'rail');
  // stair sides
  addAABB(sx0, t.z + 0.52, sx1, t.z + 0.62, g, deckY + 1.0, 'rail');
  addAABB(sx0, t.z - 0.62, sx1, t.z - 0.52, g, deckY + 1.0, 'rail');

  const geos: Record<string, BufferGeometry> = {};
  for (const k of ['stucco', 'trim', 'metal', 'tiles'] as const) if (B[k].count) geos[k] = B[k].build();
  return { geos };
}

export interface Towers {
  group: Group;
  atv: AtvModel;
  atvHome: { x: number; z: number; yaw: number };
  update(t: number): void;
}

export function buildTowers(ctx: Ctx): Towers {
  void ctx;
  const lib = materials();
  const group = new Group();
  group.name = 'towers';
  const flags = new GeoBuilder();
  const time = { value: 0 };
  TOWERS.forEach((t, i) => {
    const { geos } = buildTower(t, i, flags);
    const map: Record<string, MeshStandardMaterial> = { stucco: lib.trim, trim: lib.trim, metal: lib.metal, tiles: lib.tiles };
    for (const [k, g] of Object.entries(geos)) {
      const m = new Mesh(g, map[k]);
      m.castShadow = m.receiveShadow = true;
      m.name = `tower${i}-${k}`;
      group.add(m);
    }
  });
  const fm = new Mesh(flags.build(), flagMaterial(time));
  fm.castShadow = true;
  group.add(fm);
  // the red ATV parked beside the first tower, and a can
  const atv = buildAtvModel();
  const home = { x: 90.6, z: -121.8, yaw: Math.PI + 0.45 }; // nose away from the stairs, up the beach
  atv.root.position.set(home.x, terrainHeight(home.x, home.z), home.z);
  atv.root.rotation.y = home.yaw;
  group.add(atv.root);
  return {
    group,
    atv,
    atvHome: home,
    update(t: number) {
      time.value = t;
    },
  };
}
