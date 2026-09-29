// One wind field for everything that moves in the breeze: fronds, flags, umbrellas, and the wind sound.
// A light sea breeze from the ESE with gusts that roll across the district. Same formula in GLSL and JS.
import { Vector3 } from 'three';

/** direction the air moves (towards the WNW) */
export const WIND_DIR = new Vector3(-0.92, 0, -0.39).normalize();
export const WIND_STRENGTH = 0.42;

export const WIND_GLSL = /* glsl */ `
const vec3 WIND_DIR = vec3(${WIND_DIR.x.toFixed(5)}, 0.0, ${WIND_DIR.z.toFixed(5)});
const float WIND_STRENGTH = ${WIND_STRENGTH.toFixed(3)};
float windGust(vec2 p, float t) {
  float a = sin(dot(p, WIND_DIR.xz) * 0.034 - t * 0.83);
  float b = sin(dot(p, vec2(0.37, -0.93)) * 0.021 + t * 0.31);
  float c = sin(dot(p, vec2(-0.6, 0.8)) * 0.057 - t * 1.37);
  return clamp(0.55 + 0.3 * a * b + 0.18 * c, 0.1, 1.2);
}
vec3 windAt(vec3 p, float t) {
  return WIND_DIR * (WIND_STRENGTH * windGust(p.xz, t));
}
`;

export function windGust(x: number, z: number, t: number): number {
  const a = Math.sin((x * WIND_DIR.x + z * WIND_DIR.z) * 0.034 - t * 0.83);
  const b = Math.sin((x * 0.37 - z * 0.93) * 0.021 + t * 0.31);
  const c = Math.sin((-x * 0.6 + z * 0.8) * 0.057 - t * 1.37);
  return Math.min(1.2, Math.max(0.1, 0.55 + 0.3 * a * b + 0.18 * c));
}
