// The Atlantic. A high-resolution strip that follows you along the beach carries the scheduled breakers:
// swells steepen as they shoal, spill, roll in as a whitewater bore and run up the sand as a thin sheet
// with a lace of foam at its edge, then drain back. Beyond it a flat far sea runs to the horizon. Both
// share one shader: sky reflection with Fresnel, a sun glitter path (GGX widened with distance, plus
// twinkling facets up close), turquoise shallows over sand with a wobble of refraction and caustics, deep
// blue-grey water further out, backlit crests, and the same haze as everything else.
import { BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, type Camera } from 'three';
import type { Ctx } from '../core/ctx';
import { hazeGLSL } from '../renderer/haze';
import { EQUIRECT_GLSL, sunGLSL } from '../sky/sky';
import { skyConstants, vec3s } from '../sky/atmosphere';
import { noiseTexture } from '../textures/noise';
import { SURF_GLSL, X_SHORE } from './surf';

export const BEACH_PROFILE_GLSL = /* glsl */ `
float beachProfile(float x) {
  if (x < 104.0) return 1.02 - ((x - 52.0) / 52.0) * 0.24;
  if (x < 124.0) { float t = (x - 104.0) / 20.0; return 0.78 * (1.0 - t) * (1.0 - 0.18 * t); }
  float d = x - 124.0;
  if (d < 36.0) return -0.042 * d;
  return -0.042 * 36.0 - (d - 36.0) * 0.016;
}
`;

/** Swash sheet and wet-sand state from the surf schedule (shared with the sand shader). */
export const SWASH_GLSL = /* glsl */ `
// film depth over the sand at p (0 = dry); edge = lace strength at the leading edge; flow +1 up, -1 back
float swashFilm(vec2 p, float t, out float edge, out float flow) {
  float x = p.x;
  float z = p.y;
  float dist = X_SHORE - x;
  int kc = int(floor(t / WAVE_DT));
  float film = 0.0;
  edge = 0.0;
  flow = 0.0;
  for (int k = kc - 3; k <= kc + 1; k++) {
    vec4 w = waveK(k);
    float tp = t - breakTime(w, k, z) - TAU_S;
    float a = localA(w, k, z);
    float r = localR(w, k, z);
    float s = runup(r, a, tp) * edgeWobble(z, k);
    if (s > max(dist, 0.0)) {
      float f = 0.015 + 0.07 * (s - max(dist, 0.0)) / r;
      bool up = tp < tUp(a);
      if (f > film) { film = f; flow = up ? 1.0 : -1.0; }
      float e = 1.0 - smoothstep(0.0, up ? 0.45 : 0.25, s - dist);
      edge = max(edge, e * (up ? 1.0 : 0.35));
    }
  }
  return film;
}
// x: how wet (0 dry … 1 saturated), y: gloss of a sheet that has just drained
vec2 sandWet(vec2 p, float t) {
  float x = p.x;
  float z = p.y;
  float dist = X_SHORE - x;
  if (dist > 20.0) return vec2(0.0);
  float wet = 0.0;
  float gloss = 0.0;
  int kc = int(floor(t / WAVE_DT));
  for (int k = kc - 4; k <= kc + 1; k++) {
    vec4 w = waveK(k);
    float tp = t - breakTime(w, k, z) - TAU_S;
    if (tp < 0.0) continue;
    float a = localA(w, k, z);
    float r = localR(w, k, z);
    if (r > dist) {
      float u = sqrt(max(1.0 - max(dist, 0.0) / r, 0.0));
      float tUnc = tUp(a) + u * tDown(a);
      float since = tp - tUnc;
      wet = 1.0;
      gloss = max(gloss, since > 0.0 ? exp(-since / 3.2) : 1.0);
    }
  }
  wet = max(wet, smoothstep(X_SHORE - 13.0, X_SHORE - 8.5, x));
  wet = max(wet * 1.0, 0.45 * smoothstep(X_SHORE - 19.0, X_SHORE - 13.0, x));
  return vec2(wet, gloss);
}
`;

function stripGeometry(detail: number): BufferGeometry {
  // x samples: fine over the foreshore and surf zone, coarser out to sea
  const xs: number[] = [];
  let x = X_SHORE - 17;
  while (x < 430) {
    xs.push(x);
    const d = x < 162 ? 0.25 : x < 200 ? 0.5 : x < 270 ? 1.2 : 3.5;
    x += d / detail;
  }
  xs.push(430); // the far sea starts exactly here
  const zs: number[] = [];
  const zr = 250;
  let z = -zr;
  while (z <= zr) {
    zs.push(z);
    const a = Math.abs(z);
    z += (a < 70 ? 0.8 : a < 140 ? 1.6 : 4) / detail;
  }
  const pos = new Float32Array(xs.length * zs.length * 3);
  let k = 0;
  for (const zz of zs) for (const xx of xs) {
    pos[k++] = xx;
    pos[k++] = 0;
    pos[k++] = zz;
  }
  const n = xs.length;
  const idx = new Uint32Array((xs.length - 1) * (zs.length - 1) * 6);
  let p = 0;
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      idx[p++] = a;
      idx[p++] = a + n;
      idx[p++] = a + 1;
      idx[p++] = a + 1;
      idx[p++] = a + n;
      idx[p++] = a + n + 1;
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  return g;
}

function farGeometry(): BufferGeometry {
  // a fan of quads from the strip's outer edge to the horizon, camera-relative in z
  const xs = [430, 500, 650, 900, 1300, 2000, 3200, 5000, 8000, 13000];
  const zs = [-14000, -6000, -2500, -1000, -400, -250, 0, 250, 400, 1000, 2500, 6000, 14000];
  const pos: number[] = [];
  for (const z of zs) for (const x of xs) pos.push(x, 0, z);
  const idx: number[] = [];
  const n = xs.length;
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  // and the strip's own far sides (|z| > 250) between the shore and x = 428
  const base = pos.length / 3;
  const xs2 = [X_SHORE + 0.5, 140, 200, 300, 430];
  const zs2 = [-14000, -6000, -2500, -1000, -400, -250];
  for (const side of [1, -1]) {
    const start = pos.length / 3;
    for (const z of zs2) for (const x of xs2) pos.push(x, 0, z * side);
    const m = xs2.length;
    for (let j = 0; j < zs2.length - 1; j++)
      for (let i = 0; i < m - 1; i++) {
        const a = start + j * m + i;
        if (side > 0) idx.push(a, a + m, a + 1, a + 1, a + m, a + m + 1);
        else idx.push(a, a + 1, a + m, a + 1, a + m + 1, a + m);
      }
  }
  void base;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

function oceanMaterial(ctx: Ctx, far: boolean): ShaderMaterial {
  const c = skyConstants();
  const amb = c.zenith.map((v, i) => v * 1.25 + c.hazeTable[8][i] * 0.2);
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOffZ: { value: 0 },
      uSky: { value: ctx.sky.full },
      uNoise: { value: noiseTexture() },
      uFoot: { value: [0, -100, 0, 0] },
    },
    defines: far ? { FAR_SEA: 1 } : {},
    vertexShader: /* glsl */ `
      #define PI 3.14159265359
      uniform float uTime;
      uniform float uOffZ;
      varying vec3 vW;
      varying float vFoam;
      varying float vCrest;
      varying float vSlope;
      varying float vBed;
      ${SURF_GLSL}
      ${BEACH_PROFILE_GLSL}
      #ifndef FAR_SEA
      float waterH(vec2 p, float t, out float foam, out float crest) {
        float x = p.x;
        float z = p.y;
        float h = 0.0;
        foam = 0.0;
        crest = 0.0;
        int kc = int(floor(t / WAVE_DT));
        for (int k = kc - 3; k <= kc + 5; k++) {
          vec4 w = waveK(k);
          float tau = t - breakTime(w, k, z);
          float a = localA(w, k, z);
          if (tau < 0.0) {
            float xc = X_BREAK + C_SWELL * (-tau);
            if (xc > 430.0) continue;
            float shoal = 0.3 + 0.7 * smoothstep(X_BREAK + 200.0, X_BREAK, xc);
            float d = x - xc;
            // the front face steepens as it shoals, the back stays long
            float wf = mix(0.8, 6.5, smoothstep(X_BREAK, X_BREAK + 110.0, xc));
            float prof = d < 0.0 ? exp(-(d * d) / (wf * wf)) : exp(-(d * d) / 42.0);
            h += a * shoal * 0.85 * prof;
            crest = max(crest, prof * shoal * smoothstep(-7.0, 0.0, tau));
            // spilling: white water on the crest and down the steep face just before it breaks
            float spill = smoothstep(-1.8, 0.0, tau);
            foam = max(foam, spill * (exp(-(d * d) / 1.0) + 0.6 * step(d, 0.0) * exp(-(d * d) / (wf * wf * 0.6))));
          } else if (tau < TAU_S + 1.5) {
            float xf = X_BREAK - C_BORE * tau;
            float d = x - xf;
            float stp = smoothstep(-0.45, 0.3, d);
            float decay = exp(-max(d, 0.0) / 6.0);
            float amp = a * 0.55 * max(0.0, 1.0 - 0.6 * tau / TAU_S);
            h += amp * stp * (0.3 + 0.7 * decay);
            foam = max(foam, stp * (0.3 + 0.7 * decay) * (1.0 - 0.35 * tau / TAU_S));
          }
          if (tau > 0.0 && tau < 45.0) {
            float xf = max(X_BREAK - C_BORE * tau, X_SHORE - 1.0);
            float res = exp(-tau / 24.0) * smoothstep(0.0, 3.0, x - xf) * smoothstep(X_BREAK + 26.0, X_BREAK - 4.0, x);
            foam = max(foam, res * 0.85);
          }
        }
        // set-up near the shore and a slow ambient swell
        float depthAtt = smoothstep(X_SHORE - 1.0, X_SHORE + 30.0, x);
        h += depthAtt * (0.05 * sin(x * 0.11 - t * 0.9 + z * 0.012) + 0.03 * sin(x * 0.23 + z * 0.05 - t * 1.4));
        // settle to the flat far sea at the strip's outer edge
        h *= 1.0 - smoothstep(370.0, 428.0, x);
        return h;
      }
      #endif
      void main() {
        vec3 p = position;
        #ifdef FAR_SEA
          p.z += uOffZ;
          vFoam = 0.0;
          vCrest = 0.0;
          vSlope = 0.0;
          vBed = -20.0;
        #else
          p.z += uOffZ;
          float foam, crest;
          float h = waterH(p.xz, uTime, foam, crest);
          float foam2, crest2;
          float h2 = waterH(p.xz + vec2(0.35, 0.0), uTime, foam2, crest2);
          // fade to flat towards the strip's ends along the beach, where the far sea takes over
          float ends = 1.0 - smoothstep(185.0, 246.0, abs(position.z));
          h *= ends;
          h2 *= ends;
          vSlope = (h2 - h) / 0.35;
          vFoam = foam * ends;
          vCrest = crest * ends;
          float bed = beachProfile(p.x);
          vBed = bed;
          // over the sand: ride just above it (the fragment shader cuts the sheet to the swash edge)
          if (p.x < X_SHORE + 0.6) h = max(h, bed + 0.035);
          p.y = h;
        #endif
        vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #define PI 3.14159265359
      uniform float uTime;
      uniform sampler2D uSky;
      uniform sampler2D uNoise;
      uniform vec4 uFoot;
      varying vec3 vW;
      varying float vFoam;
      varying float vCrest;
      varying float vSlope;
      varying float vBed;
      ${sunGLSL()}
      ${hazeGLSL()}
      ${EQUIRECT_GLSL}
      ${SURF_GLSL}
      ${SWASH_GLSL}
      const vec3 AMB = ${vec3s(amb)};

      float nz(vec2 q) { return texture2D(uNoise, q).g; }
      vec2 grad(vec2 q, float scale, float amp) {
        float e = 1.0 / 256.0;
        float c0 = nz(q);
        return vec2(nz(q + vec2(e, 0.0)) - c0, nz(q + vec2(0.0, e)) - c0) / (e * scale) * amp;
      }
      float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

      // wet sand seen through the water
      vec3 bedColor(vec2 p) {
        float n = texture2D(uNoise, p * 0.35).b;
        float rip = sin(p.x * 5.5 + texture2D(uNoise, p * 0.11).g * 6.0) * 0.5 + 0.5;
        return vec3(0.44, 0.39, 0.3) * (0.85 + 0.2 * n) * (0.93 + 0.1 * rip);
      }

      void main() {
        vec2 p = vW.xz;
        float t = uTime;
        vec3 toCam = cameraPosition - vW;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        float filmEdge = 0.0;
        float flow = 0.0;
        float film = 0.0;
        bool onSand = false;
        #ifndef FAR_SEA
          if (p.x < X_SHORE - 0.05) {
            film = swashFilm(p, t, filmEdge, flow);
            // soft cut: coverage from film depth, alpha-to-coverage smooths the edge
            if (film <= 0.0) discard;
            onSand = true;
          }
        #endif
        // ---- normal: breaker slope + three octaves of chop, calmer in the thin sheet and far away
        float calm = onSand ? 0.25 : smoothstep(X_SHORE - 2.0, X_SHORE + 10.0, p.x);
        float fade = 1.0 - smoothstep(60.0, 900.0, dist);
        vec2 g = vec2(0.0);
        g += grad(p / 9.0 + vec2(-t * 0.021, t * 0.008), 9.0, 0.14);
        g += grad(p / 2.7 + vec2(t * 0.035, -t * 0.02) + 0.37, 2.7, 0.045) * fade;
        g += grad(p / 0.75 + vec2(-t * 0.08, t * 0.05) + 0.71, 0.75, 0.012) * fade * fade;
        g *= calm;
        vec3 n = normalize(vec3(-vSlope - g.x, 1.0, -g.y));
        float NdV = max(dot(n, V), 0.02);
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
        vec3 R = reflect(-V, n);
        R.y = max(R.y, 0.003);
        vec3 sky = textureLod(uSky, equirectUvOf(normalize(R)), 0.0).rgb;
        // ---- sun: GGX glitter path, wider far away (unresolved facets), plus twinkling facets up close
        vec3 L = SUN_DIR;
        vec3 H = normalize(L + V);
        float NdH = max(dot(n, H), 0.0);
        float NdL = max(dot(n, L), 0.0);
        float rough = clamp(0.075 + dist * 0.00009, 0.075, 0.2);
        float a2 = rough * rough;
        float dd = NdH * NdH * (a2 - 1.0) + 1.0;
        float D = a2 / (PI * dd * dd);
        float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
        vec3 sunSpec = SUN_IRR * D * Fs * NdL / (4.0 * NdV * max(NdL, 0.05) + 1e-3) * 0.5;
        // twinkles: tiny facets tilted at random, re-dealt a few times a second
        {
          vec2 cp = p / 0.11;
          vec2 ci = floor(cp);
          float tq = floor(t * 6.0 + h12(ci) * 6.0);
          vec3 facet = normalize(n + vec3(h12(ci + tq * 1.37) - 0.5, 0.0, h12(ci * 1.71 + tq) - 0.5) * 0.3);
          float align = dot(facet, H);
          float spot = smoothstep(0.45, 0.0, length(fract(cp) - 0.5));
          float tw = smoothstep(0.9990, 0.99995, align) * spot * (1.0 - smoothstep(12.0, 70.0, dist));
          sunSpec += SUN_IRR * tw * 22.0 * (onSand ? 0.5 : 1.0);
        }
        // ---- water body: turquoise over sand, deep blue-grey further out
        float depth = max(vW.y - vBed, 0.0);
        vec3 absorb = vec3(0.45, 0.105, 0.075);
        float path = depth * (1.0 + 1.0 / max(NdV, 0.2));
        vec3 T = exp(-absorb * path);
        vec2 refr = n.xz * depth * 0.35;
        vec3 bed = bedColor(p + refr);
        // caustics on the shallow bed
        float cau = texture2D(uNoise, (p + refr) * 0.37 + vec2(t * 0.05, -t * 0.03)).a;
        float cau2 = texture2D(uNoise, (p - refr) * 0.53 + vec2(-t * 0.04, t * 0.02) + 0.5).a;
        float caustic = smoothstep(0.5, 0.66, cau) * smoothstep(0.45, 0.66, cau2) * smoothstep(0.02, 0.2, depth) * (1.0 - smoothstep(0.7, 2.2, depth));
        // the low sun still reaches the shallow bed (refracted to ~48° from vertical)
        vec3 Tsun = exp(-absorb * depth / 0.67);
        vec3 bedLit = bed * (AMB * 1.1 + SUN_IRR * Tsun * (0.3 + 0.7 * caustic) / PI);
        vec3 scatter = vec3(0.022, 0.1, 0.105) * (AMB * 1.4 + SUN_IRR * 0.045);
        vec3 body = bedLit * T + scatter * (1.0 - T);
        #ifdef FAR_SEA
          body = scatter * 0.85;
        #endif
        vec3 col = body * (1.0 - F) + sky * F + sunSpec;
        // light through the thin lips of the shoaling swells, towards the sun
        float back = pow(max(dot(-V, L), 0.0), 3.0);
        col += vec3(0.1, 0.42, 0.33) * SUN_IRR * vCrest * back * 0.05;
        // ---- foam: breaking lips, bore, lingering lace, and the swash edge
        // foam: solid where it's thick (breaking lips, the bore), torn into patches by smooth noise, and
        // thin lace lines (Voronoi edges) where it's thinning out behind
        float patchN = texture2D(uNoise, p * 0.09 + vec2(t * 0.003, 0.0)).g * 0.6 + texture2D(uNoise, p * 0.31 + 0.2).g * 0.4;
        float solid = smoothstep(0.38, 0.62, vFoam + (patchN - 0.5) * 0.35 * (1.0 - vFoam));
        // lace: thin meandering veins (ridges of smooth noise), broken up, two scales
        float r1 = 1.0 - abs(2.0 * texture2D(uNoise, p * 0.13 + vec2(t * 0.003, 0.0)).g - 1.0);
        float r2 = 1.0 - abs(2.0 * texture2D(uNoise, p * 0.41 + vec2(0.37, -t * 0.005)).g - 1.0);
        float laceP = max(smoothstep(0.9, 0.975, r1), smoothstep(0.92, 0.98, r2) * 0.75) * smoothstep(0.25, 0.65, patchN + 0.15);
        float thin = smoothstep(0.06, 0.4, vFoam) * (1.0 - solid);
        float foam = max(solid, laceP * thin * 0.9);
        #ifndef FAR_SEA
          if (onSand) {
            // a lacy line at the leading edge, sparse bubbles behind it
            float bub = smoothstep(0.8, 0.93, texture2D(uNoise, p * 2.1 + vec2(0.0, flow * t * 0.3)).b);
            float edgeLace = filmEdge * (0.55 + 0.45 * smoothstep(0.35, 0.6, patchN));
            foam = max(edgeLace, bub * 0.35 * (flow > 0.0 ? 1.0 : 0.3));
          }
          // water parting round your feet
          vec2 fd = p - uFoot.xy;
          float fr = length(fd);
          if (uFoot.w > 0.5 && fr < 1.2) {
            float wake = exp(-fr * fr * 7.0) * 0.8 + smoothstep(0.35, 0.12, abs(fr - 0.22 - 0.05 * sin(t * 9.0))) * 0.6;
            foam = max(foam, wake * min(film * 20.0, 1.0));
          }
        #endif
        foam = clamp(foam, 0.0, 1.0);
        vec3 foamLit = vec3(0.86, 0.87, 0.86) * (AMB * 1.3 + SUN_IRR * (0.12 + 0.28 * max(dot(n, L), 0.0)));
        col = mix(col, foamLit, foam);
        #ifndef FAR_SEA
          // the sheet thins to nothing at its edge
          if (onSand) {
            float wetSand = 1.0;
            vec3 sand = bedColor(p) * (AMB * 1.2 + SUN_IRR * max(L.y, 0.1) * 0.9 / PI);
            col = mix(sand * wetSand, col, smoothstep(0.012, 0.03, film) * 0.85 + 0.15);
          }
        #endif
        col = applyHaze(col, vW - cameraPosition, cameraPosition.y);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export interface Ocean {
  meshes: Mesh[];
  update(t: number, cam: Camera, foot: { x: number; z: number; wet: boolean }): void;
}

export function buildOcean(ctx: Ctx): Ocean {
  const near = oceanMaterial(ctx, false);
  const far = oceanMaterial(ctx, true);
  near.alphaToCoverage = ctx.q.msaa > 0;
  const strip = new Mesh(stripGeometry(ctx.q.oceanDetail), near);
  strip.frustumCulled = false;
  strip.name = 'ocean-strip';
  const sea = new Mesh(farGeometry(), far);
  sea.frustumCulled = false;
  sea.name = 'ocean-far';
  return {
    meshes: [strip, sea],
    update(t: number, cam: Camera, foot) {
      const z = Math.round(cam.position.z);
      near.uniforms.uTime.value = t;
      near.uniforms.uOffZ.value = z;
      far.uniforms.uTime.value = t;
      far.uniforms.uOffZ.value = z;
      near.uniforms.uFoot.value = [foot.x, foot.z, 0, foot.wet ? 1 : 0];
    },
  };
}
