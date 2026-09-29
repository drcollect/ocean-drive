// A soft elliptical contact shadow (black, alpha falling off to the edge), for what sits on the ground.
import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three';

let tex: DataTexture | null = null;

export function blobTexture(): DataTexture {
  if (tex) return tex;
  const N = 64;
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N - 0.5;
      const v = (y + 0.5) / N - 0.5;
      // a rounded rectangle, dense in the middle
      const q = Math.pow(Math.pow(Math.abs(u) * 2, 4) + Math.pow(Math.abs(v) * 2, 4), 0.25);
      const a = Math.max(0, 1 - q);
      const k = (y * N + x) * 4;
      d[k + 3] = Math.round(255 * Math.min(1, Math.pow(a, 0.9) * 1.6));
    }
  tex = new DataTexture(d, N, N, RGBAFormat, UnsignedByteType);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
