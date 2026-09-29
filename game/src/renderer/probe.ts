// A reflection probe at street level: the hotels, palms, park and sky as seen from the middle of Ocean
// Drive, rendered once into a cube map and prefiltered for glossy surfaces. The cars' paint, glass and chrome
// use it instead of the sky-only environment, so their flanks mirror the facades and palms, not an empty
// horizon. Taken after the first frames (the sun's shadow map has to exist), with the cars hidden.
import { CubeCamera, EquirectangularReflectionMapping, HalfFloatType, PMREMGenerator, WebGLCubeRenderTarget, type Object3D, type Scene, type Texture, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import type { Sky } from '../sky/sky';

export function captureProbe(renderer: WebGLRenderer, scene: Scene, sky: Sky, x: number, y: number, z: number, hide: Object3D[]): Texture {
  const rt = new WebGLCubeRenderTarget(256, { type: HalfFloatType });
  const cam = new CubeCamera(0.3, 6000, rt);
  cam.position.set(x, y, z);
  cam.updateMatrixWorld(true);
  // the dome is drawn with the view camera's matrices, so the cube faces get the baked sky as background
  const background = scene.background;
  const mapping = sky.full.mapping;
  const autoClear = renderer.autoClear;
  const shown = hide.map((o) => o.visible);
  sky.full.mapping = EquirectangularReflectionMapping;
  scene.background = sky.full;
  sky.dome.visible = false;
  hide.forEach((o) => (o.visible = false));
  renderer.autoClear = true;
  cam.update(renderer, scene);
  renderer.autoClear = autoClear;
  hide.forEach((o, i) => (o.visible = shown[i]));
  sky.dome.visible = true;
  scene.background = background;
  sky.full.mapping = mapping;
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromCubemap(rt.texture);
  pmrem.dispose();
  rt.dispose();
  targets.set(target.texture, target);
  return target.texture;
}

const targets = new Map<Texture, WebGLRenderTarget>();
/** Free a capture that is no longer used. */
export function releaseProbe(tex: Texture): void {
  targets.get(tex)?.dispose();
  targets.delete(tex);
}
