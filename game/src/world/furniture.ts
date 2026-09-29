// Street furniture: black Deco lamp posts with white globes and black slatted trash cans along both
// sidewalks (and later the promenade), instanced, each one a collider.
import { InstancedMesh, Matrix4, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { GeoBuilder } from '../core/builder';
import { Rng } from '../core/rng';
import { CROSS_Z, SIDEWALK_Y, X, Z_MAX, Z_MIN } from './layout';
import { lin } from './materials';
import type { PalmSpec } from './palms';
import { addCircle, groundAt } from './registry';

const P = (x: number, y: number, z: number) => new Vector3(x, y, z);

function lampGeo(): { post: GeoBuilder; globe: GeoBuilder } {
  const b = new GeoBuilder();
  b.setColor(lin('#1c1d1f'));
  // stepped octagonal base
  b.cylinder(P(0, 0, 0), P(0, 0.18, 0), 0.26, 0.25, 8);
  b.cylinder(P(0, 0.18, 0), P(0, 0.62, 0), 0.19, 0.15, 8);
  b.cylinder(P(0, 0.62, 0), P(0, 0.72, 0), 0.17, 0.12, 8);
  // fluted shaft (eight sides reads as fluting under the low sun)
  b.cylinder(P(0, 0.72, 0), P(0, 3.45, 0), 0.085, 0.062, 8, false);
  // collars
  b.cylinder(P(0, 2.2, 0), P(0, 2.3, 0), 0.1, 0.1, 8);
  b.cylinder(P(0, 3.4, 0), P(0, 3.55, 0), 0.1, 0.13, 8);
  // cage ring and neck under the globe
  b.cylinder(P(0, 3.55, 0), P(0, 3.72, 0), 0.13, 0.17, 10);
  // finial above
  b.cylinder(P(0, 4.26, 0), P(0, 4.34, 0), 0.07, 0.07, 8);
  b.cylinder(P(0, 4.34, 0), P(0, 4.5, 0), 0.045, 0.005, 6);
  const g = new GeoBuilder();
  g.setColor([1, 1, 1]);
  // globe: stacked rings approximating a sphere
  const n = 9;
  const R = 0.27;
  const cy = 3.98;
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (Math.PI * i) / n;
    const a1 = -Math.PI / 2 + (Math.PI * (i + 1)) / n;
    g.cylinder(P(0, cy + Math.sin(a0) * R, 0), P(0, cy + Math.sin(a1) * R, 0), Math.cos(a0) * R, Math.cos(a1) * R, 14, false);
  }
  return { post: b, globe: g };
}

function canGeo(): GeoBuilder {
  const b = new GeoBuilder();
  b.setColor(lin('#1b1c1d'));
  // slatted body: vertical slats round a liner
  b.cylinder(P(0, 0.05, 0), P(0, 0.92, 0), 0.26, 0.27, 10, false);
  const slats = 16;
  for (let i = 0; i < slats; i++) {
    const a = (i / slats) * Math.PI * 2;
    const r = 0.3;
    b.bar(P(Math.cos(a) * r, 0.06, Math.sin(a) * r), P(Math.cos(a) * r, 0.9, Math.sin(a) * r), P(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.025), 0.07);
  }
  b.cylinder(P(0, 0.9, 0), P(0, 0.97, 0), 0.33, 0.33, 12);
  b.cylinder(P(0, 0.97, 0), P(0, 1.05, 0), 0.3, 0.18, 12);
  // feet ring
  b.cylinder(P(0, 0, 0), P(0, 0.06, 0), 0.32, 0.32, 12);
  return b;
}

export interface Furniture {
  root: Object3D;
  lamps: Vector3[];
  cans: Vector3[];
}

export function buildFurniture(palms: PalmSpec[], extraLamps: Vector3[] = [], extraCans: Vector3[] = []): Furniture {
  const rng = new Rng(5150);
  const lamps: Vector3[] = [];
  const cans: Vector3[] = [];
  const clearOf = (x: number, z: number, r: number) => !palms.some((p) => Math.abs(p.z - z) < r && Math.hypot(p.x - x, p.z - z) < r);
  const nearCross = (z: number, pad: number) => CROSS_Z.some((c) => Math.abs(z - c) < 8.5 + pad);
  for (const side of [-1, 1]) {
    const x = side < 0 ? X.curbW - 0.55 : X.curbE + 0.55;
    for (let z = Z_MIN + 8; z < Z_MAX - 4; z += 24) {
      let zz = z + rng.range(-1.5, 1.5);
      if (side < 0 && nearCross(zz, 1.5)) continue;
      let ok = clearOf(x, zz, 2.2);
      for (let k = 0; k < 4 && !ok; k++) {
        zz += 1.5;
        ok = clearOf(x, zz, 2.2);
      }
      if (!ok) continue;
      lamps.push(P(x, SIDEWALK_Y, zz));
      if (rng.chance(0.4)) {
        const cz = zz + (rng.chance(0.5) ? 1.4 : -1.4);
        if (clearOf(x, cz, 1.2) && !(side < 0 && nearCross(cz, 1))) cans.push(P(x + side * 0.2, SIDEWALK_Y, cz));
      }
    }
  }
  // cans at the crosswalk corners, and whatever the park and the beach asked for
  for (const cz of CROSS_Z) for (const s of [-1, 1]) cans.push(P(X.curbW - 0.7, SIDEWALK_Y, cz + s * (8.5 + 1.2)));
  lamps.push(...extraLamps);
  cans.push(...extraCans);

  const root = new Object3D();
  root.name = 'furniture';
  const { post, globe } = lampGeo();
  const metal = new MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55, name: 'lamp-metal' });
  const glass = new MeshPhysicalMaterial({ color: 0xf6f3ea, roughness: 0.35, metalness: 0, sheen: 0.4, name: 'lamp-globe' });
  const mk = (geo: GeoBuilder, mat: MeshStandardMaterial, where: Vector3[]) => {
    const im = new InstancedMesh(geo.build(), mat, Math.max(1, where.length));
    im.count = where.length;
    const m = new Matrix4();
    const q = new Quaternion();
    where.forEach((p, i) => {
      q.setFromAxisAngle(P(0, 1, 0), (p.x * 13.7 + p.z * 3.1) % 6.28);
      m.compose(p, q, P(1, 1, 1));
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    root.add(im);
    return im;
  };
  mk(post, metal, lamps);
  mk(globe, glass, lamps);
  mk(canGeo(), metal, cans);
  for (const p of lamps) addCircle(p.x, p.z, 0.24, 0, 4.5, 'lamp');
  for (const p of cans) addCircle(p.x, p.z, 0.33, 0, 1.05, 'can');
  void groundAt;
  return { root, lamps, cans };
}
