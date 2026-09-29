// Dress a Collect car GLB in a Drop 01 look: paint (solid, metallic, pearl that shifts with the view angle,
// two-tone with a chrome line, liquid-metal specials that flip colour), the eight patterns drawn in the
// car's own space (split, twin stripe, circuit, topographic, hex, glitch, monogram), the finish, the light
// colour on the strips and wheel rings, and the wheel finish on rims, spokes and discs.
// The spec names the Ultra Rare two-tones without hexes; those and each pattern's accent colour are
// render choices, not drop data.
import { Box3, Color, MeshPhysicalMaterial, MeshStandardMaterial, Vector3, Vector4, type Material, type Mesh, type Object3D, type Texture } from 'three';
import { lin } from '../world/materials';
import type { Car, FinishId, PatternId, WheelId } from './drop01';

const col = (h: string) => new Color().setRGB(...lin(h));
const lum = (h: string) => {
  const c = new Color(h);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

const PATTERN_CODE: Record<PatternId, number> = { none: 0, split: 1, twin: 2, circuit: 3, topo: 4, hex: 5, glitch: 6, monogram: 7 };
const KIND_CODE = { solid: 0, metallic: 1, pearl: 2, twotone: 3, special: 4 } as const;

interface FinishParams {
  r: number;
  m: number;
  cc: number;
  ccr: number;
  flake?: boolean;
  brushed?: boolean;
  trim?: string;
}
export const FINISH: Record<FinishId, FinishParams> = {
  Gloss: { r: 0.3, m: 0, cc: 1, ccr: 0.04 },
  Satin: { r: 0.5, m: 0, cc: 0.3, ccr: 0.38 },
  Matte: { r: 0.8, m: 0, cc: 0, ccr: 0 },
  Metallic: { r: 0.3, m: 0.65, cc: 1, ccr: 0.04 },
  'Satin Metallic': { r: 0.44, m: 0.6, cc: 0.35, ccr: 0.32 },
  Brushed: { r: 0.36, m: 0.85, cc: 0, ccr: 0, brushed: true },
  'Pearl Gloss': { r: 0.26, m: 0.25, cc: 1, ccr: 0.03 },
  'Pearl Satin': { r: 0.46, m: 0.25, cc: 0.4, ccr: 0.3 },
  'Chrome Trim': { r: 0.28, m: 0.2, cc: 1, ccr: 0.03, trim: '#E9EBEE' },
  'Black Chrome Trim': { r: 0.28, m: 0.2, cc: 1, ccr: 0.03, trim: '#2A2C31' },
  'Gold Chrome Trim': { r: 0.28, m: 0.2, cc: 1, ccr: 0.03, trim: '#DDB05A' },
  'Liquid Metal': { r: 0.07, m: 1, cc: 0.35, ccr: 0.02 },
  'Prism Flake': { r: 0.32, m: 0.7, cc: 1, ccr: 0.03, flake: true },
};

export const WHEEL: Record<Exclude<WheelId, 'Body Colour'>, { c: string; m: number; r: number; cc?: number; irid?: boolean }> = {
  'Gloss Black': { c: '#0F1012', m: 0.3, r: 0.16, cc: 1 },
  'Satin Black': { c: '#151618', m: 0.3, r: 0.5 },
  Silver: { c: '#C9CDD2', m: 1, r: 0.22 },
  Gunmetal: { c: '#4A4F57', m: 1, r: 0.3 },
  White: { c: '#ECECE8', m: 0, r: 0.3, cc: 0.6 },
  Bronze: { c: '#8E6A3C', m: 1, r: 0.3 },
  'Anodised Red': { c: '#A8141C', m: 1, r: 0.25 },
  'Anodised Blue': { c: '#1D4FB8', m: 1, r: 0.25 },
  Chrome: { c: '#EEF0F2', m: 1, r: 0.04 },
  'Black Chrome': { c: '#26282C', m: 1, r: 0.06 },
  Gold: { c: '#D9AA48', m: 1, r: 0.12 },
  Iridescent: { c: '#D3D7DD', m: 1, r: 0.1, irid: true },
};

/** The pattern's colour: the first candidate that stands out from the paint (a render choice). */
function accentOf(car: Car): string {
  const p = car.looks.paint;
  const base = p.hex;
  const shade = lum(base) > 0.42 ? '#17191D' : '#F1F2F4';
  const cands =
    car.tier.id === 'ultra' ? [car.looks.lightHex, shade] : p.kind === 'special' || p.kind === 'pearl' ? [p.hex2!, car.looks.lightHex, shade] : [shade];
  return cands.find((c) => Math.abs(lum(c) - lum(base)) > 0.22) ?? shade;
}

const GLSL_HELPERS = /* glsl */ `
float dHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float dLine(float d, float halfW) { float w = fwidth(d) + 1e-4; return 1.0 - smoothstep(halfW - w, halfW + w, abs(d)); }
// distance to the nearest hex cell edge (0 on the edge), cells about s wide
float dHex(vec2 p, float s) {
  p /= s;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  g = abs(g);
  return (0.5 - max(dot(g, normalize(vec2(1.0, 1.7320508))), g.x)) * s;
}
// one projection of a 2D pattern (u along the car, v up or across)
float dPattern2(float pat, vec2 uv, float seed) {
  if (pat < 3.5 && pat > 2.5) {
    // circuit: traces along a grid, jogging between cells, with node pads
    vec2 c = floor(uv / 0.075);
    vec2 f = fract(uv / 0.075) - 0.5;
    float h = dHash2(c + seed);
    float m = 0.0;
    if (h < 0.24) m = dLine(f.y * 0.075, 0.0032);
    else if (h < 0.4) m = dLine(f.x * 0.075, 0.0032);
    else if (h < 0.5) m = max(dLine(f.y * 0.075, 0.0032) * step(f.x, 0.0), dLine(f.x * 0.075, 0.0032) * step(0.0, f.y));
    float pad = step(0.86, dHash2(c * 1.7 + seed + 3.1)) * step(h, 0.5);
    m = max(m, pad * (1.0 - smoothstep(0.011, 0.011 + fwidth(uv.x) * 1.5, length(f * 0.075))));
    return m;
  }
  if (pat < 5.5 && pat > 4.5) return dLine(dHex(uv, 0.11), 0.004);
  if (pat > 6.5) {
    // monogram: a repeating Collect 'C' with a dot, staggered rows
    vec2 q = uv / 0.24;
    float row = floor(q.y);
    q.x += mod(row, 2.0) * 0.5;
    vec2 f = (fract(q) - 0.5) * 0.24;
    float r = length(f);
    float ring = dLine(r - 0.062, 0.011);
    float open = step(0.0, f.x) * step(abs(f.y), 0.03);
    float dot0 = 1.0 - smoothstep(0.013, 0.013 + fwidth(uv.x) * 1.5, r);
    return max(ring * (1.0 - open), dot0);
  }
  return 0.0;
}
`;

export interface Dressed {
  /** every material made for this car (so the caller can swap env maps) */
  materials: Material[];
}

/**
 * Put the look on a clone of a Collect GLB (meshes named by material: Paint, Trim, Carbon, Metal, Void,
 * Glass, Headlight, Taillight, Glow, Rim, Tire). `glow` scales the light strips (brighter on the stand).
 */
export function dressCar(obj: Object3D, car: Car, shared: Record<string, Material>, opts: { glow?: number; env?: Texture | null } = {}): Dressed {
  const L = car.looks;
  const fin = FINISH[L.finish];
  const p = L.paint;
  const body = new Box3();
  const b = obj.getObjectByName('Body');
  if (b) body.expandByObject(b);
  else body.set(new Vector3(-1, 0.1, -2.3), new Vector3(1, 1.2, 2.3));
  const size = body.getSize(new Vector3());
  const accent = accentOf(car);
  const uniforms = {
    uBase: { value: col(p.hex) },
    uAlt: { value: col(p.hex2 ?? p.hex) },
    uAccent: { value: col(accent) },
    uLight: { value: col(L.lightHex) },
    uTrim: { value: col(fin.trim ?? '#E9EBEE') },
    uKind: { value: KIND_CODE[p.kind] },
    uPattern: { value: PATTERN_CODE[L.pattern] },
    uFx: { value: new Vector4(fin.flake ? 1 : 0, fin.brushed ? 1 : 0, /carbon/i.test(p.name.split('/')[1] ?? '') ? 1 : 0, car.edition * 0.618) },
    // body: bottom, top, half width, half length
    uBox: { value: new Vector4(body.min.y, body.max.y, size.x / 2, size.z / 2) },
    uStripeW: { value: Math.min(0.2, size.x * 0.075) },
  };
  const paint = new MeshPhysicalMaterial({ color: 0xffffff, roughness: fin.r, metalness: fin.m, clearcoat: fin.cc, clearcoatRoughness: fin.ccr, envMap: opts.env ?? null, name: 'drop-paint' });
  paint.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarPos;\nvarying vec3 vCarNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarPos = position;\nvCarNrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uBase; uniform vec3 uAlt; uniform vec3 uAccent; uniform vec3 uLight; uniform vec3 uTrim;
        uniform float uKind; uniform float uPattern; uniform vec4 uFx; uniform vec4 uBox; uniform float uStripeW;
        varying vec3 vCarPos; varying vec3 vCarNrm;
        ${GLSL_HELPERS}`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `{
          vec3 cp = vCarPos;
          vec3 cn = normalize(vCarNrm + vec3(0.0, 1e-4, 0.0));
          vec3 V = normalize(vViewPosition);
          float nv = clamp(dot(V, normal), 0.0, 1.0);
          float graze = pow(1.0 - nv, 2.0);
          float h01 = clamp((cp.y - uBox.x) / (uBox.y - uBox.x), 0.0, 1.0);
          vec3 c = uBase;
          float trimLine = 0.0;
          if (uKind > 1.5 && uKind < 2.5) c = mix(uBase, uAlt, smoothstep(0.05, 0.85, graze * 1.6)); // pearl shift
          if (uKind > 2.5 && uKind < 3.5) {
            // two-tone: the lower colour below the waist, a chrome line between
            float waist = uBox.x + (uBox.y - uBox.x) * 0.44 - 0.03 * cp.z / uBox.w;
            float aa = fwidth(cp.y) + 1e-4;
            float lower = 1.0 - smoothstep(waist - aa, waist + aa, cp.y);
            vec3 low = uAlt;
            if (uFx.z > 0.5) {
              // carbon weave
              vec2 wv = floor(vec2(cp.z + cp.x, cp.y) * 90.0);
              low *= 0.75 + 0.5 * mod(wv.x + wv.y, 2.0);
            }
            c = mix(c, low, lower);
            trimLine = dLine(cp.y - waist - 0.012, 0.009) * smoothstep(0.3, 0.6, abs(cn.x) + abs(cn.z));
          }
          if (uKind > 3.5) c = mix(uBase, uAlt, smoothstep(0.0, 0.9, graze * 1.8)); // liquid metal flip
          if (uFx.y > 0.5) c *= 0.9 + 0.1 * dHash2(vec2(floor(cp.y * 900.0), 3.0)); // brushed grain along the car
          // the pattern
          float pat = uPattern;
          float m = 0.0;
          float glowLine = 0.0;
          vec3 w3 = pow(abs(cn), vec3(4.0));
          w3 /= (w3.x + w3.y + w3.z);
          float top = smoothstep(-0.15, 0.35, cn.y);
          if (pat > 0.5 && pat < 1.5) {
            // split: accent on the lower rear, a diagonal rising towards the tail
            float line = uBox.x + (uBox.y - uBox.x) * (0.36 - 0.42 * cp.z / uBox.w);
            float aa = fwidth(cp.y) + 1e-4;
            m = 1.0 - smoothstep(line - aa, line + aa, cp.y);
          } else if (pat > 1.5 && pat < 2.5) {
            float ax = abs(cp.x);
            m = dLine(ax - uStripeW * 0.9, uStripeW * 0.55) * top;
          } else if (pat > 3.5 && pat < 4.5) {
            // topographic: contour lines of a smooth field
            float f = dNoise(cp * 1.25 + uFx.w) * 0.65 + dNoise(cp * 2.7 - uFx.w) * 0.35;
            float v = f * 11.0;
            float k = fract(v);
            float d = min(k, 1.0 - k) / (fwidth(v) + 1e-4);
            m = (1.0 - clamp(d - 0.6, 0.0, 1.0)) * (0.55 + 0.45 * step(0.5, fract(v * 0.2)));
          } else if (pat > 5.5 && pat < 6.5) {
            // glitch: offset horizontal slices
            float band = floor(cp.y / 0.042 + uFx.w);
            float hb = dHash2(vec2(band, 7.0));
            float shift = (dHash2(vec2(band, 13.0)) - 0.5) * 0.9;
            float blocks = step(fract((cp.z + shift) * (0.9 + hb * 1.8)), 0.33);
            m = step(0.6, hb) * blocks * (0.35 + 0.65 * smoothstep(0.2, 0.7, abs(cn.x) + abs(cn.z)));
            glowLine = m * step(0.86, hb) * 0.6;
          } else if (pat > 2.5) {
            float fl = dPattern2(pat, vec2(cp.z, cp.y), uFx.w);
            float tp = dPattern2(pat, vec2(cp.z, cp.x), uFx.w + 5.0);
            float fr = dPattern2(pat, vec2(cp.x, cp.y), uFx.w + 9.0);
            m = fl * w3.x + tp * w3.y + fr * w3.z;
            if (pat > 4.5 && pat < 5.5) m *= 0.35 + 0.65 * smoothstep(0.4, 0.8, abs(cn.x)); // hex: strongest on the flanks
            if (pat > 2.5 && pat < 3.5) glowLine = m * 0.35;
          }
          c = mix(c, uAccent, m);
          c = mix(c, uTrim, trimLine);
          diffuseColor.rgb = c;
          metalnessFactor = mix(metalnessFactor, 1.0, trimLine);
          roughnessFactor = mix(roughnessFactor, 0.06, trimLine);
          totalEmissiveRadiance += uLight * glowLine * 0.6;
          // prism flake: tiny facets that catch the sun, each its own colour
          #if NUM_DIR_LIGHTS > 0
          if (uFx.x > 0.5) {
            vec3 cell = floor(cp * 220.0);
            float hf = dHash(cell);
            vec3 jitter = vec3(dHash(cell + 1.3), dHash(cell + 2.7), dHash(cell + 4.1)) - 0.5;
            vec3 fn = normalize(normal + jitter * 0.55);
            vec3 r = reflect(-V, fn);
            float g = pow(max(dot(r, directionalLights[0].direction), 0.0), 260.0) * step(0.55, hf);
            float fade = 1.0 - smoothstep(0.004, 0.012, fwidth(cp.x));
            vec3 prism = 0.55 + 0.45 * cos(6.2831 * (hf * 3.0 + vec3(0.0, 0.33, 0.67)));
            totalEmissiveRadiance += prism * g * fade * 6.0;
          }
          #endif
        }
        #include <lights_physical_fragment>`,
      );
  };
  paint.customProgramCacheKey = () => 'od-drop-paint';

  const light = col(L.lightHex);
  const glow = new MeshStandardMaterial({ color: light.clone().multiplyScalar(0.6), emissive: light, emissiveIntensity: opts.glow ?? 1.4, roughness: 0.3, name: 'drop-glow' });
  const headlight = new MeshStandardMaterial({ color: col('#F2F1EC'), roughness: 0.12, emissive: new Color(1, 1, 1).lerp(light, 0.35), emissiveIntensity: 0.25, name: 'drop-headlight' });
  const wheelMat = (): Material => {
    if (L.wheels === 'Body Colour') return new MeshPhysicalMaterial({ color: col(p.hex), metalness: Math.max(0.3, fin.m), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, envMap: opts.env ?? null, name: 'drop-rim' });
    const w = WHEEL[L.wheels];
    return new MeshPhysicalMaterial({
      color: col(w.c),
      metalness: w.m,
      roughness: w.r,
      clearcoat: w.cc ?? 0,
      iridescence: w.irid ? 1 : 0,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [180, 820],
      envMap: opts.env ?? null,
      name: 'drop-rim',
    });
  };
  const rim = wheelMat();
  const trim = fin.trim ? new MeshStandardMaterial({ color: col(fin.trim), metalness: 1, roughness: 0.07, envMap: opts.env ?? null, name: 'drop-trim' }) : null;
  const made: Material[] = [paint, glow, headlight, rim, ...(trim ? [trim] : [])];
  obj.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    let inWheel = false;
    for (let q: Object3D | null = m; q; q = q.parent) if (/^Wheel_/.test(q.name)) inWheel = true;
    const src = (Array.isArray(m.material) ? m.material[0] : m.material) as Material;
    const name = (src?.userData?.dropName as string) ?? (src?.name ?? '').replace(/\.\d+$/, '');
    let mat: Material | undefined;
    if (name === 'Paint') mat = paint;
    else if (name === 'Glow') mat = glow;
    else if (name === 'Headlight') mat = headlight;
    else if (name === 'Rim' || (inWheel && name === 'Metal')) mat = rim;
    else if (name === 'Trim' && trim) mat = trim;
    else mat = shared[name];
    if (mat) {
      if (!mat.userData.dropName) mat.userData.dropName = name;
      m.material = mat;
    }
  });
  return { materials: made };
}
