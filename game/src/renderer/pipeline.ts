// Renderer and post: HDR scene target (MSAA on high/medium), bloom on the sun and the glitter path, then one
// pass for exposure, AgX tone mapping and a light grade (warm highlights, cooler shadow fill), a whisper of
// vignette and grain. FXAA on the low tier instead of MSAA. Dynamic resolution drops to `minScale` when
// frames run long and climbs back when there's headroom.
import { HalfFloatType, NoToneMapping, SRGBColorSpace, Vector2, WebGLRenderer, WebGLRenderTarget, type Camera, type Scene } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import type { Quality } from '../quality';

const FinalShader = {
  name: 'OdFinal',
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.0 },
    uTime: { value: 0 },
    uRes: { value: new Vector2(1, 1) },
    uVignette: { value: 0.22 },
    uGrain: { value: 0.012 },
    uTm: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uVignette;
    uniform float uGrain;
    uniform int uTm;
    varying vec2 vUv;

    vec3 aces(vec3 color) {
      const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= 1.0 / 0.6;
      color = ACESInputMat * color;
      vec3 a = color * (color + 0.0245786) - 0.000090537;
      vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
      color = a / b;
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 neutral(vec3 color) {
      const float StartCompression = 0.8 - 0.04;
      const float Desaturation = 0.15;
      float x = min(color.r, min(color.g, color.b));
      float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
      color -= offset;
      float peak = max(color.r, max(color.g, color.b));
      if (peak < StartCompression) return color;
      float d = 1.0 - StartCompression;
      float newPeak = 1.0 - d * d / (peak + d - StartCompression);
      color *= newPeak / peak;
      float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
      return mix(color, vec3(newPeak), g);
    }

    // AgX (Filament / Blender), as in three's tonemapping chunk
    vec3 agxContrast(vec3 x) {
      vec3 x2 = x * x;
      vec3 x4 = x2 * x2;
      return + 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
    }
    vec3 agx(vec3 color) {
      const mat3 LIN_SRGB_TO_REC2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
      const mat3 REC2020_TO_LIN_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
      const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
      const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
      const float minEv = -12.47393;
      const float maxEv = 4.026069;
      color = LIN_SRGB_TO_REC2020 * color;
      color = inset * color;
      color = max(color, 1e-10);
      color = log2(color);
      color = (color - minEv) / (maxEv - minEv);
      color = clamp(color, 0.0, 1.0);
      color = agxContrast(color);
      color = outset * color;
      color = pow(max(vec3(0.0), color), vec3(2.2));
      color = REC2020_TO_LIN_SRGB * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
      // grade in scene-linear: cooler fill in the shadows, warmer highlights
      float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float w = smoothstep(0.03, 0.9, L);
      c *= mix(vec3(0.93, 0.985, 1.08), vec3(1.05, 1.0, 0.93), w);
      c = uTm == 1 ? aces(c) : uTm == 2 ? neutral(c) : agx(c);
      // a touch more saturation and a gentle toe lift (AgX is a little flat for travel photography)
      float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l2), c, 1.12);
      c = max(c, 0.0);
      c = c * (1.0 + 0.1 * (1.0 - c));
      vec2 q = vUv - 0.5;
      q.x *= uRes.x / uRes.y;
      c *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(q));
      vec3 s = toSRGB(clamp(c, 0.0, 1.0));
      float n = hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 91.7) - 0.5;
      s += n * (uGrain + 1.0 / 255.0);
      gl_FragColor = vec4(s, 1.0);
    }
  `,
};

export class Pipeline {
  readonly renderer: WebGLRenderer;
  readonly composer: EffectComposer;
  private readonly final: ShaderPass;
  private readonly fxaa: ShaderPass | null;
  readonly bloom: UnrealBloomPass | null;
  private readonly renderPass: RenderPass;
  private basePR: number;
  scale = 1;
  private frameAvg = 16.7;
  dynamic = true;

  constructor(canvas: HTMLCanvasElement, private q: Quality) {
    const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    this.basePR = Math.min(window.devicePixelRatio || 1, q.maxPixelRatio);
    renderer.setPixelRatio(this.basePR);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer = renderer;

    const size = renderer.getDrawingBufferSize(new Vector2());
    const rt = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: q.msaa });
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(this.basePR);
    composer.setSize(window.innerWidth, window.innerHeight);
    this.renderPass = new RenderPass(null as unknown as Scene, null as unknown as Camera);
    composer.addPass(this.renderPass);
    this.bloom = q.bloom ? new UnrealBloomPass(new Vector2(size.x, size.y), 0.2, 0.24, 11) : null;
    if (this.bloom) composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    composer.addPass(this.final);
    this.fxaa = q.msaa === 0 ? new ShaderPass(FXAAShader) : null;
    if (this.fxaa) composer.addPass(this.fxaa);
    this.composer = composer;
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
  }

  set toneMap(v: number) {
    this.final.uniforms.uTm.value = v;
  }
  set exposure(v: number) {
    this.final.uniforms.uExposure.value = v;
  }
  get exposure(): number {
    return this.final.uniforms.uExposure.value;
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = this.basePR * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    const px = new Vector2(w * pr, h * pr);
    this.final.uniforms.uRes.value.copy(px);
    if (this.fxaa) this.fxaa.uniforms.resolution.value.set(1 / px.x, 1 / px.y);
  }

  render(scene: Scene, camera: Camera, time: number): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.final.uniforms.uTime.value = time;
    this.composer.render();
  }

  /**
   * Feed the frame time (ms). With vsync the frame time can't show headroom, so: drop 0.1 after ~1.5 s
   * under ~50 fps; try 0.1 back after a stretch at full rate, and wait longer after each failed try.
   */
  tick(dtMs: number, now: number): void {
    if (document.hidden) return;
    this.frameAvg += (Math.min(dtMs, 100) - this.frameAvg) * 0.05;
    if (!this.dynamic) return;
    if (this.started === 0) this.started = now;
    if (now - this.started < 4000) return; // shader compiles and first uploads
    const slow = this.frameAvg > 20.5;
    const smooth = this.frameAvg < 17.9;
    this.slowFor = slow ? this.slowFor + dtMs : 0;
    this.smoothFor = smooth ? this.smoothFor + dtMs : 0;
    let s = this.scale;
    if (this.slowFor > 1500 && s > this.q.minScale + 1e-3) {
      s = Math.max(this.q.minScale, s - 0.1);
      if (now - this.lastUp < 6000) this.upWait = Math.min(this.upWait * 2, 120000);
    } else if (this.smoothFor > this.upWait && s < 1 - 1e-3) {
      s = Math.min(1, s + 0.1);
      this.lastUp = now;
    }
    if (s !== this.scale) {
      this.scale = s;
      this.slowFor = 0;
      this.smoothFor = 0;
      this.onResize();
    }
  }
  private started = 0;
  private slowFor = 0;
  private smoothFor = 0;
  private lastUp = -1e9;
  private upWait = 5000;

  get fps(): number {
    return 1000 / this.frameAvg;
  }
}
