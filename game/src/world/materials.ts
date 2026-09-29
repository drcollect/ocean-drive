// Shared materials. Stock PBR materials (so lights, shadows and haze all apply) with small shader
// injections for the procedural detail: weathered stucco, sky-reflecting windows with frames and interiors,
// striped awning canvas, tiled terraces.
import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import { noiseTexture } from '../textures/noise';

type Shader = WebGLProgramParametersWithUniforms;

/** Adds world position/normal varyings (works with instancing). */
function worldVaryings(shader: Shader): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        mat4 odM = modelMatrix;
        #ifdef USE_INSTANCING
          odM = modelMatrix * instanceMatrix;
        #endif
        vWPos = (odM * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(odM) * objectNormal);
      }`,
    );
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;');
}

function auxVarying(shader: Shader): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aux;\nvarying vec4 vAux;\nvarying vec2 vOdUv;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAux = aux;\nvOdUv = uv;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vAux;\nvarying vec2 vOdUv;');
}

const STUCCO_FRAG = /* glsl */ `
{
  vec3 wn = normalize(vWNrm);
  vec2 wuv = abs(wn.y) > 0.75 ? vWPos.xz : (abs(wn.x) > abs(wn.z) ? vWPos.zy : vWPos.xy);
  float mott = texture2D(uOdNoise, wuv * 0.021).g;
  float fine = texture2D(uOdNoise, wuv * 0.55).b;
  float grain = texture2D(uOdNoise, wuv * 3.1).r;
  float str = texture2D(uOdNoise, vec2(wuv.x * 0.62, wuv.y * 0.03 + 0.31)).g;
  float streaks = smoothstep(0.5, 0.74, str) * (0.5 + 0.5 * texture2D(uOdNoise, wuv * vec2(0.23, 0.05)).r);
  float base = 1.0 - smoothstep(0.05, 1.3, vWPos.y);
  vec3 c = diffuseColor.rgb;
  c *= 0.86 + 0.28 * mott;
  c *= 0.95 + 0.1 * fine;
  c *= 1.0 - uOdWeather * (0.22 * streaks + 0.08 * (1.0 - grain));
  // patch repairs: rectangles repainted a slightly different shade
  vec2 pc = floor(wuv / vec2(2.3, 1.7) + vec2(0.37, 0.0) * floor(wuv.y / 1.7));
  float ph = fract(sin(dot(pc, vec2(12.9898, 78.233))) * 43758.5453);
  c *= mix(1.0, 0.93 + 0.12 * fract(ph * 7.31), step(0.87, ph) * uOdWeather);
  // sun-bleached higher up, damp and grubby at the foot
  c *= mix(0.94, 1.03, smoothstep(2.0, 14.0, vWPos.y));
  c = mix(c, c * vec3(0.74, 0.72, 0.68), base * 0.55 * uOdWeather);
  diffuseColor.rgb = c;
  odBump = texture2D(uOdNoise, wuv * 1.9).b * 0.6 + texture2D(uOdNoise, wuv * 6.1).r * 0.4;
}
`;

/** Stucco relief from the same noise (three's perturbNormalArb), fading out with distance. */
const STUCCO_BUMP = /* glsl */ `
{
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  float dhx = dFdx(odBump);
  float dhy = dFdy(odBump);
  vec3 r1 = cross(dpy, normal);
  vec3 r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  float k = 0.035 * uOdWeather * (1.0 - smoothstep(12.0, 40.0, length(vViewPosition)));
  normal = normalize(abs(det) * normal - grad * k);
}
`;

function stuccoLike(params: { roughness: number; weather: number; name: string }): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: params.roughness, metalness: 0 });
  m.name = params.name;
  const noise = noiseTexture();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOdNoise = { value: noise };
    shader.uniforms.uOdWeather = { value: params.weather };
    worldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uOdNoise;\nuniform float uOdWeather;\nfloat odBump = 0.0;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + STUCCO_FRAG)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + STUCCO_BUMP);
  };
  m.customProgramCacheKey = () => 'od-stucco';
  return m;
}

/** Windows: frames and mullions from the window's own uv, curtains/blinds behind, the sky in front. */
function glassMaterial(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.05, metalness: 0, ior: 1.75, envMapIntensity: 1.15 });
  m.name = 'glass';
  m.onBeforeCompile = (shader) => {
    auxVarying(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float odFrame = 0.0;
        {
          float type = vAux.x;
          float ww = vAux.y;
          float wh = vAux.z;
          float seed = vAux.w;
          vec2 mm = vec2(vOdUv.x * ww, vOdUv.y * wh);
          float border = min(min(mm.x, ww - mm.x), min(mm.y, wh - mm.y));
          float fw = 0.05;
          odFrame = 1.0 - smoothstep(fw - 0.008, fw + 0.008, border);
          if (type < 0.5) {
            // pair of casements
            odFrame = max(odFrame, 1.0 - smoothstep(0.022, 0.034, abs(mm.x - ww * 0.5)));
          } else if (type < 1.5) {
            // Deco: horizontal muntins in three bands, one vertical
            float band = wh / 3.0;
            float hy = abs(mod(mm.y + band * 0.5, band) - band * 0.5);
            odFrame = max(odFrame, (1.0 - smoothstep(0.016, 0.026, hy)) * step(0.2, mm.y) * step(0.2, wh - mm.y));
            odFrame = max(odFrame, 1.0 - smoothstep(0.018, 0.028, abs(mm.x - ww * 0.5)));
          } else if (type < 2.5) {
            // storefront: one transom
            odFrame = max(odFrame, 1.0 - smoothstep(0.03, 0.042, abs(mm.y - wh * 0.78)));
          } else if (type < 3.5) {
            // glass block: milky squares
            vec2 g = abs(fract(mm / 0.19) - 0.5);
            float grout = 1.0 - smoothstep(0.43, 0.47, max(g.x, g.y));
            odFrame = max(odFrame, 1.0 - grout);
          } else {
            // porthole: ring frame
            float r = length(vOdUv - 0.5) * 2.0;
            odFrame = smoothstep(0.78, 0.84, r);
          }
          float h = fract(sin(seed * 91.37) * 4375.85);
          vec3 interior = vec3(0.012, 0.013, 0.016);
          if (h > 0.45) interior = vec3(0.16, 0.15, 0.13) * (0.5 + 0.5 * fract(h * 7.1));            // sheer curtain
          if (h > 0.72) {                                                                             // blinds
            float sl = step(0.5, fract(mm.y / 0.06));
            interior = mix(vec3(0.18, 0.17, 0.15), vec3(0.1, 0.095, 0.085), sl) * 0.8;
          }
          if (h > 0.9) interior = vec3(0.22, 0.13, 0.12) * 0.6;                                        // coloured drape
          if (type > 2.5 && type < 3.5) interior = vec3(0.5, 0.52, 0.5);
          diffuseColor.rgb = mix(interior, diffuseColor.rgb, odFrame);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.55, odFrame);
        if (vAux.x > 2.5 && vAux.x < 3.5) roughnessFactor = mix(0.25, 0.6, odFrame);`,
      );
  };
  m.customProgramCacheKey = () => 'od-glass';
  return m;
}

/** Striped canvas: stripes across the awning (uv.x in metres), second colour in aux.rgb, width in aux.a. */
function awningMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: DoubleSide });
  m.name = 'awning';
  const noise = noiseTexture();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOdNoise = { value: noise };
    auxVarying(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uOdNoise;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float w = max(vAux.a, 0.05);
          float s = step(0.5, fract(vOdUv.x / w));
          diffuseColor.rgb = mix(diffuseColor.rgb, vAux.rgb, s);
          float weave = texture2D(uOdNoise, vOdUv * vec2(3.0, 5.0)).b;
          diffuseColor.rgb *= 0.9 + 0.12 * weave;
          // sun-bleached top, dirtier hem
          diffuseColor.rgb *= mix(0.88, 1.04, smoothstep(0.0, 0.8, vOdUv.y));
        }`,
      );
  };
  m.customProgramCacheKey = () => 'od-awning';
  return m;
}

/** Terrace floor tiles, in world XZ. */
function tileMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  m.name = 'tiles';
  const noise = noiseTexture();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOdNoise = { value: noise };
    worldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uOdNoise;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vWNrm.y > 0.7) {
          vec2 t = vWPos.xz / 0.42;
          vec2 f = abs(fract(t) - 0.5);
          float grout = smoothstep(0.455, 0.49, max(f.x, f.y));
          vec2 id = floor(t);
          float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
          float checker = mod(id.x + id.y, 2.0);
          vec3 c = diffuseColor.rgb * (0.94 + 0.08 * h) * mix(1.0, 0.86, checker * step(0.5, fract(vWPos.y * 3.7)));
          c *= 0.92 + 0.12 * texture2D(uOdNoise, vWPos.xz * 0.7).b;
          diffuseColor.rgb = mix(c, c * 0.62, grout);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'od-tiles';
  return m;
}

export interface MatLib {
  stucco: MeshStandardMaterial;
  trim: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  metal: MeshStandardMaterial;
  letters: MeshStandardMaterial;
  awning: MeshStandardMaterial;
  tiles: MeshStandardMaterial;
  fabric: MeshStandardMaterial;
  plastic: MeshStandardMaterial;
  all(): Material[];
}

let lib: MatLib | null = null;

export function materials(): MatLib {
  if (lib) return lib;
  const stucco = stuccoLike({ roughness: 0.92, weather: 1, name: 'stucco' });
  const trim = stuccoLike({ roughness: 0.8, weather: 0.45, name: 'trim' });
  const glass = glassMaterial();
  const metal = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6, name: 'metal' });
  const letters = new MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.15, name: 'letters' });
  const awning = awningMaterial();
  const tiles = tileMaterial();
  const fabric = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: DoubleSide, name: 'fabric' });
  const plastic = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, name: 'plastic' });
  lib = {
    stucco,
    trim,
    glass,
    metal,
    letters,
    awning,
    tiles,
    fabric,
    plastic,
    all: () => [stucco, trim, glass, metal, letters, awning, tiles, fabric, plastic],
  };
  return lib;
}

/** sRGB hex → linear [r, g, b] */
export function lin(hex: string): [number, number, number] {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}
