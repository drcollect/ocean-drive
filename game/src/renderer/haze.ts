// Humid aerial haze. Three's fog chunks are replaced once at startup so every built-in material fades into
// the same haze, whose colour is the sky's own horizon colour in that direction (from the atmosphere model):
// warm gold towards the sun, peach and lavender-grey away from it. Distant blocks go soft and warm and meet
// the sky without a hard horizon. Custom shaders include HAZE_GLSL and call applyHaze() themselves.
import { ShaderChunk } from 'three';
import { HAZE_ANGLES, SUN_DIR, skyConstants, vec3s } from '../sky/atmosphere';

/** extinction at ground level, 1/m */
export const HAZE_SIGMA = 0.00078;
/** scale height of the humid layer, m */
export const HAZE_H = 170;

const n = (v: number) => v.toPrecision(7);

let glsl = '';

export function hazeGLSL(): string {
  if (glsl) return glsl;
  const c = skyConstants();
  const sx = new Float32Array([SUN_DIR.x, SUN_DIR.z]);
  const l = Math.hypot(sx[0], sx[1]);
  const ang = HAZE_ANGLES.map((d) => n((d * Math.PI) / 180)).join(', ');
  const cols = c.hazeTable.map((v) => vec3s(v)).join(', ');
  glsl = /* glsl */ `
#ifndef OD_HAZE
#define OD_HAZE
const vec2 HAZE_SUN_XZ = vec2(${n(sx[0] / l)}, ${n(sx[1] / l)});
const float HAZE_SIGMA = ${n(HAZE_SIGMA)};
const float HAZE_H = ${n(HAZE_H)};
const float HAZE_ANG[10] = float[10](${ang});
const vec3 HAZE_COL[10] = vec3[10](${cols});

vec3 hazeColor(vec3 dir) {
  vec2 h = dir.xz;
  float l = length(h);
  float c = l > 1e-5 ? dot(h / l, HAZE_SUN_XZ) : 0.0;
  float a = acos(clamp(c, -1.0, 1.0));
  vec3 col = HAZE_COL[9];
  for (int i = 0; i < 9; i++) {
    if (a < HAZE_ANG[i + 1]) {
      float t = (a - HAZE_ANG[i]) / (HAZE_ANG[i + 1] - HAZE_ANG[i]);
      col = mix(HAZE_COL[i], HAZE_COL[i + 1], t);
      break;
    }
  }
  return col;
}

/** optical depth of the humid layer along v (camera → point), camera at height camY */
float hazeDepth(vec3 v, float camY) {
  float d = length(v);
  float h0 = max(camY, 0.0);
  float h1 = max(camY + v.y, 0.0);
  float dh = h1 - h0;
  float avg = abs(dh) > 0.05 ? HAZE_H * (exp(-h0 / HAZE_H) - exp(-h1 / HAZE_H)) / dh : exp(-h0 / HAZE_H);
  return HAZE_SIGMA * d * avg;
}

vec3 applyHaze(vec3 col, vec3 v, float camY) {
  float T = exp(-hazeDepth(v, camY));
  return mix(hazeColor(v / max(length(v), 1e-4)), col, T);
}
#endif
`;
  return glsl;
}

/** Replace three's fog with the haze. Call before any material compiles; set scene.fog to any Fog to enable. */
export function installHaze(): void {
  ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vHazeVec;
#endif
`;
  ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vHazeVec = transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif
`;
  ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vHazeVec;
  ${hazeGLSL()}
#endif
`;
  ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = applyHaze(gl_FragColor.rgb, vHazeVec, cameraPosition.y);
#endif
`;
}
