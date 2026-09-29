// Where the Collect Drop garage stands: in Lummus Park across Ocean Drive from the Collect row, its door facing
// the street, the odds tower on its south side (nearest the start), your garage bays to the north.
// Local frame: +z out of the door, +x towards the tower; with yaw −π/2 local +z is world −x (west).
export const DROP_SITE = { x: 24.2, z: 98, yaw: -Math.PI / 2 };

/** local (x, z) → world (x, z) */
export function dropToWorld(lx: number, lz: number): [number, number] {
  const c = Math.cos(DROP_SITE.yaw);
  const s = Math.sin(DROP_SITE.yaw);
  return [DROP_SITE.x + lx * c + lz * s, DROP_SITE.z - lx * s + lz * c];
}

/** the world rectangle the pavilion, apron and bays take: no palms, benches or grass there */
export const DROP_FOOTPRINT = { x0: 14.4, x1: 29.2, z0: 80.2, z1: 106.2 };

export function inDropSite(x: number, z: number, pad = 0): boolean {
  const f = DROP_FOOTPRINT;
  return x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad;
}
