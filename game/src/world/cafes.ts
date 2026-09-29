// Café furniture on the hotel terraces: white bistro tables, chairs and pink/blue/white umbrellas, all
// instanced (one draw call each), casting the same long shadows as everything else.
import { Color, InstancedMesh, Matrix4, Object3D, Quaternion, Vector3, type BufferGeometry, type Material } from 'three';
import { GeoBuilder } from '../core/builder';
import type { CafeSpot } from './hotels';
import { lin, materials } from './materials';
import { addCircle } from './registry';

function tableGeo(): BufferGeometry {
  const b = new GeoBuilder();
  b.setColor(lin('#f4f2ec'));
  const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
  b.cylinder(P(0, 0.71, 0), P(0, 0.745, 0), 0.34, 0.34, 18);
  b.cylinder(P(0, 0.02, 0), P(0, 0.71, 0), 0.032, 0.028, 8, false);
  b.cylinder(P(0, 0, 0), P(0, 0.03, 0), 0.24, 0.2, 12);
  return b.build();
}

function chairGeo(): BufferGeometry {
  const b = new GeoBuilder();
  b.setColor(lin('#f1efe8'));
  const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
  // seat
  b.box(-0.2, 0.44, -0.2, 0.2, 0.47, 0.2);
  // legs, splayed a little
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as [number, number][]) b.cylinder(P(x * 1.12, 0, z * 1.12), P(x, 0.45, z), 0.014, 0.014, 4, false);
  // back: two uprights and two curved slats
  for (const x of [-0.18, 0.18]) b.cylinder(P(x, 0.45, 0.19), P(x * 1.05, 0.9, 0.24), 0.014, 0.014, 4, false);
  for (const y of [0.66, 0.84]) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const a0 = -0.9 + (1.8 * i) / n;
      const a1 = -0.9 + (1.8 * (i + 1)) / n;
      const p0 = P(Math.sin(a0) * 0.21, y, 0.2 + (y - 0.45) * 0.1 + Math.cos(a0) * 0.04);
      const p1 = P(Math.sin(a1) * 0.21, y, 0.2 + (y - 0.45) * 0.1 + Math.cos(a1) * 0.04);
      b.bar(p0, p1, new Vector3(0, 0.035, 0), 0.014);
    }
  }
  return b.build();
}

function umbrellaGeo(): { canopy: BufferGeometry; pole: BufferGeometry } {
  const c = new GeoBuilder();
  c.setColor([1, 1, 1]);
  const n = 8;
  const R = 1.3;
  const top = new Vector3(0, 2.38, 0);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const p0 = new Vector3(Math.cos(a0) * R, 2.0, Math.sin(a0) * R);
    const p1 = new Vector3(Math.cos(a1) * R, 2.0, Math.sin(a1) * R);
    // each panel sags a little between ribs
    const mid = new Vector3(Math.cos(am) * R * 0.93, 2.02, Math.sin(am) * R * 0.93);
    c.tri(top, p1, mid);
    c.tri(top, mid, p0);
    // scalloped valance
    const v0 = p0.clone().setY(1.86);
    const v1 = p1.clone().setY(1.86);
    const vm = mid.clone().setY(1.8);
    c.quad(p0, mid, vm, v0);
    c.quad(mid, p1, v1, vm);
  }
  const p = new GeoBuilder();
  p.setColor(lin('#e8e4da'));
  p.cylinder(new Vector3(0, 0, 0), new Vector3(0, 2.45, 0), 0.022, 0.02, 6);
  p.cylinder(new Vector3(0, 2.38, 0), new Vector3(0, 2.52, 0), 0.04, 0.012, 6);
  return { canopy: c.build(), pole: p.build() };
}

const UMBRELLA_COLORS = ['#ffffff', '#ef8fae', '#5b93c9', '#f5f2ea'];

export function buildCafes(spots: CafeSpot[]): Object3D {
  const lib = materials();
  const root = new Object3D();
  root.name = 'cafes';
  const table = tableGeo();
  const chair = chairGeo();
  const { canopy, pole } = umbrellaGeo();
  const nSeats = spots.reduce((s, c) => s + c.seats, 0);
  const nUmb = spots.filter((s) => s.umbrella > 0).length;
  const mk = (g: BufferGeometry, m: Material, n: number) => {
    const im = new InstancedMesh(g, m, Math.max(1, n));
    im.castShadow = true;
    im.receiveShadow = true;
    im.count = 0;
    root.add(im);
    return im;
  };
  const tables = mk(table, lib.plastic, spots.length);
  const chairs = mk(chair, lib.plastic, nSeats);
  const canopies = mk(canopy, lib.fabric, nUmb);
  const poles = mk(pole, lib.metal, nUmb);
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3(1, 1, 1);
  const col = new Color();
  for (const sp of spots) {
    m.compose(new Vector3(sp.x, sp.y, sp.z), q.setFromAxisAngle(new Vector3(0, 1, 0), sp.rot), s);
    tables.setMatrixAt(tables.count++, m);
    for (let k = 0; k < sp.seats; k++) {
      const a = sp.rot + (k / sp.seats) * Math.PI * 2 + (sp.seats === 2 ? Math.PI / 2 : Math.PI / 4);
      const off = 0.62 + ((k * 37) % 5) * 0.02;
      const pos = new Vector3(sp.x + Math.cos(a) * off, sp.y, sp.z + Math.sin(a) * off);
      // chairs face the table, slightly askew
      const yaw = Math.atan2(Math.cos(a), Math.sin(a)) + (((k * 13) % 7) - 3) * 0.05;
      m.compose(pos, q.setFromAxisAngle(new Vector3(0, 1, 0), yaw), s);
      chairs.setMatrixAt(chairs.count++, m);
    }
    if (sp.umbrella > 0) {
      m.compose(new Vector3(sp.x, sp.y, sp.z), q.setFromAxisAngle(new Vector3(0, 1, 0), sp.rot * 0.5), s);
      canopies.setMatrixAt(canopies.count, m);
      col.set(UMBRELLA_COLORS[sp.umbrella]);
      canopies.setColorAt(canopies.count++, col);
      poles.setMatrixAt(poles.count++, m);
    }
    addCircle(sp.x, sp.z, 0.42, sp.y, sp.y + 0.8, 'table');
  }
  for (const im of [tables, chairs, canopies, poles]) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }
  return root;
}
