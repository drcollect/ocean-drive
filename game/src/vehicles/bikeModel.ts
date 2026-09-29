// A beach cruiser: swooping pastel frame, balloon tyres, fenders, chrome swept-back bars, a front wicker
// basket, sprung saddle and chain guard. Local space: front +Z, wheels on y = 0.
import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GeoBuilder } from '../core/builder';
import { lin } from '../world/materials';

const P = (x: number, y: number, z: number) => new Vector3(x, y, z);

export interface BikeModel {
  root: Group;
  front: Group;
  wheels: Group[];
  cranks: Group;
  bars: Group;
}

export function buildBikeModel(frameColor = '#8fd3c7'): BikeModel {
  const root = new Group();
  root.name = 'bike';
  const paint = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.2, name: 'bike-paint' });
  paint.color.setRGB(...lin(frameColor));
  const chrome = new MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.12, metalness: 1, name: 'chrome' });
  const dark = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, name: 'bike-dark' });
  const wicker = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, name: 'wicker' });
  // woven cane: an over-under checker in the basket's own space
  wicker.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWk;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWk = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWk;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float a = sin(vWk.y * 170.0);
          float b = sin((vWk.x + vWk.z) * 150.0);
          float weave = 0.5 + 0.5 * sign(a) * b;
          diffuseColor.rgb *= 0.62 + 0.5 * weave;
        }`,
      );
  };
  wicker.customProgramCacheKey = () => 'od-wicker';
  const R = 0.33; // 26" balloon tyre
  const wb = 1.12;
  const zf = wb / 2;
  const zr = -wb / 2;
  const mesh = (b: GeoBuilder, m: MeshStandardMaterial, parent: Group) => {
    const g = b.build();
    const me = new Mesh(g, m);
    me.castShadow = me.receiveShadow = true;
    parent.add(me);
    return me;
  };
  // frame: curved top tube, down tube, seat tube, chain stays, seat stays
  const f = new GeoBuilder();
  const tube = (pts: Vector3[], r: number) => {
    for (let i = 0; i < pts.length - 1; i++) f.cylinder(pts[i], pts[i + 1], r, r, 8, false);
  };
  const head = P(0, 0.86, zf - 0.2);
  const bb = P(0, 0.3, 0.02);
  const seat = P(0, 0.86, zr + 0.36);
  const curve = (a: Vector3, c: Vector3, b: Vector3, n = 8) => Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return a.clone().multiplyScalar((1 - t) ** 2).addScaledVector(c, 2 * (1 - t) * t).addScaledVector(b, t * t);
  });
  tube(curve(head, P(0, 0.62, 0.05), P(0, 0.72, zr + 0.3)), 0.022); // swooping top tube
  tube(curve(P(0, 0.8, zf - 0.22), P(0, 0.35, zf - 0.3), bb), 0.026); // down tube
  tube([bb, seat], 0.022);
  for (const s of [-1, 1]) {
    tube([bb, P(s * 0.07, R, zr)], 0.013);
    tube([seat.clone().add(P(0, -0.05, 0)), P(s * 0.07, R, zr)], 0.012);
  }
  mesh(f, paint, root);
  // fenders over both wheels
  const fe = new GeoBuilder();
  for (const zc of [zf, zr]) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = 0.35 + (i / n) * 2.5;
      const a1 = 0.35 + ((i + 1) / n) * 2.5;
      const rr = R + 0.05;
      const p0 = P(0, R + Math.sin(a0) * rr, zc + Math.cos(a0) * rr * (zc > 0 ? 1 : -1));
      const p1 = P(0, R + Math.sin(a1) * rr, zc + Math.cos(a1) * rr * (zc > 0 ? 1 : -1));
      fe.bar(p0, p1, P(0, Math.sin(a0), Math.cos(a0)).multiplyScalar(0.01), 0.075);
    }
  }
  mesh(fe, paint, root);
  // chain guard, saddle, pedals, kickstand
  const d = new GeoBuilder();
  d.setColor(lin(frameColor));
  d.box(0.06, 0.24, zr + 0.06, 0.08, 0.36, 0.1);
  d.setColor(lin('#5a3b24'));
  d.box(-0.11, seat.y + 0.07, seat.z - 0.14, 0.11, seat.y + 0.13, seat.z + 0.1); // saddle
  d.box(-0.05, seat.y + 0.07, seat.z + 0.1, 0.05, seat.y + 0.12, seat.z + 0.2);
  d.setColor(lin('#202020'));
  d.cylinder(P(0, seat.y, seat.z), P(0, seat.y + 0.07, seat.z), 0.018, 0.018, 6, false);
  mesh(d, dark, root);
  // wheels: balloon tyre, white wall, chrome rim and spokes
  const wheels: Group[] = [];
  const w = new GeoBuilder();
  w.setColor(lin('#1d1d1d'));
  w.cylinder(P(-0.028, 0, 0), P(0.028, 0, 0), R, R, 26, false);
  for (const s of [-1, 1]) {
    w.setColor(lin('#1d1d1d'));
    w.cylinder(P(s * 0.028, 0, 0), P(s * 0.03, 0, 0), R, R - 0.03, 26, false);
    w.setColor(lin('#e9e4d6'));
    w.cylinder(P(s * 0.03, 0, 0), P(s * 0.03, 0, 0), R - 0.03, R - 0.045, 26, false);
  }
  w.setColor(lin('#cfcfcf'));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    w.bar(P((i % 2 ? 1 : -1) * 0.02, 0, 0), P(0, Math.cos(a) * (R - 0.05), Math.sin(a) * (R - 0.05)), P(0.003, 0, 0), 0.004);
  }
  w.cylinder(P(-0.04, 0, 0), P(0.04, 0, 0), 0.025, 0.025, 8);
  const wg = w.build();
  const spokeMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 });
  for (const zc of [zr, zf]) {
    const holder = new Group();
    holder.position.set(0, R, zc);
    const spin = new Group();
    const m = new Mesh(wg, spokeMat);
    m.castShadow = true;
    spin.add(m);
    holder.add(spin);
    if (zc === zf) {
      wheels.push(spin);
    } else {
      root.add(holder);
      wheels.push(spin);
    }
    (holder as Group).userData.front = zc === zf;
    if (zc === zf) (root.userData.frontWheel = holder);
  }
  // front assembly steers: fork, bars, basket, front wheel
  const front = new Group();
  front.position.copy(head);
  front.rotation.x = -0.28; // head angle
  const fw = root.userData.frontWheel as Group;
  const fork = new GeoBuilder();
  for (const s of [-1, 1]) fork.cylinder(P(s * 0.045, 0.05, 0), P(s * 0.045, -(head.y - R) / Math.cos(0.28), 0.04), 0.014, 0.014, 6, false);
  fork.cylinder(P(0, 0.0, 0), P(0, 0.22, 0), 0.02, 0.02, 8, false);
  mesh(fork, chrome, front);
  // swept-back cruiser bars
  const bars = new Group();
  bars.position.set(0, 0.22, 0);
  const hb = new GeoBuilder();
  const barPts = [P(-0.36, 0.1, -0.24), P(-0.3, 0.1, -0.12), P(-0.16, 0.05, 0.0), P(0, 0.02, 0.03), P(0.16, 0.05, 0.0), P(0.3, 0.1, -0.12), P(0.36, 0.1, -0.24)];
  for (let i = 0; i < barPts.length - 1; i++) hb.cylinder(barPts[i], barPts[i + 1], 0.012, 0.012, 8, false);
  mesh(hb, chrome, bars);
  const grips = new GeoBuilder();
  grips.setColor(lin('#6b4a2e'));
  for (const s of [-1, 1]) grips.cylinder(P(s * 0.34, 0.1, -0.2), P(s * 0.37, 0.1, -0.33), 0.018, 0.018, 8);
  // bell
  grips.setColor(lin('#d8d8d8'));
  grips.cylinder(P(-0.2, 0.06, -0.02), P(-0.2, 0.1, -0.02), 0.028, 0.012, 10);
  mesh(grips, dark, bars);
  front.add(bars);
  // wicker basket on the front rack
  const bk = new GeoBuilder();
  const bw = 0.2;
  const bd = 0.16;
  const bh = 0.22;
  const bz = 0.2;
  const by = -0.02;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    bk.setColor(lin(i % 2 ? '#b98b52' : '#a57a45'));
    // horizontal weave rows
    const y = by - bh + t * bh;
    bk.bar(P(-bw, y, bz - bd), P(bw, y, bz - bd), P(0, 0.018, 0), 0.012);
    bk.bar(P(-bw, y, bz + bd), P(bw, y, bz + bd), P(0, 0.018, 0), 0.012);
    bk.bar(P(-bw, y, bz - bd), P(-bw, y, bz + bd), P(0, 0.018, 0), 0.012);
    bk.bar(P(bw, y, bz - bd), P(bw, y, bz + bd), P(0, 0.018, 0), 0.012);
  }
  bk.setColor(lin('#8e6538'));
  for (let i = 0; i <= 8; i++) {
    const x = -bw + (2 * bw * i) / 8;
    bk.bar(P(x, by - bh, bz - bd), P(x, by + 0.01, bz - bd), P(0, 0, 0.01), 0.012);
    bk.bar(P(x, by - bh, bz + bd), P(x, by + 0.01, bz + bd), P(0, 0, 0.01), 0.012);
  }
  bk.setColor(lin('#9a6e3e'));
  bk.box(-bw, by - bh - 0.01, bz - bd, bw, by - bh + 0.01, bz + bd);
  // rim of the basket
  bk.setColor(lin('#7a5530'));
  for (const [a, b] of [[P(-bw, by + 0.01, bz - bd), P(bw, by + 0.01, bz - bd)], [P(-bw, by + 0.01, bz + bd), P(bw, by + 0.01, bz + bd)], [P(-bw, by + 0.01, bz - bd), P(-bw, by + 0.01, bz + bd)], [P(bw, by + 0.01, bz - bd), P(bw, by + 0.01, bz + bd)]] as [Vector3, Vector3][]) bk.bar(a, b, P(0, 0.025, 0), 0.025);
  const basket = mesh(bk, wicker, front);
  basket.rotation.x = 0.28; // keep the basket level
  root.add(front);
  // front wheel hangs off the fork (in front's space)
  fw.position.set(0, -(head.y - R), 0.13);
  fw.rotation.x = 0.28;
  front.add(fw);
  // cranks and pedals
  const cranks = new Group();
  cranks.position.copy(bb);
  const cr = new GeoBuilder();
  cr.setColor(lin('#bdbdbd'));
  cr.cylinder(P(-0.09, 0, 0), P(0.09, 0, 0), 0.03, 0.03, 10);
  cr.cylinder(P(0.06, 0, 0), P(0.065, 0, 0), 0.1, 0.1, 18); // chainring
  cr.bar(P(0.09, 0, 0), P(0.09, -0.17, 0), P(0.012, 0, 0), 0.03);
  cr.bar(P(-0.09, 0, 0), P(-0.09, 0.17, 0), P(0.012, 0, 0), 0.03);
  cr.setColor(lin('#222222'));
  cr.box(0.1, -0.19, -0.05, 0.2, -0.16, 0.05);
  cr.box(-0.2, 0.16, -0.05, -0.1, 0.19, 0.05);
  mesh(cr, dark, cranks);
  root.add(cranks);
  return { root, front, wheels, cranks, bars };
}
