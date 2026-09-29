// The city behind and beyond: Collins Avenue's taller hotels behind the Ocean Drive row, and the hazy
// high-rise skyline up and down the beach. Simple masses with windows drawn in the shader; the haze does
// the rest. One or two draw calls in all.
import { Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { GeoBuilder } from '../core/builder';
import { Rng } from '../core/rng';
import { CROSS_Z, X } from './layout';
import { lin } from './materials';

function farMaterial(style: 'deco' | 'tower'): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, name: `far-${style}` });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFWPos;\nvarying vec3 vFWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    const deco = style === 'deco';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFWPos;\nvarying vec3 vFWNrm;\nfloat odWin = 0.0;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 wn = normalize(vFWNrm);
          if (abs(wn.y) < 0.5) {
            float u = abs(wn.x) > abs(wn.z) ? vFWPos.z : vFWPos.x;
            vec2 cell = vec2(u / ${deco ? '2.8' : '3.4'}, (vFWPos.y - 0.4) / ${deco ? '3.1' : '3.0'});
            vec2 fc = fract(cell);
            ${deco ? 'odWin = step(0.2, fc.x) * step(fc.x, 0.78) * step(0.3, fc.y) * step(fc.y, 0.78);' : 'odWin = step(0.04, fc.x) * step(fc.x, 0.96) * step(0.26, fc.y) * step(fc.y, 0.97);'}
            odWin *= step(4.4, vFWPos.y);
            float h = fract(sin(dot(floor(cell), vec2(12.9898, 78.233))) * 43758.5453);
            vec3 glass = ${deco ? 'vec3(0.05, 0.055, 0.06) + 0.08 * h' : 'vec3(0.12, 0.16, 0.19) + 0.05 * h'};
            diffuseColor.rgb = mix(diffuseColor.rgb, glass, odWin);
          }
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.34, odWin);');
  };
  m.customProgramCacheKey = () => `od-far-${style}`;
  return m;
}

const DECO_COLORS = ['#f3efe6', '#f4e7cf', '#f2d7cf', '#dfe8e3', '#e9e1ee', '#f3e2b8', '#f0dccb', '#e6e6e2'];
const TOWER_COLORS = ['#f4f2ec', '#ecebe6', '#e9e4d8', '#f1ede4', '#dcdfe0'];

/** A stepped Deco top on a mass (x0..x1, z0..z1) at height h. */
function stepTop(b: GeoBuilder, x0: number, z0: number, x1: number, z1: number, h: number, rng: Rng): void {
  let y = h;
  let ix = 0;
  let iz = 0;
  for (let s = 0; s < rng.int(1, 3); s++) {
    ix += (x1 - x0) * 0.14;
    iz += (z1 - z0) * 0.14;
    const hh = rng.range(1.5, 3.5);
    b.box(x0 + ix, y, z0 + iz, x1 - ix, y + hh, z1 - iz);
    y += hh;
  }
}

export function buildFarCity(): Mesh[] {
  const rng = new Rng(4242);
  const deco = new GeoBuilder();
  const tower = new GeoBuilder();
  const streetStep = CROSS_Z[1] - CROSS_Z[0];
  const onCross = (z: number, pad: number) => {
    const k = Math.round((z - CROSS_Z[0]) / streetStep);
    const cz = CROSS_Z[0] + k * streetStep;
    return Math.abs(z - cz) < 8.5 + pad;
  };

  // Collins Avenue rows behind the hotels (skipping the cross streets)
  for (const [xa, xb, hMin, hMax] of [
    [-57, -84, 9, 38],
    [-98, -132, 14, 58],
  ] as [number, number, number, number][]) {
    let z = -1150;
    while (z < 1150) {
      const w = rng.range(14, 38);
      const z0 = z;
      const z1 = z + w;
      z += w + rng.range(0, 4);
      if (onCross(z0, 0) || onCross(z1, 0) || onCross((z0 + z1) / 2, 0)) continue;
      const x1 = xa - rng.range(0, 3);
      const x0 = xb + rng.range(-3, 5);
      const tall = rng.chance(0.12);
      const h = tall ? rng.range(hMax, hMax * 1.8) : rng.range(hMin, hMax);
      const b = tall && rng.chance(0.6) ? tower : deco;
      b.setColor(lin(rng.pick(b === tower ? TOWER_COLORS : DECO_COLORS)));
      b.box(x0, 0, z0, x1, h, z1);
      if (b === deco && rng.chance(0.45)) stepTop(b, x0, z0, x1, z1, h, rng);
    }
  }

  // the skyline: mid-beach towers to the north, South Pointe to the south
  for (const [za, zb, n, xMin, xMax, hMin, hMax] of [
    [-1350, -3600, 22, -320, 70, 45, 165],
    [1250, 2300, 9, -330, 20, 55, 150],
  ] as [number, number, number, number, number, number, number][]) {
    for (let i = 0; i < n; i++) {
      const z = za + ((zb - za) * (i + rng.range(0.1, 0.9))) / n;
      const x = rng.range(xMin, xMax);
      const w = rng.range(22, 44);
      const d = rng.range(18, 34);
      const h = rng.range(hMin, hMax);
      tower.setColor(lin(rng.pick(TOWER_COLORS)));
      tower.box(x - d / 2, 0, z - w / 2, x + d / 2, h, z + w / 2);
      if (rng.chance(0.4)) tower.box(x - d / 2 + 3, h, z - w / 2 + 3, x + d / 2 - 3, h + rng.range(3, 8), z + w / 2 - 3);
    }
  }

  const out: Mesh[] = [];
  for (const [b, style] of [
    [deco, 'deco'],
    [tower, 'tower'],
  ] as [GeoBuilder, 'deco' | 'tower'][]) {
    const m = new Mesh(b.build(), farMaterial(style));
    m.name = `far-${style}`;
    m.castShadow = false;
    m.receiveShadow = false;
    out.push(m);
  }

  // a dull apron under everything beyond the modelled ground
  const g = new PlaneGeometry(8000, 8000);
  g.rotateX(-Math.PI / 2);
  g.translate(X.shore - 4000, -0.06, 0);
  const apronMat = new MeshStandardMaterial({ roughness: 1 });
  apronMat.color.setRGB(...lin('#8d8577'));
  const apron = new Mesh(g, apronMat);
  apron.name = 'apron';
  apron.receiveShadow = false;
  out.push(apron);
  return out;
}
