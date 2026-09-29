// Quality tiers from the GPU, core count and memory. ?q=high|medium|low overrides.

export type Tier = 'high' | 'medium' | 'low';

export interface Quality {
  tier: Tier;
  /** sun shadow map edge (square) */
  shadowMapSize: number;
  /** shadow box length along the street (m); the cross-section is always covered */
  shadowLength: number;
  /** PCSS blocker-search and filter taps */
  pcssSearch: number;
  pcssFilter: number;
  /** MSAA samples on the HDR scene target (0 = FXAA instead) */
  msaa: number;
  maxPixelRatio: number;
  /** lowest dynamic resolution scale */
  minScale: number;
  bloom: boolean;
  /** ocean strip resolution factor */
  oceanDetail: number;
  /** grass blades near the camera */
  grass: number;
  /** wave voices along the shore */
  waveVoices: number;
  mobile: boolean;
  gpu: string;
}

function gpuName(): string {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return 'no-webgl2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return 'unknown';
  }
}

export function isMobile(): boolean {
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMac;
}

export function detectQuality(): Quality {
  const gpu = gpuName();
  const mobile = isMobile();
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const g = gpu.toLowerCase();

  let tier: Tier = 'medium';
  if (mobile || g.includes('swiftshader') || g.includes('llvmpipe') || g === 'no-webgl2') tier = 'low';
  else if (/nvidia|geforce|rtx|radeon rx|radeon pro|apple m\d (pro|max|ultra)/.test(g)) tier = 'high';
  // the base M-series GPUs run the medium tier smoothly; ?q=high is there for a closer look
  else if (/apple m\d|apple gpu|apple/.test(g)) tier = cores >= 8 && mem >= 8 ? 'medium' : 'low';
  else if (/intel|uhd|iris|mali|adreno|powervr/.test(g)) tier = cores >= 8 && mem >= 8 ? 'medium' : 'low';
  else tier = cores >= 8 ? 'medium' : 'low';

  const forced = new URLSearchParams(location.search).get('q');
  if (forced === 'high' || forced === 'medium' || forced === 'low') tier = forced;

  const base = {
    high: { shadowMapSize: 8192, shadowLength: 420, pcssSearch: 12, pcssFilter: 24, msaa: 4, maxPixelRatio: 2, minScale: 0.6, bloom: true, oceanDetail: 1, grass: 1, waveVoices: 10 },
    medium: { shadowMapSize: 4096, shadowLength: 300, pcssSearch: 8, pcssFilter: 16, msaa: 4, maxPixelRatio: 1.25, minScale: 0.6, bloom: true, oceanDetail: 0.7, grass: 0.6, waveVoices: 8 },
    low: { shadowMapSize: 2048, shadowLength: 200, pcssSearch: 5, pcssFilter: 9, msaa: 0, maxPixelRatio: 1.25, minScale: 0.6, bloom: false, oceanDetail: 0.45, grass: 0.25, waveVoices: 5 },
  }[tier];

  return { tier, mobile, gpu, ...base };
}
