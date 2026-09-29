// What every world module gets: the scene, the quality tier, the sky (for reflections), and a place to
// register per-frame updates.
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Quality } from '../quality';
import type { Sky } from '../sky/sky';

export type Updater = (t: number, dt: number) => void;

export interface Ctx {
  scene: Scene;
  q: Quality;
  sky: Sky;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  /** called every frame with scene time and step (s) */
  updaters: Updater[];
}
