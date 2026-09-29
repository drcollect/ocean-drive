// The beach: a wide pale sand slope from the dunes to the water. Dry and raked into long grooves on the
// upper beach (tractor swaths with tyre tracks at their edges), churned by footprints mid-beach, a wrack
// line of sargassum along the berm, then dark wet sand below the swash line that turns to a mirror for a
// few seconds each time a wave drains away. The low sun rakes across all of it: the relief casts its own
// micro-shadows, computed in the shader from the same height field that bends the normals.
import { BufferAttribute, BufferGeometry, Color, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { Rng } from '../core/rng';
import { noiseTexture } from '../textures/noise';
import { SUN_DIR } from '../sky/atmosphere';
import { promenadeE, terrainHeight, X } from './layout';
import { lin } from './materials';
import { SWASH_GLSL } from './ocean';
import { SURF_GLSL } from './surf';

const SUN_H = new Vector3(SUN_DIR.x, 0, SUN_DIR.z).normalize();
const TAN_EL = SUN_DIR.y / Math.hypot(SUN_DIR.x, SUN_DIR.z);

export function sandMaterial(): { mat: MeshStandardMaterial; time: { value: number } } {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, name: 'sand' });
  const noise = noiseTexture();
  const time = { value: 0 };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOdNoise = { value: noise };
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform sampler2D uOdNoise;
        uniform float uTime;
        float odH = 0.0;
        float odMicro = 1.0;
        float odRough = 0.95;
        ${SURF_GLSL}
        ${SWASH_GLSL}
        const vec2 SUNH = vec2(${SUN_H.x.toFixed(5)}, ${SUN_H.z.toFixed(5)});
        const float TAN_EL = ${TAN_EL.toFixed(5)};
        float hh(vec2 q) { vec3 p3 = fract(vec3(q.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        // footprint relief in one 0.7 m cell
        float prints(vec2 p, float density) {
          vec2 cell = floor(p / 0.7);
          float r = hh(cell);
          if (r > density) return 0.0;
          vec2 c = (cell + 0.5 + (vec2(hh(cell + 3.1), hh(cell + 7.7)) - 0.5) * 0.35) * 0.7;
          float a = hh(cell + 11.3) * 6.2832;
          vec2 d = p - c;
          vec2 l = vec2(cos(a) * d.x + sin(a) * d.y, -sin(a) * d.x + cos(a) * d.y);
          float heel = length((l - vec2(-0.085, 0.0)) / vec2(0.055, 0.042));
          float ball = length((l - vec2(0.07, 0.0)) / vec2(0.075, 0.048));
          float e = min(heel, ball);
          return -0.022 * (1.0 - smoothstep(0.7, 1.0, e)) + 0.006 * smoothstep(0.9, 1.1, e) * (1.0 - smoothstep(1.1, 1.5, e));
        }
        // walking trails along the beach: alternating left/right prints, wandering, now and then broken off
        float footShape(vec2 d, vec2 dir) {
          vec2 l = vec2(dot(d, dir), dot(d, vec2(dir.y, -dir.x)));
          float heel = length((l - vec2(-0.085, 0.0)) / vec2(0.055, 0.042));
          float ball = length((l - vec2(0.07, 0.0)) / vec2(0.075, 0.048));
          float e = min(heel, ball);
          return -0.02 * (1.0 - smoothstep(0.7, 1.0, e)) + 0.006 * smoothstep(0.9, 1.1, e) * (1.0 - smoothstep(1.1, 1.6, e));
        }
        float trails(vec2 p) {
          float h = 0.0;
          for (int k = 0; k < 8; k++) {
            float fk = float(k);
            float x0 = 83.0 + fk * 4.6 + 1.8 * sin(fk * 3.7);
            float amp = 1.2 + fk * 0.35;
            float lam = 21.0 + fk * 6.0;
            float ph = fk * 1.9;
            if (abs(p.x - x0) > amp + 0.6) continue;
            float stepL = 0.7 + 0.04 * sin(fk);
            float n = floor(p.y / stepL + 0.5);
            float zc = n * stepL;
            if (hh(vec2(fk, floor(zc / 35.0))) < 0.3) continue;
            float xc = x0 + amp * sin(zc / lam + ph);
            float side = mod(n, 2.0) < 0.5 ? -1.0 : 1.0;
            float dir0 = (fk < 4.0 ? 1.0 : -1.0);
            vec2 dir = normalize(vec2(amp / lam * cos(zc / lam + ph), 1.0)) * dir0;
            vec2 c = vec2(xc, zc) + vec2(dir.y, -dir.x) * side * 0.11;
            vec2 d = p - c;
            if (dot(d, d) > 0.06) continue;
            h += footShape(d, dir);
          }
          return h;
        }
        // the sand's small relief (m)
        float relief(vec2 p, out float rakedAmt, out float trodden) {
          float x = p.x;
          float big = texture2D(uOdNoise, p * 0.018).g;
          // raked swaths on the upper beach, meandering a little
          rakedAmt = smoothstep(56.0, 60.0, x) * (1.0 - smoothstep(95.0, 100.0, x));
          trodden = smoothstep(78.0, 92.0, x) * (1.0 - smoothstep(112.0, 116.0, x));
          trodden = max(trodden, smoothstep(0.62, 0.8, texture2D(uOdNoise, p * 0.012 + 0.3).g) * rakedAmt);
          float v = x + 0.9 * sin(p.y * 0.021) + 0.25 * sin(p.y * 0.07 + 1.3);
          float vv = fract(v / 2.3) * 2.3;
          float groove = 0.5 + 0.5 * sin(vv / 0.115 * 6.2832);
          float track = smoothstep(0.32, 0.1, vv) + smoothstep(2.0, 2.2, vv);
          float tread = 0.5 + 0.5 * sin(p.y / 0.09 * 6.2832);
          // grooves fade out before they can alias into moiré
          float gFade = 1.0 - smoothstep(10.0, 24.0, length(vViewPosition));
          float hRake = mix(groove * 0.013 * gFade, tread * 0.006 * gFade, clamp(track, 0.0, 1.0));
          float churn = (texture2D(uOdNoise, p * 0.37 + 0.11).b - 0.5) * 0.012 + (texture2D(uOdNoise, p * 1.13 + 0.7).r - 0.5) * 0.006 + (texture2D(uOdNoise, p * 3.7).b - 0.5) * 0.003;
          float fp = prints(p, 0.1) + trails(p);
          float h = rakedAmt * (1.0 - 0.85 * trodden) * hRake + trodden * (fp + churn) + (1.0 - rakedAmt) * (1.0 - trodden) * churn * 0.6;
          // wind ripples on the dry upper beach outside the raked band
          h += (1.0 - rakedAmt) * smoothstep(52.0, 56.0, x) * (1.0 - smoothstep(100.0, 106.0, x)) * sin(dot(p, vec2(0.93, 0.37)) / 0.07 + big * 12.0) * 0.003;
          return h;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vWPos.xz;
          float x = p.x;
          float dist = length(vViewPosition);
          float rk, td;
          float h = relief(p, rk, td);
          odH = h;
          // micro-shadows: does the relief towards the sun stand above the sun's ray?
          float lod = smoothstep(9.0, 30.0, dist);
          if (lod < 1.0) {
            float r1, r2;
            float s = 0.0;
            for (int i = 1; i <= 3; i++) {
              float d = 0.035 * float(i);
              float hs = relief(p + SUNH * d, r1, r2);
              s = max(s, smoothstep(0.0, 0.01, hs - (h + d * TAN_EL)));
            }
            odMicro = mix(1.0 - 0.65 * s, 0.8 + 0.2 * (1.0 - rk * 0.5), lod);
          } else {
            odMicro = 0.8 + 0.2 * (1.0 - rk * 0.5);
          }
          // colour: pale, warm, a little patchy; greyer in the dunes
          float big = texture2D(uOdNoise, p * 0.015).g;
          float mid = texture2D(uOdNoise, p * 0.2).b;
          vec3 c = vec3(0.79, 0.72, 0.6) * (0.9 + 0.14 * big) * (0.96 + 0.06 * mid);
          c = mix(c * vec3(0.9, 0.88, 0.84), c, smoothstep(${X.beachW.toFixed(1)} - 4.0, ${X.beachW.toFixed(1)} + 4.0, x));
          // shell grit and dark specks
          float fine = texture2D(uOdNoise, p * 6.3).r;
          c *= 1.0 + 0.12 * smoothstep(0.86, 0.98, fine) - 0.1 * smoothstep(0.1, 0.02, fine);
          // wrack line along the berm: sargassum, dark olive-brown
          float wx = x - (${(X.berm + 1.5).toFixed(1)} + 1.6 * sin(p.y * 0.05) + 0.8 * sin(p.y * 0.17));
          float band = exp(-(wx * wx) / 2.2);
          // sargassum lies in torn, stringy mats along the band, not in dots
          float mats = texture2D(uOdNoise, p * vec2(0.55, 0.16)).g * 0.65 + texture2D(uOdNoise, p * vec2(1.9, 0.7) + 0.3).b * 0.35;
          float clumps = smoothstep(0.52, 0.66, mats) * smoothstep(0.3, 0.55, texture2D(uOdNoise, p * 0.05).g);
          float wrack = band * clumps;
          c = mix(c, vec3(0.13, 0.095, 0.045) * (0.8 + 0.4 * mid), wrack);
          c = mix(c, c * 0.88, band * 0.35);
          // wet sand below the swash line, mirror-glossy right after a wave drains
          vec2 wg = sandWet(p, uTime);
          c *= mix(1.0, 0.42, wg.x);
          c *= mix(vec3(1.0), vec3(0.9, 0.93, 1.0), wg.x);
          odRough = mix(0.95, 0.16, wg.x * wg.x);
          odRough = mix(odRough, 0.03, wg.y);
          // water fills the grooves: wet sand is smoother
          odH *= 1.0 - 0.8 * wg.x;
          odRough = mix(odRough, 0.9, wrack);
          diffuseColor.rgb = c;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = odRough;')
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
          float kk = 1.0 - smoothstep(6.0, 26.0, length(vViewPosition));
          normal = normalize(abs(det) * normal - grad * kk);
        }`,
      )
      .replace(
        '#include <lights_physical_pars_fragment>',
        `#include <lights_physical_pars_fragment>
        void RE_Direct_Sand( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
          IncidentLight l = directLight;
          l.color *= odMicro;
          RE_Direct_Physical( l, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Sand`,
      );
  };
  m.customProgramCacheKey = () => 'od-sand';
  return { mat: m, time };
}

/** Sand mesh from the dune edge to below the waterline. */
function sandGeometry(): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const x1 = X.shore + 18;
  const zs: number[] = [];
  for (let z = -1000; z <= 1000; ) {
    zs.push(z);
    z += Math.abs(z) < 430 ? 1 : 10;
  }
  const cols = 120;
  for (const z of zs) {
    const x0 = promenadeE(z) - 0.4;
    for (let i = 0; i <= cols; i++) {
      // denser near the dunes and the waterline
      const u = i / cols;
      const x = x0 + (x1 - x0) * u;
      pos.push(x, terrainHeight(x, z), z);
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

/** Sargassum clumps along the wrack line (3D, so they catch the light and throw little shadows). */
function wrackClumps(): InstancedMesh[] {
  const rng = new Rng(2626);
  const geo = new IcosahedronGeometry(1, 1);
  const mat = new MeshStandardMaterial({ roughness: 0.85, name: 'wrack' });
  const CH = 60;
  const out: InstancedMesh[] = [];
  for (let z0 = -960; z0 < 960; z0 += CH) {
    const n = 90;
    const im = new InstancedMesh(geo, mat, n);
    const m = new Matrix4();
    const q = new Quaternion();
    const col = new Color();
    for (let i = 0; i < n; i++) {
      const z = z0 + rng.range(0, CH);
      const x = X.berm + 1.5 + 1.6 * Math.sin(z * 0.05) + 0.8 * Math.sin(z * 0.17) + rng.gauss() * 0.9;
      const s = rng.range(0.06, 0.28);
      m.compose(new Vector3(x, terrainHeight(x, z) - s * 0.2, z), q.setFromAxisAngle(new Vector3(0, 1, 0), rng.range(0, 6.3)), new Vector3(s * rng.range(0.6, 1.2), s * 0.22, s * rng.range(1.6, 3.4)));
      im.setMatrixAt(i, m);
      col.setRGB(...lin(rng.pick(['#3b2a14', '#4a3818', '#2e2311', '#5a4520', '#3c3a1a'])));
      im.setColorAt(i, col);
    }
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    im.name = 'wrack';
    im.userData.z = z0 + CH / 2;
    out.push(im);
  }
  return out;
}

export interface Beach {
  meshes: (Mesh | InstancedMesh)[];
  update(t: number, cam?: Vector3): void;
}

export function buildBeach(): Beach {
  const { mat, time } = sandMaterial();
  const sand = new Mesh(sandGeometry(), mat);
  sand.name = 'sand';
  sand.receiveShadow = true;
  const wrack = wrackClumps();
  return {
    meshes: [sand, ...wrack],
    update(t: number, cam?: Vector3) {
      time.value = t;
      if (cam)
        for (const w of wrack) {
          const d = Math.abs(w.userData.z - cam.z);
          w.visible = d < 130;
          w.castShadow = d < 45;
        }
    },
  };
}
