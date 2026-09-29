// Stand-in ground for the sky-and-lighting stage: the terrain, coloured by surface. Later stages cover it
// with the real street, lawn and sand, and it stays as the far apron beyond the district.
import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial } from 'three';
import { terrainHeight, terrainSurface, type Surface } from './layout';

const COLORS: Record<Surface, string> = {
  pavement: '#b9b1a6',
  curb: '#c9c2b8',
  asphalt: '#4a4a4e',
  grass: '#55733a',
  sand: '#e6d8bd',
  wetsand: '#9c8a70',
  water: '#2d6f7a',
  wood: '#8a6b4a',
  tile: '#c7a58a',
};

export function buildStandInGround(): Mesh {
  const x0 = 10.5;
  const x1 = 150;
  const z0 = -420;
  const z1 = 420;
  const dx = 0.8;
  const dz = 1.6;
  const nx = Math.round((x1 - x0) / dx) + 1;
  const nz = Math.round((z1 - z0) / dz) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const c = new Color();
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * dx;
      const z = z0 + j * dz;
      const k = (j * nx + i) * 3;
      pos[k] = x;
      pos[k + 1] = terrainHeight(x, z);
      pos[k + 2] = z;
      c.set(COLORS[terrainSurface(x, z)]);
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let p = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const cc = a + nx;
      const d = cc + 1;
      idx[p++] = a;
      idx[p++] = cc;
      idx[p++] = b;
      idx[p++] = b;
      idx[p++] = cc;
      idx[p++] = d;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const m = new Mesh(g, new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  m.receiveShadow = true;
  m.name = 'standin-ground';
  return m;
}
