// Grass blades on the lawn around you: short, coarse St. Augustine tufts on a jittered grid that follows
// the camera, fading out at the edge so they never pop, swaying in the shared wind. Beyond them the lawn's
// own shader carries the colour.
import { DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { GeoBuilder } from '../core/builder';
import { hashU } from '../core/rng';
import { terrainHeight, terrainSurface } from './layout';
import { inDropSite } from '../drop/site';
import { lin } from './materials';
import { WIND_GLSL } from './wind';

const CELL = 0.3;

function tuftGeo(): GeoBuilder {
  const b = new GeoBuilder();
  const cols = ['#3d5a22', '#4a6b28', '#5b7a2e', '#6f7f35', '#7d8a3c', '#435f25'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + i * 0.7;
    const r = 0.04 + (i % 3) * 0.025;
    const h = 0.07 + ((i * 37) % 7) * 0.012 + (i === 3 ? 0.08 : 0);
    const lean = 0.25 + (i % 4) * 0.1;
    const base = new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const dir = new Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
    const side = new Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.006);
    const mid = base.clone().addScaledVector(dir, h * 0.55);
    const tip = base.clone().addScaledVector(dir, h).add(new Vector3(Math.cos(a) * h * 0.25, -h * 0.1, Math.sin(a) * h * 0.25));
    b.setColor(lin(cols[i % cols.length]));
    b.quad(base.clone().sub(side), base.clone().add(side), mid.clone().add(side), mid.clone().sub(side), [0, 0, 1, 0.55]);
    b.tri(mid.clone().sub(side), mid.clone().add(side), tip, [0, 0.55], [1, 0.55], [0.5, 1]);
  }
  return b;
}

export class Grass {
  readonly mesh: InstancedMesh;
  private center = new Vector3(1e9, 0, 1e9);
  private time = { value: 0 };
  private radius: number;

  constructor(density: number) {
    this.radius = 9 + 9 * density;
    const n = Math.ceil(((Math.PI * this.radius * this.radius) / (CELL * CELL)) * 0.62);
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: DoubleSide, name: 'grass' });
    const time = this.time;
    const R = this.radius;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\n${WIND_GLSL}`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec4 wp = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float d = length(wp.xz - cameraPosition.xz);
            float fade = 1.0 - smoothstep(${(R * 0.62).toFixed(1)}, ${(R * 0.97).toFixed(1)}, d);
            transformed.y *= fade;
            vec3 w = windAt(wp.xyz, uTime);
            float h = max(position.y, 0.0) * 10.0;
            transformed.xz += (inverse(mat3(instanceMatrix)) * w).xz * h * h * 0.02 * (0.7 + 0.3 * sin(uTime * 3.1 + wp.x * 1.7 + wp.z));
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'od-grass';
    this.mesh = new InstancedMesh(tuftGeo().build(), mat, n);
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'grass';
  }

  update(t: number, cam: Vector3): void {
    this.time.value = t;
    // nothing to do far from the lawn
    const nearLawn = cam.x > -2 && cam.x < 48;
    this.mesh.visible = nearLawn;
    if (!nearLawn || cam.distanceTo(this.center) < 2.5) return;
    this.center.copy(cam);
    const R = this.radius;
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    let n = 0;
    const cap = this.mesh.instanceMatrix.count;
    const i0 = Math.floor((cam.x - R) / CELL);
    const i1 = Math.floor((cam.x + R) / CELL);
    const j0 = Math.floor((cam.z - R) / CELL);
    const j1 = Math.floor((cam.z + R) / CELL);
    for (let j = j0; j <= j1 && n < cap; j++) {
      for (let i = i0; i <= i1 && n < cap; i++) {
        const h1 = hashU((Math.imul(i + 100000, 0x9e3779b1) ^ Math.imul(j + 100000, 0x85ebca77)) >>> 0);
        const h2 = hashU((Math.imul(i + 7331, 0x85ebca77) ^ Math.imul(j + 9173, 0xc2b2ae35)) >>> 0);
        const x = (i + 0.15 + 0.7 * h1) * CELL;
        const z = (j + 0.15 + 0.7 * h2) * CELL;
        const dx = x - cam.x;
        const dz = z - cam.z;
        if (dx * dx + dz * dz > R * R) continue;
        if (terrainSurface(x, z) !== 'grass' || inDropSite(x, z)) continue;
        p.set(x, terrainHeight(x, z) - 0.01, z);
        q.setFromAxisAngle(new Vector3(0, 1, 0), h1 * 6.283);
        const k = 0.75 + h2 * 0.6;
        s.set(k, k * (0.8 + h1 * 0.5), k);
        m.compose(p, q, s);
        this.mesh.setMatrixAt(n++, m);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
