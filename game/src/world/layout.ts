// The district: 680 m of Ocean Drive along Z (north is −Z), cross-section along X from the hotels (west,
// −X) to the Atlantic (east, +X). One metre = one unit, Y up. Every module places things from these numbers,
// and the terrain functions here are shared by the meshes, the walker and the vehicles.
import { clamp, fbm2, smoothstep, vnoise2 } from '../core/rng';

export const Z_MIN = -340;
export const Z_MAX = 340;

/** Cross-section lines (x, metres). */
export const X = {
  /** rear line of the hotel lots */
  lotBack: -46,
  /** typical front facade line; each hotel varies a little */
  facade: -17,
  /** front edge of the café terraces = back of the public sidewalk */
  terraceEdge: -12.5,
  /** west curb */
  curbW: -7,
  /** east curb */
  curbE: 7,
  /** east sidewalk → park lawn */
  parkW: 10.5,
  /** lawn → promenade (varies with z, see promenadeW) */
  promW: 35.5,
  /** promenade → fence and dune plants */
  promE: 41.5,
  /** dune strip → open beach */
  beachW: 52,
  /** berm crest, wrack line */
  berm: 104,
  /** mean waterline */
  shore: 124,
} as const;

export const SIDEWALK_Y = 0.15;
export const PROMENADE_Y = 0.36;

/** Six cross streets running west from Ocean Drive. */
export const CROSS_Z = [-242.9, -145.7, -48.6, 48.6, 145.7, 242.9] as const;
export const CROSS_ROAD_HALF = 5;
export const CROSS_HALF = 8.5; // road + sidewalks

/** Hotel blocks (z ranges between cross streets), north to south. */
export const BLOCKS: [number, number][] = (() => {
  const out: [number, number][] = [];
  let z0 = Z_MIN;
  for (const cz of CROSS_Z) {
    out.push([z0, cz - CROSS_HALF]);
    z0 = cz + CROSS_HALF;
  }
  out.push([z0, Z_MAX]);
  return out;
})();

/** Which cross street (index) a z lies on, or −1. `pad` widens the band. */
export function crossStreetAt(z: number, pad = 0): number {
  for (let i = 0; i < CROSS_Z.length; i++) if (Math.abs(z - CROSS_Z[i]) < CROSS_HALF + pad) return i;
  return -1;
}

/** Promenade edges wander a little so the park doesn't read as a ruler line. */
export function promenadeW(z: number): number {
  return X.promW + 1.1 * Math.sin(z * 0.041 + 0.6) + 0.5 * Math.sin(z * 0.013 + 2.0);
}
export function promenadeE(z: number): number {
  return promenadeW(z) + 5.6;
}

/** Beach profile (no micro relief): used by the sand mesh, the walker and, in GLSL, the ocean. */
export function beachProfile(x: number): number {
  if (x < X.berm) {
    // backshore: nearly flat, sloping gently seaward
    return 1.02 - ((x - X.beachW) / (X.berm - X.beachW)) * 0.24;
  }
  if (x < X.shore) {
    // foreshore: 0.78 at the berm to 0 at the waterline, slightly concave
    const t = (x - X.berm) / (X.shore - X.berm);
    return 0.78 * (1 - t) * (1 - 0.18 * t);
  }
  // seabed
  const d = x - X.shore;
  if (d < 36) return -0.042 * d;
  return -0.042 * 36 - (d - 36) * 0.016;
}

/** Low dune strip behind the fence: hummocks between the promenade and the beach. */
function duneHeight(x: number, z: number): number {
  const pe = promenadeE(z);
  const t = clamp((x - pe) / (X.beachW - pe), 0, 1);
  const hump = Math.sin(t * Math.PI) * (0.55 + 0.45 * fbm2(z * 0.05, 3.1, 3, 11));
  const base = PROMENADE_Y + (beachProfile(X.beachW) - PROMENADE_Y) * smoothstep(0, 1, t);
  return base + hump * 0.75;
}

/** Terrain height without buildings or props. */
export function terrainHeight(x: number, z: number): number {
  if (x < X.curbW) {
    // west sidewalk (terraces are separate height boxes); cross streets drop to road level
    const cs = crossStreetAt(z);
    if (cs >= 0 && Math.abs(z - CROSS_Z[cs]) < CROSS_ROAD_HALF) return x > X.terraceEdge ? 0.02 : 0;
    return SIDEWALK_Y;
  }
  if (x < X.curbE) {
    // Ocean Drive, slight crown
    const c = 1 - (x / X.curbE) ** 2;
    return 0.05 * c;
  }
  if (x < X.parkW) return SIDEWALK_Y;
  const pw = promenadeW(z);
  if (x < pw) {
    // lawn with soft mounds
    const edge = smoothstep(X.parkW, X.parkW + 3, x) * (1 - smoothstep(pw - 3, pw, x));
    return 0.2 + edge * (fbm2(x * 0.045, z * 0.045, 3, 5) - 0.45) * 0.55;
  }
  if (x < promenadeE(z)) return PROMENADE_Y;
  if (x < X.beachW) return duneHeight(x, z);
  // beach: profile + low undulation that fades out on the foreshore
  const p = beachProfile(x);
  // the relief dies out at the berm: the foreshore is exactly the profile (the swash shader relies on it)
  const f = 1 - smoothstep(X.berm - 14, X.berm + 1, x);
  const und = (fbm2(x * 0.03, z * 0.03, 3, 21) - 0.5) * 0.36 + (vnoise2(x * 0.18, z * 0.12, 23) - 0.5) * 0.06;
  // ridge and runnel just seaward of the dunes
  const ridge = Math.exp(-(((x - 58) / 4) ** 2)) * 0.12;
  return p + (und + ridge) * f;
}

export type Surface = 'pavement' | 'curb' | 'asphalt' | 'grass' | 'sand' | 'wetsand' | 'water' | 'wood' | 'tile';

/** Static surface type (the swash, terraces and stairs are layered on top by the world registry). */
export function terrainSurface(x: number, z: number): Surface {
  if (x < X.curbW) {
    const cs = crossStreetAt(z);
    if (cs >= 0 && Math.abs(z - CROSS_Z[cs]) < CROSS_ROAD_HALF) return 'asphalt';
    return x > X.curbW - 0.35 ? 'curb' : 'pavement';
  }
  if (x < X.curbE) return 'asphalt';
  if (x < X.curbE + 0.35) return 'curb';
  if (x < X.parkW) return 'pavement';
  const pw = promenadeW(z);
  if (x < pw) return 'grass';
  if (x < promenadeE(z)) return 'pavement';
  if (x < X.shore - 14) return 'sand';
  return 'wetsand';
}
