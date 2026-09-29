// The street: weathered asphalt with faded double yellow lines, parking lines and continental crosswalks,
// concrete sidewalks with scored joints and stains, curbs, the six cross streets, and the lot ground the
// hotels stand on. Everything is drawn in world space by the shaders, so it runs on into the far blocks.
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { GeoBuilder } from '../core/builder';
import { noiseTexture } from '../textures/noise';
import { CROSS_HALF, CROSS_ROAD_HALF, CROSS_Z, SIDEWALK_Y, terrainHeight, X } from './layout';
import { lin } from './materials';

const REACH = 1000; // how far the street runs each way
const WEST = -440; // how far the cross streets run
const STEP = CROSS_Z[1] - CROSS_Z[0];

type Shader = WebGLProgramParametersWithUniforms;

function worldVaryings(shader: Shader): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;');
}

/** Distance-faded bump from a height value (three's perturbNormalArb). */
const BUMP = (k: string) => /* glsl */ `
{
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  float dhx = dFdx(odH);
  float dhy = dFdy(odH);
  vec3 r1 = cross(dpy, normal);
  vec3 r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  float kk = ${k} * (1.0 - smoothstep(8.0, 45.0, length(vViewPosition)));
  normal = normalize(abs(det) * normal - grad * kk);
}
`;

const CROSS_GLSL = /* glsl */ `
const float CROSS0 = ${CROSS_Z[0].toFixed(3)};
const float CROSS_STEP = ${STEP.toFixed(4)};
float crossZ(float z) { return CROSS0 + floor((z - CROSS0) / CROSS_STEP + 0.5) * CROSS_STEP; }
`;

function asphaltMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, name: 'asphalt' });
  const noise = noiseTexture();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOdNoise = { value: noise };
    worldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uOdNoise;\nfloat odH = 0.0;\nfloat odPaint = 0.0;\n${CROSS_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vWPos.xz;
          float agg = texture2D(uOdNoise, p * 1.9).b;
          float fine = texture2D(uOdNoise, p * 7.3).r;
          float big = texture2D(uOdNoise, p * 0.045).g;
          float mid = texture2D(uOdNoise, p * 0.31).g;
          // worn, sun-greyed asphalt: large blotches, little grain
          vec3 c = vec3(0.13, 0.126, 0.121) * (0.82 + 0.36 * big) * (0.9 + 0.18 * mid) * (0.97 + 0.06 * agg);
          // a few light aggregate specks, faded out at distance so they don't sparkle
          float spk = smoothstep(0.84, 0.97, fine) * (1.0 - smoothstep(4.0, 16.0, length(vViewPosition)));
          c += vec3(0.035) * spk;
          float cz = crossZ(p.y);
          bool main = abs(p.x) < ${X.curbE.toFixed(1)};
          float along = main ? p.x : p.y - cz;       // across-the-road coordinate
          // polished, darker wheel paths
          float wheel = main ? (smoothstep(0.9, 0.2, abs(abs(p.x) - 1.55)) + smoothstep(0.9, 0.2, abs(abs(p.x) - 3.25))) : smoothstep(1.2, 0.2, abs(abs(along) - 2.0));
          c *= 1.0 - 0.13 * wheel;
          // repair patches: darker, sharper rectangles
          vec2 pc = floor(p / vec2(2.7, 4.3));
          float ph = fract(sin(dot(pc, vec2(41.3, 289.1))) * 43758.5453);
          c *= mix(1.0, 0.78, step(0.93, ph));
          // oil stains in the parking lanes
          if (main && abs(p.x) > 4.6) {
            float oil = smoothstep(0.62, 0.8, texture2D(uOdNoise, p * vec2(0.55, 0.3)).a) * smoothstep(0.35, 0.7, texture2D(uOdNoise, p * 0.13).g);
            c *= 1.0 - 0.45 * oil;
          }
          // cracks
          float cr = texture2D(uOdNoise, p * 0.17).g;
          float crack = (1.0 - smoothstep(0.0, 0.006, abs(cr - 0.5))) * smoothstep(0.55, 0.75, texture2D(uOdNoise, p * 0.031).r);
          crack *= 1.0 - smoothstep(6.0, 30.0, length(vViewPosition));
          c *= 1.0 - 0.35 * crack;
          // ---- paint
          float wear = smoothstep(0.25, 0.75, texture2D(uOdNoise, p * vec2(0.9, 0.35)).g * 0.7 + fine * 0.3);
          vec3 yellow = vec3(0.78, 0.55, 0.12);
          vec3 white = vec3(0.72, 0.71, 0.68);
          float paintY = 0.0;
          float paintW = 0.0;
          bool nearCross = abs(p.y - cz) < ${CROSS_HALF.toFixed(1)} + 3.0;
          if (main) {
            // double yellow centre line (broken at the crosswalks)
            float d = abs(abs(p.x) - 0.15);
            paintY = (1.0 - smoothstep(0.045, 0.06, d)) * (nearCross ? 0.0 : 1.0);
            // parking lane line
            paintW = (1.0 - smoothstep(0.05, 0.065, abs(abs(p.x) - 4.65))) * (nearCross ? 0.0 : 1.0);
            // stall ticks
            float tick = 1.0 - smoothstep(0.05, 0.065, abs(fract(p.y / 6.6) * 6.6 - 3.3));
            paintW = max(paintW, tick * step(4.65, abs(p.x)) * step(abs(p.x), 6.2) * (nearCross ? 0.0 : 1.0));
            // continental crosswalk across Ocean Drive at every cross street
            float zc = p.y - cz;
            if (abs(zc) < 2.2 && abs(p.x) < 6.6) {
              float bar = 1.0 - smoothstep(0.26, 0.3, abs(fract((p.x + 0.3) / 1.2) * 1.2 - 0.6));
              paintW = max(paintW, bar);
            }
            // stop bars
            if (abs(zc - 3.3) < 0.22 && p.x < 0.0 && p.x > -4.6) paintW = 1.0;
            if (abs(zc + 3.3) < 0.22 && p.x > 0.0 && p.x < 4.6) paintW = 1.0;
          } else {
            // cross street: dashed yellow centre, crosswalk at its mouth
            paintY = (1.0 - smoothstep(0.05, 0.065, abs(along))) * step(0.5, fract(p.x / 6.0)) * step(p.x, -12.0);
            if (p.x > -12.2 && p.x < -8.3) {
              float bar = 1.0 - smoothstep(0.26, 0.3, abs(fract((along + 0.3) / 1.2) * 1.2 - 0.6));
              paintW = max(paintW, bar * step(abs(along), ${(CROSS_ROAD_HALF - 0.3).toFixed(1)}));
            }
          }
          paintY *= wear;
          paintW *= wear * 0.95;
          c = mix(c, yellow * (0.85 + 0.15 * agg), paintY);
          c = mix(c, white * (0.88 + 0.12 * agg), paintW);
          odPaint = max(paintY, paintW);
          diffuseColor.rgb = c;
          odH = agg * 0.5 + mid * 0.4 - crack * 0.25;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.93, 0.62, odPaint);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + BUMP('0.018'));
  };
  m.customProgramCacheKey = () => 'od-asphalt';
  return m;
}

function concreteMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, name: 'concrete' });
  const noise = noiseTexture();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOdNoise = { value: noise };
    worldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uOdNoise;\nfloat odH = 0.0;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vWPos.xz;
          vec3 c = diffuseColor.rgb;
          float big = texture2D(uOdNoise, p * 0.06).g;
          float fine = texture2D(uOdNoise, p * 3.1).b;
          c *= 0.86 + 0.24 * big;
          c *= 0.97 + 0.05 * fine;
          float upness = dot(normalize(vNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
          if (upness > 0.5) {
            // slabs 1.5 m, scored joints, a slightly different shade per slab
            vec2 s = p / vec2(1.5, 1.5);
            vec2 f = abs(fract(s) - 0.5);
            float joint = smoothstep(0.475, 0.495, max(f.x, f.y));
            float sh = fract(sin(dot(floor(s), vec2(12.9898, 78.233))) * 43758.5453);
            c *= 0.93 + 0.12 * sh;
            c *= 1.0 - 0.28 * joint;
            // gum spots and stains
            float gum = smoothstep(0.9, 0.97, texture2D(uOdNoise, p * 1.3).a);
            c *= 1.0 - 0.35 * gum;
            float stain = smoothstep(0.55, 0.85, texture2D(uOdNoise, p * 0.23 + 0.5).g);
            c *= 1.0 - 0.18 * stain;
            odH = fine * 0.25 - joint * 0.7;
          }
          diffuseColor.rgb = c;
        }`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + BUMP('0.02'));
  };
  m.customProgramCacheKey = () => 'od-concrete';
  return m;
}

/** Grid strip of the road with its crown. */
function roadGeometry(): BufferGeometry {
  const xs = [-7, -6.4, -4.65, -3, -1.5, 0, 1.5, 3, 4.65, 6.4, 7];
  const pos: number[] = [];
  const idx: number[] = [];
  const zs: number[] = [];
  for (let z = -REACH; z <= REACH; z += Math.abs(z) < 420 ? 4 : 20) zs.push(z);
  for (const z of zs) for (const x of xs) pos.push(x, terrainHeight(x, z), z);
  const n = xs.length;
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

export function buildStreet(): Mesh[] {
  const asphalt = asphaltMaterial();
  const concrete = concreteMaterial();
  const out: Mesh[] = [];
  const road = new Mesh(roadGeometry(), asphalt);
  road.name = 'ocean-drive';
  road.receiveShadow = true;
  out.push(road);

  // cross streets (district and beyond), west from the Ocean Drive curb
  const cross = new GeoBuilder();
  const walks = new GeoBuilder();
  const curbs = new GeoBuilder();
  const conc = lin('#bdb5aa');
  const concDark = lin('#a39b90');
  walks.setColor(conc);
  curbs.setColor(lin('#c8c1b6'));
  const czs: number[] = [];
  for (let cz = CROSS_Z[0]; cz > -REACH; cz -= STEP) czs.push(cz);
  for (let cz = CROSS_Z[0] + STEP; cz < REACH; cz += STEP) czs.push(cz);
  czs.sort((a, b) => a - b);
  for (const cz of czs) {
    cross.box(WEST, -0.2, cz - CROSS_ROAD_HALF, X.curbW, 0, cz + CROSS_ROAD_HALF, ['ny', 'nx', 'px', 'pz', 'nz']);
    // sidewalks along the cross street, and their curbs
    for (const s of [-1, 1]) {
      const z0 = cz + s * CROSS_ROAD_HALF;
      const z1 = cz + s * CROSS_HALF;
      walks.box(WEST, 0, Math.min(z0, z1), X.terraceEdge, SIDEWALK_Y, Math.max(z0, z1), ['ny', 'nx', 'px']);
    }
  }
  // west sidewalk, between the cross streets (the cross street mouths get a kerb ramp at road level)
  const bounds = [-REACH, ...czs.flatMap((c) => [c - CROSS_ROAD_HALF, c + CROSS_ROAD_HALF]), REACH];
  for (let i = 0; i < bounds.length; i += 2) {
    const z0 = bounds[i];
    const z1 = bounds[i + 1];
    walks.box(X.terraceEdge, 0, z0, X.curbW, SIDEWALK_Y, z1, ['ny']);
    // curb face and a slightly lighter curb top
    curbs.box(X.curbW - 0.3, SIDEWALK_Y - 0.004, z0, X.curbW, SIDEWALK_Y + 0.004, z1, ['ny']);
  }
  for (const cz of czs) {
    walks.setColor(concDark);
    walks.box(X.terraceEdge, -0.1, cz - CROSS_ROAD_HALF, X.curbW, 0.02, cz + CROSS_ROAD_HALF, ['ny']);
    walks.setColor(conc);
  }
  // east sidewalk
  walks.box(X.curbE, 0, -REACH, X.parkW, SIDEWALK_Y, REACH, ['ny', 'px']);
  curbs.box(X.curbE, SIDEWALK_Y - 0.004, -REACH, X.curbE + 0.3, SIDEWALK_Y + 0.004, REACH, ['ny']);
  // ground under and between the hotel lots (not over the cross streets)
  walks.setColor(concDark);
  const lotBounds = [-REACH, ...czs.flatMap((c) => [c - CROSS_HALF, c + CROSS_HALF]), REACH];
  for (let i = 0; i < lotBounds.length; i += 2) walks.box(WEST, -0.2, lotBounds[i], X.terraceEdge, SIDEWALK_Y - 0.01, lotBounds[i + 1], ['ny', 'nx', 'px']);

  const cm = new Mesh(cross.build(), asphalt);
  cm.name = 'cross-streets';
  cm.receiveShadow = true;
  const wm = new Mesh(walks.build(), concrete);
  wm.name = 'sidewalks';
  wm.receiveShadow = true;
  const km = new Mesh(curbs.build(), concrete);
  km.name = 'curbs';
  km.receiveShadow = true;
  out.push(cm, wm, km);
  return out;
}
