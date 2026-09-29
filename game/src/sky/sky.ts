// The sky: the atmosphere is baked once into an equirect texture (the sun doesn't move), a second pass adds
// the long thin cloud streaks and a ground hemisphere for the environment map. The dome drawn behind the
// world samples the clear bake and draws the clouds live (they drift), the sun disc with limb darkening, and
// the haze near the horizon, so the sea and the far blocks melt into the same colour.
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { Quality } from '../quality';
import { hazeGLSL } from '../renderer/haze';
import { noiseTexture } from '../textures/noise';
import { atmosphereGLSL, R_E, SUN_DIR, skyConstants, vec3s } from './atmosphere';

export const EQUIRECT_GLSL = /* glsl */ `
vec2 equirectUvOf(vec3 d) {
  return vec2(atan(d.z, d.x) * 0.15915494309 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830988618 + 0.5);
}
vec3 dirOfEquirectUv(vec2 uv) {
  float phi = (uv.x - 0.5) * 6.28318530718;
  float th = (uv.y - 0.5) * 3.14159265359;
  return vec3(cos(th) * cos(phi), sin(th), cos(th) * sin(phi));
}
`;

/** GLSL constants describing the sun, shared by every custom shader. */
export function sunGLSL(): string {
  const c = skyConstants();
  return /* glsl */ `
#ifndef OD_SUN
#define OD_SUN
const vec3 SUN_DIR = ${vec3s([SUN_DIR.x, SUN_DIR.y, SUN_DIR.z])};
const vec3 SUN_IRR = ${vec3s(c.sunIrradiance)};
#endif
`;
}

function cloudsGLSL(): string {
  const c = skyConstants();
  const sunC = c.sunAtClouds.map((v) => v * 0.1);
  // shaded undersides: violet-lavender, a little brighter than the zenith they hang under
  const amb = [0, 1, 2].map((i) => c.zenith[i] * 1.05 + [0.13, 0.07, 0.1][i]);
  return /* glsl */ `
uniform sampler2D uNoise;
const vec3 CLOUD_SUN = ${vec3s(sunC)};
const vec3 CLOUD_AMB = ${vec3s(amb)};
const vec2 CLOUD_W = vec2(0.57358, -0.81915); // streaks run NNE–SSW: across the sun's line, not down the street
const vec2 CLOUD_SCALE = vec2(1.0 / 26000.0, 1.0 / 12000.0);
float cloudField(vec2 uv, float cover) {
  float n = texture(uNoise, uv).g * 0.62 + texture(uNoise, uv * vec2(2.3, 3.7) + 0.37).b * 0.38;
  n = (n - 0.5) * 2.6 + 0.5; // fbm bunches around 0.5: stretch it so coverage means something
  return smoothstep(1.0 - cover, 1.0 - cover + 0.28, n);
}
/** premultiplied cloud colour and alpha for a view direction */
vec4 cloudLayer(vec3 d, float t) {
  if (d.y <= 0.0) return vec4(0.0);
  const float RE = ${R_E.toFixed(1)};
  vec3 o = vec3(0.0, RE + 2.0, 0.0);
  float b = dot(o, d);
  float cc = dot(o, o) - (RE + 3400.0) * (RE + 3400.0);
  float hitT = -b + sqrt(b * b - cc);
  vec3 p = o + d * hitT;
  vec2 q = p.xz;
  vec2 r = vec2(dot(q, CLOUD_W), dot(q, vec2(-CLOUD_W.y, CLOUD_W.x)));
  vec2 uv = r * CLOUD_SCALE + vec2(t * 0.0000035, 0.13);
  float far = smoothstep(16000.0, 90000.0, hitT);
  float cover = mix(0.0, 0.47, far); // clear overhead, long thin bands low down
  float dens = cloudField(uv, cover);
  if (dens < 0.002) return vec4(0.0);
  vec2 sh = normalize(SUN_DIR.xz);
  vec2 shr = vec2(dot(sh, CLOUD_W), dot(sh, vec2(-CLOUD_W.y, CLOUD_W.x))) * CLOUD_SCALE;
  float occ = 0.0;
  for (int i = 1; i <= 4; i++) occ += cloudField(uv + shr * 300.0 * float(i * i), cover);
  float lit = exp(-occ * 1.25);
  float mu = dot(d, SUN_DIR);
  float hg = 0.64 / pow(1.36 - 1.2 * mu, 1.5) * 0.0795775;
  vec3 col = CLOUD_AMB * (1.0 - 0.3 * dens) + CLOUD_SUN * lit * lit * (0.22 + 7.0 * hg) * (1.0 - 0.55 * dens);
  float a = dens * 0.88;
  float ap = exp(-hitT / 150000.0);
  return vec4(col * a * ap, a * ap);
}
`;
}

export interface Sky {
  /** scattering only, equirect */
  clear: Texture;
  /** scattering + clouds + ground, equirect: for reflections */
  full: Texture;
  /** PMREM of `full` for scene.environment */
  env: Texture;
  dome: Mesh;
  update(time: number, camera: Camera): void;
}

function fullscreenScene(material: ShaderMaterial): { scene: Scene; cam: OrthographicCamera } {
  const scene = new Scene();
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { scene, cam: new OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}

export function buildSky(renderer: WebGLRenderer, q: Quality): Sky {
  const c = skyConstants();
  const W = q.tier === 'low' ? 768 : 1536;
  const H = W / 2;
  const opts = { type: HalfFloatType, magFilter: LinearFilter, minFilter: LinearFilter, generateMipmaps: false, depthBuffer: false };
  const clearRT = new WebGLRenderTarget(W, H, opts);
  const fullRT = new WebGLRenderTarget(W, H, opts);
  const noise = noiseTexture();

  // 1. scattering
  const bake = new ShaderMaterial({
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      #define PI 3.14159265359
      varying vec2 vUv;
      ${sunGLSL()}
      ${atmosphereGLSL()}
      ${EQUIRECT_GLSL}
      void main() {
        vec3 d = dirOfEquirectUv(vUv);
        // below the horizon store the horizon itself; the ground is added in the composite
        d.y = max(d.y, 0.0012);
        d = normalize(d);
        gl_FragColor = vec4(skyRadiance(d, SUN_DIR, 2.0), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const b = fullscreenScene(bake);
  renderer.setRenderTarget(clearRT);
  renderer.render(b.scene, b.cam);

  // 2. composite: clouds at t = 0 and the ground hemisphere
  const comp = new ShaderMaterial({
    uniforms: { uClear: { value: clearRT.texture }, uNoise: { value: noise } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      #define PI 3.14159265359
      varying vec2 vUv;
      uniform sampler2D uClear;
      ${sunGLSL()}
      ${hazeGLSL()}
      ${EQUIRECT_GLSL}
      ${cloudsGLSL()}
      const vec3 GROUND = ${vec3s(c.groundRadiance)};
      void main() {
        vec3 d = dirOfEquirectUv(vUv);
        vec3 col = texture2D(uClear, vUv).rgb;
        if (d.y > 0.0) {
          vec4 cl = cloudLayer(d, 0.0);
          col = col * (1.0 - cl.a) + cl.rgb;
          float T = exp(-HAZE_SIGMA * 45.0 / max(d.y, 0.004));
          col = mix(hazeColor(d), col, T);
        } else {
          // ground seen from 2 m: hazier towards the horizon
          float dist = 2.0 / max(-d.y, 0.002);
          float T = exp(-HAZE_SIGMA * dist);
          col = mix(hazeColor(d), GROUND, T);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const cs = fullscreenScene(comp);
  renderer.setRenderTarget(fullRT);
  renderer.render(cs.scene, cs.cam);
  renderer.setRenderTarget(null);
  bake.dispose();
  comp.dispose();

  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(fullRT.texture).texture;
  pmrem.dispose();

  // 3. the dome
  const tri = new BufferGeometry();
  tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const domeMat = new ShaderMaterial({
    uniforms: {
      uClear: { value: clearRT.texture },
      uNoise: { value: noise },
      uTime: { value: 0 },
      uInvProj: { value: null },
      uCamWorld: { value: null },
    },
    vertexShader: /* glsl */ `
      uniform mat4 uInvProj;
      uniform mat4 uCamWorld;
      varying vec3 vDir;
      void main() {
        vec4 v = uInvProj * vec4(position.xy, 1.0, 1.0);
        vDir = mat3(uCamWorld) * (v.xyz / v.w);
        gl_Position = vec4(position.xy, 0.99999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #define PI 3.14159265359
      uniform sampler2D uClear;
      uniform float uTime;
      varying vec3 vDir;
      ${sunGLSL()}
      ${hazeGLSL()}
      ${EQUIRECT_GLSL}
      ${cloudsGLSL()}
      void main() {
        vec3 d = normalize(vDir);
        vec3 dd = normalize(vec3(d.x, max(d.y, 0.0012), d.z));
        vec3 col = textureLod(uClear, equirectUvOf(dd), 0.0).rgb;
        vec4 cl = cloudLayer(dd, uTime);
        col = col * (1.0 - cl.a) + cl.rgb;
        float T = exp(-HAZE_SIGMA * 45.0 / max(d.y, 0.004));
        col = mix(hazeColor(d), col, T);
        // the sun: a hand's width over the sea, limb-darkened, behind the haze and the clouds
        float mu = dot(d, SUN_DIR);
        const float R = 0.00475;
        if (mu > cos(R * 1.6)) {
          float r = acos(clamp(mu, -1.0, 1.0)) / R;
          float disc = 1.0 - smoothstep(0.93, 1.07, r);
          float limb = 1.0 - 0.55 * (1.0 - sqrt(max(1.0 - r * r, 0.0)));
          vec3 sc = normalize(SUN_IRR) * 900.0;
          col += sc * disc * limb * T * (1.0 - cl.a * 0.85);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const dome = new Mesh(tri, domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.name = 'sky-dome';

  return {
    clear: clearRT.texture,
    full: fullRT.texture,
    env,
    dome,
    update(time: number, camera: Camera) {
      domeMat.uniforms.uTime.value = time;
      domeMat.uniforms.uInvProj.value = camera.projectionMatrixInverse;
      domeMat.uniforms.uCamWorld.value = camera.matrixWorld;
    },
  };
}

/** For the loader and diagnostics. */
export function sunColor(): Vector3 {
  const s = skyConstants().sunIrradiance;
  return new Vector3(s[0], s[1], s[2]);
}
