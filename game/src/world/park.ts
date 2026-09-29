// Lummus Park: the lawn between the street and the beach, the concrete promenade along its seaward side,
// a low post-and-rope fence with dune plants beyond it (sea oats, sea grape, beach sunflower), benches
// facing the sea and Deco lamps along the walk. Beach access gaps in the fence every so often.
import { BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { GeoBuilder } from '../core/builder';
import { fbm2, Rng } from '../core/rng';
import { noiseTexture } from '../textures/noise';
import { promenadeE, promenadeW, PROMENADE_Y, terrainHeight, X, Z_MAX, Z_MIN } from './layout';
import { lin } from './materials';
import type { PalmSpec } from './palms';
import { addAABB, addCircle } from './registry';
import { WIND_GLSL } from './wind';

const REACH = 1000;

function lawnMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, name: 'lawn' });
  const noise = noiseTexture();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOdNoise = { value: noise };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uOdNoise;\nfloat odH = 0.0;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vWPos.xz;
          float big = texture2D(uOdNoise, p * 0.02).g;
          float mid = texture2D(uOdNoise, p * 0.13).b;
          float fine = texture2D(uOdNoise, p * 1.7).r;
          float blades = texture2D(uOdNoise, p * vec2(9.0, 7.0)).b;
          // St. Augustine grass: coarse, blue-green, with yellowed and thin sandy patches
          vec3 green = vec3(0.12, 0.2, 0.07);
          vec3 dry = vec3(0.3, 0.29, 0.13);
          vec3 sand = vec3(0.55, 0.49, 0.38);
          vec3 c = mix(green, dry, smoothstep(0.45, 0.8, big) * 0.7);
          c *= 0.8 + 0.4 * mid;
          c *= 0.93 + 0.14 * mix(blades, 0.5, smoothstep(4.0, 18.0, length(vViewPosition)));
          float bare = smoothstep(0.72, 0.9, texture2D(uOdNoise, p * 0.05 + 0.4).g);
          c = mix(c, sand * (0.9 + 0.2 * fine), bare * 0.8);
          // worn line where people cut across towards the beach
          diffuseColor.rgb = c;
          odH = (blades * 0.6 + fine * 0.4) * 0.5;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 dpx = dFdx(-vViewPosition);
          vec3 dpy = dFdy(-vViewPosition);
          float dhx = dFdx(odH);
          float dhy = dFdy(odH);
          vec3 r1 = cross(dpy, normal);
          vec3 r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          float kk = 0.05 * (1.0 - smoothstep(5.0, 22.0, length(vViewPosition)));
          normal = normalize(abs(det) * normal - grad * kk);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'od-lawn';
  return m;
}

function lawnGeometry(): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const zs: number[] = [];
  for (let z = -REACH; z <= REACH; ) {
    zs.push(z);
    z += Math.abs(z) < 430 ? 1.5 : 12;
  }
  const cols = 22;
  for (const z of zs) {
    const x0 = X.parkW - 0.05;
    const x1 = promenadeW(z) + 0.1;
    for (let i = 0; i <= cols; i++) {
      const x = x0 + ((x1 - x0) * i) / cols;
      pos.push(x, terrainHeight(Math.min(x, x1 - 0.2), z) + 0.005, z);
    }
  }
  const n = cols + 1;
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function promenadeGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  b.setColor(lin('#d9c4b4'));
  const step = 2;
  for (let z = -REACH; z < REACH; z += step) {
    const z1 = z + step;
    const w0 = promenadeW(z);
    const w1 = promenadeW(z1);
    const e0 = promenadeE(z);
    const e1 = promenadeE(z1);
    const y = PROMENADE_Y;
    const P = (x: number, yy: number, zz: number) => new Vector3(x, yy, zz);
    b.quad(P(w0, y, z), P(w0, y, z1), P(e1, y, z1), P(e0, y, z), [w0, z, e0, z1]);
    // edges: a small kerb down to the lawn and the sand
    b.quad(P(w0, y, z1), P(w0, y, z), P(w0, y - 0.3, z), P(w1, y - 0.3, z1));
    b.quad(P(e0, y, z), P(e1, y, z1), P(e1, y - 0.5, z1), P(e0, y - 0.5, z));
  }
  return b.build();
}

/** Sea oats: a clump of thin blades and seed heads; sea grape: a mound of round leaves. */
function seaOatsGeo(): GeoBuilder {
  const b = new GeoBuilder();
  const rng = new Rng(11);
  for (let i = 0; i < 12; i++) {
    const a = rng.range(0, Math.PI * 2);
    const lean = rng.range(0.1, 0.5);
    const h = rng.range(0.55, 1.05);
    const base = new Vector3(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06);
    const dir = new Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
    const side = new Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.012);
    const mid = base.clone().addScaledVector(dir, h * 0.5);
    const tip = base.clone().addScaledVector(dir, h).add(new Vector3(Math.cos(a) * h * 0.15, -h * 0.08, Math.sin(a) * h * 0.15));
    b.setColor(lin(rng.pick(['#8a8f54', '#9b9a5e', '#7a8446', '#a8a36c'])));
    b.auxv = [0, 0, 0, 1];
    b.quad(base.clone().sub(side), base.clone().add(side), mid.clone().add(side.clone().multiplyScalar(0.7)), mid.clone().sub(side.clone().multiplyScalar(0.7)), [0, 0, 1, 0.5]);
    b.tri(mid.clone().sub(side.clone().multiplyScalar(0.7)), mid.clone().add(side.clone().multiplyScalar(0.7)), tip, [0, 0.5], [1, 0.5], [0.5, 1]);
  }
  // seed heads: taller stalks with a drooping panicle
  for (let i = 0; i < 2; i++) {
    const a = rng.range(0, Math.PI * 2);
    const h = rng.range(1.0, 1.35);
    const base = new Vector3(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04);
    const top = base.clone().add(new Vector3(Math.cos(a) * 0.2, h, Math.sin(a) * 0.2));
    b.setColor(lin('#b9a36a'));
    b.bar(base, top, new Vector3(0.008, 0, 0), 0.008);
    b.setColor(lin('#c4a766'));
    const droop = top.clone().add(new Vector3(Math.cos(a) * 0.1, -0.22, Math.sin(a) * 0.1));
    b.bar(top, droop, new Vector3(0.012, 0, 0), 0.028);
  }
  return b;
}

function seaGrapeGeo(): GeoBuilder {
  const b = new GeoBuilder();
  const rng = new Rng(12);
  for (let i = 0; i < 34; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.1, 0.75);
    const y = rng.range(0.15, 0.95) * (1 - r * 0.5);
    const c = new Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const n = new Vector3(Math.cos(a) * 0.6 + rng.range(-0.3, 0.3), 0.9, Math.sin(a) * 0.6 + rng.range(-0.3, 0.3)).normalize();
    const t1 = new Vector3().crossVectors(n, new Vector3(0, 1, 0.01)).normalize();
    const t2 = new Vector3().crossVectors(n, t1).normalize();
    const R = rng.range(0.09, 0.15);
    b.setColor(lin(rng.pick(['#5f7d2e', '#6e8a36', '#7a7d34', '#8d6a2e', '#566f2a'])));
    const seg = 7;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2;
      const a1 = ((k + 1) / seg) * Math.PI * 2;
      b.tri(c, c.clone().addScaledVector(t1, Math.cos(a0) * R).addScaledVector(t2, Math.sin(a0) * R), c.clone().addScaledVector(t1, Math.cos(a1) * R).addScaledVector(t2, Math.sin(a1) * R));
    }
  }
  return b;
}

function groundCoverGeo(): GeoBuilder {
  // beach sunflower / railroad vine: a low mat of leaves with yellow flowers
  const b = new GeoBuilder();
  const rng = new Rng(13);
  for (let i = 0; i < 40; i++) {
    const c = new Vector3(rng.range(-0.8, 0.8), rng.range(0.02, 0.14), rng.range(-0.8, 0.8));
    const flower = rng.chance(0.15);
    b.setColor(flower ? lin('#e8b72a') : lin(rng.pick(['#4f6a2a', '#5d7a30', '#6a8434'])));
    const R = flower ? 0.035 : rng.range(0.05, 0.09);
    const a = rng.range(0, 6.3);
    const t1 = new Vector3(Math.cos(a), 0.15, Math.sin(a)).normalize();
    const t2 = new Vector3(-Math.sin(a), 0.1, Math.cos(a)).normalize();
    for (let k = 0; k < 5; k++) {
      const a0 = (k / 5) * Math.PI * 2;
      const a1 = ((k + 1) / 5) * Math.PI * 2;
      b.tri(c, c.clone().addScaledVector(t1, Math.cos(a1) * R).addScaledVector(t2, Math.sin(a1) * R), c.clone().addScaledVector(t1, Math.cos(a0) * R).addScaledVector(t2, Math.sin(a0) * R));
    }
  }
  return b;
}

function plantMaterial(time: { value: number }): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: 2, name: 'plants' });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\n${WIND_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 wp = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec3 w = windAt(wp.xyz, uTime);
          float hgt = max(position.y, 0.0);
          float ph = wp.x * 0.7 + wp.z * 1.3;
          vec3 local = (inverse(mat3(instanceMatrix)) * w);
          transformed += local * hgt * hgt * (0.35 + 0.25 * sin(uTime * 2.3 + ph));
          transformed.xz += vec2(sin(uTime * 5.1 + ph + position.y * 6.0), cos(uTime * 4.3 + ph)) * 0.015 * hgt;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'od-plants';
  return m;
}

function benchGeo(): GeoBuilder {
  const b = new GeoBuilder();
  // cast frame ends and wooden slats; faces +z
  b.setColor(lin('#262626'));
  for (const x of [-0.8, 0.8]) {
    b.box(x - 0.04, 0, -0.28, x + 0.04, 0.44, -0.2);
    b.box(x - 0.04, 0, 0.18, x + 0.04, 0.44, 0.26);
    b.box(x - 0.04, 0.4, -0.3, x + 0.04, 0.46, 0.28);
    b.bar(new Vector3(x, 0.44, -0.26), new Vector3(x, 0.86, -0.36), new Vector3(0.06, 0, 0), 0.06);
    b.box(x - 0.05, 0.62, -0.3, x + 0.05, 0.66, 0.1); // armrest
  }
  b.setColor(lin('#8a6a48'));
  for (let i = 0; i < 4; i++) b.box(-0.95, 0.44, -0.26 + i * 0.13, 0.95, 0.48, -0.16 + i * 0.13);
  for (let i = 0; i < 3; i++) {
    const y = 0.56 + i * 0.12;
    const z = -0.3 - i * 0.025;
    b.box(-0.95, y, z - 0.03, 0.95, y + 0.08, z + 0.01);
  }
  return b;
}

export interface Park {
  root: Object3D;
  benches: { x: number; z: number; yaw: number }[];
  lampSpots: Vector3[];
  update(t: number, cam?: Vector3): void;
}

export function buildPark(palms: PalmSpec[]): Park {
  const rng = new Rng(4444);
  const root = new Object3D();
  root.name = 'park';
  const lawn = new Mesh(lawnGeometry(), lawnMaterial());
  lawn.receiveShadow = true;
  lawn.name = 'lawn';
  root.add(lawn);
  const promMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, name: 'promenade' });
  // re-use the sidewalk look: joints and stains in world space
  promMat.onBeforeCompile = (shader) => {
    shader.uniforms.uOdNoise = { value: noiseTexture() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uOdNoise;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vWPos.xz;
          vec3 c = diffuseColor.rgb * (0.88 + 0.2 * texture2D(uOdNoise, p * 0.08).g) * (0.95 + 0.08 * texture2D(uOdNoise, p * 2.3).b);
          // wavy scored bands across the walk
          float band = abs(fract((p.y + 0.8 * sin(p.x * 0.9)) / 2.4) - 0.5);
          c *= 1.0 - 0.25 * smoothstep(0.47, 0.495, band);
          float sandy = smoothstep(0.6, 0.85, texture2D(uOdNoise, p * 0.11 + 0.2).g);
          c = mix(c, vec3(0.62, 0.55, 0.44), sandy * 0.35);
          diffuseColor.rgb = c;
        }`,
      );
  };
  promMat.customProgramCacheKey = () => 'od-promenade';
  const prom = new Mesh(promenadeGeometry(), promMat);
  prom.receiveShadow = true;
  prom.name = 'promenade';
  root.add(prom);

  // fence posts with rope along the seaward edge of the promenade, with gaps for beach access
  const posts = new GeoBuilder();
  const rope = new GeoBuilder();
  const gapsAt: number[] = [];
  for (let z = Z_MIN - 300; z < Z_MAX + 300; z += rng.range(40, 60)) gapsAt.push(z);
  const inGap = (z: number) => gapsAt.some((g) => Math.abs(z - g) < 2.2);
  let prev: Vector3 | null = null;
  for (let z = -REACH; z <= REACH; z += 2.4) {
    const x = promenadeE(z) + 0.45;
    if (inGap(z)) {
      prev = null;
      continue;
    }
    const y = terrainHeight(x, z);
    posts.setColor(lin(rng.pick(['#7b6247', '#8a7053', '#6d5840'])));
    posts.box(x - 0.06, y - 0.2, z - 0.06, x + 0.06, y + 0.82, z + 0.06);
    const top = new Vector3(x, y + 0.72, z);
    if (prev) {
      rope.setColor(lin('#c9b48c'));
      // rope sagging between posts (too thin to throw a real shadow at this distance)
      const mid = prev.clone().add(top).multiplyScalar(0.5);
      mid.y -= 0.12;
      rope.bar(prev, mid, new Vector3(0, 0.03, 0), 0.03);
      rope.bar(mid, top, new Vector3(0, 0.03, 0), 0.03);
    }
    prev = top;
    if (Math.abs(z) < 420) addCircle(x, z, 0.1, y - 0.2, y + 0.82, 'post');
  }
  // the rope itself is a collider between posts
  for (let i = 0; i < gapsAt.length - 1; i++) {
    const za = gapsAt[i] + 2.2;
    const zb = gapsAt[i + 1] - 2.2;
    if (zb < -430 || za > 430) continue;
    for (let z = za; z < zb; z += 1.2) {
      const x = promenadeE(z) + 0.45;
      const y = terrainHeight(x, z);
      // waist-high: go round by the gaps, or hop it
      addAABB(x - 0.05, z, x + 0.05, Math.min(z + 1.2, zb), y - 0.3, y + 0.62, 'rope');
    }
  }
  const postMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, name: 'posts' });
  const pm = new Mesh(posts.build(), postMat);
  pm.castShadow = pm.receiveShadow = true;
  root.add(pm);
  const rm = new Mesh(rope.build(), postMat);
  rm.receiveShadow = true;
  root.add(rm);

  // dune plants between the fence and the open beach
  const time = { value: 0 };
  const pmat = plantMaterial(time);
  // plants go into 60 m chunks along the beach so distant ones can be dropped
  const chunks: InstancedMesh[] = [];
  const CH = 60;
  const place = (geo: GeoBuilder, count: number, pick: () => { x: number; z: number } | null, scale: [number, number], shadows = true) => {
    const g = geo.build();
    const byChunk = new Map<number, Matrix4[]>();
    const q = new Quaternion();
    let n = 0;
    for (let i = 0; i < count * 3 && n < count; i++) {
      const s = pick();
      if (!s) continue;
      const k = rng.range(scale[0], scale[1]);
      const m = new Matrix4().compose(new Vector3(s.x, terrainHeight(s.x, s.z) - 0.03, s.z), q.setFromAxisAngle(new Vector3(0, 1, 0), rng.range(0, 6.3)), new Vector3(k, k * rng.range(0.85, 1.2), k));
      const c = Math.floor(s.z / CH);
      if (!byChunk.has(c)) byChunk.set(c, []);
      byChunk.get(c)!.push(m);
      n++;
    }
    for (const [c, list] of byChunk) {
      const im = new InstancedMesh(g, pmat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = shadows;
      im.userData.shadows = shadows;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.userData.z = (c + 0.5) * CH;
      root.add(im);
      chunks.push(im);
    }
  };
  const duneSpot = () => {
    const z = rng.range(-980, 980);
    if (inGap(z)) return null;
    const x0 = promenadeE(z) + 0.9;
    const x = rng.range(x0, X.beachW + 2.5);
    // sparser towards the open beach
    if (rng.f() > 1 - (x - x0) / (X.beachW + 2.5 - x0) * 0.7) return null;
    return { x, z };
  };
  place(seaOatsGeo(), 3600, duneSpot, [0.8, 1.25]);
  place(seaGrapeGeo(), 800, () => {
    const s = duneSpot();
    return s && fbm2(s.x * 0.05, s.z * 0.05, 2, 7) > 0.5 ? s : null;
  }, [0.7, 1.4]);
  place(groundCoverGeo(), 1500, duneSpot, [0.8, 1.3], false);

  // benches along the promenade, facing the sea, and a few in the park
  const benches: { x: number; z: number; yaw: number }[] = [];
  for (let z = Z_MIN + 10; z < Z_MAX - 10; z += rng.range(15, 24)) {
    const x = promenadeW(z) + 0.55;
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < 2)) continue;
    benches.push({ x, z, yaw: -Math.PI / 2 });
  }
  const bgeo = benchGeo().build();
  const bm = new InstancedMesh(bgeo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, name: 'benches' }), benches.length);
  const mm = new Matrix4();
  const qq = new Quaternion();
  benches.forEach((b, i) => {
    // the bench's front faces +z; turn it to face east (the sea)
    mm.compose(new Vector3(b.x, terrainHeight(b.x + 0.4, b.z), b.z), qq.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2), new Vector3(1, 1, 1));
    bm.setMatrixAt(i, mm);
    addBox(b.x, b.z, 0.35, 1.0, 0, 0, 0.9);
  });
  bm.castShadow = bm.receiveShadow = true;
  bm.computeBoundingSphere();
  root.add(bm);

  // lamps along the walk (the furniture module instances them)
  const lampSpots: Vector3[] = [];
  for (let z = Z_MIN + 20; z < Z_MAX - 10; z += 30) {
    const x = promenadeW(z) + 0.3;
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < 2.5) || benches.some((b) => Math.abs(b.z - z) < 2.5)) continue;
    lampSpots.push(new Vector3(x, terrainHeight(x, z), z));
  }
  void Color;
  return {
    root,
    benches,
    lampSpots,
    update(t: number, cam?: Vector3) {
      time.value = t;
      if (cam)
        for (const c of chunks) {
          const d = Math.abs(c.userData.z - cam.z);
          c.visible = d < 150 + CH / 2;
          c.castShadow = c.userData.shadows && d < 70 + CH / 2;
        }
    },
  };
}

function addBox(x: number, z: number, hx: number, hz: number, rot: number, y0: number, y1: number): void {
  addAABB(x - hx, z - hz, x + hx, z + hz, y0, y1, 'bench');
  void rot;
}
