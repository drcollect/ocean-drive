// Geometry accumulator for procedural models: flat-shaded triangles with colour, uv and an optional vec4
// attribute, merged into one BufferGeometry per material. Everything in the district is built with this.
import { BufferAttribute, BufferGeometry, Matrix4, Vector3, type Vector3Like } from 'three';

const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();

export type V3 = [number, number, number];

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  aux: number[] = [];
  /** current vertex colour (linear) */
  color: V3 = [1, 1, 1];
  /** current aux value */
  auxv: [number, number, number, number] = [0, 0, 0, 0];

  get count(): number {
    return this.pos.length / 3;
  }

  setColor(c: V3 | { r: number; g: number; b: number }): this {
    this.color = Array.isArray(c) ? c : [c.r, c.g, c.b];
    return this;
  }

  private v(p: Vector3Like, n: Vector3Like, u: number, w: number): void {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(this.color[0], this.color[1], this.color[2]);
    this.uv.push(u, w);
    this.aux.push(this.auxv[0], this.auxv[1], this.auxv[2], this.auxv[3]);
  }

  /** Triangle (counter-clockwise seen from the front), flat normal unless given. */
  tri(a: Vector3Like, b: Vector3Like, c: Vector3Like, uva: [number, number] = [0, 0], uvb: [number, number] = [1, 0], uvc: [number, number] = [1, 1], n?: Vector3Like): this {
    if (!n) {
      _a.set(b.x - a.x, b.y - a.y, b.z - a.z);
      _b.set(c.x - a.x, c.y - a.y, c.z - a.z);
      _n.crossVectors(_a, _b).normalize();
      n = _n;
    }
    this.v(a, n, uva[0], uva[1]);
    this.v(b, n, uvb[0], uvb[1]);
    this.v(c, n, uvc[0], uvc[1]);
    return this;
  }

  /** Quad a-b-c-d counter-clockwise from the front; uv (0,0)…(1,1) unless given as [u0,v0,u1,v1]. */
  quad(a: Vector3Like, b: Vector3Like, c: Vector3Like, d: Vector3Like, uvr: [number, number, number, number] = [0, 0, 1, 1], n?: Vector3Like): this {
    const [u0, v0, u1, v1] = uvr;
    this.tri(a, b, c, [u0, v0], [u1, v0], [u1, v1], n);
    this.tri(a, c, d, [u0, v0], [u1, v1], [u0, v1], n);
    return this;
  }

  /** Axis-aligned box; `skip` omits faces: 'px','nx','py','ny','pz','nz'. uv in metres. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skip: string[] = []): this {
    const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    if (!skip.includes('px')) this.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), [z1, y0, z1 - dz, y1]);
    if (!skip.includes('nx')) this.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), [z0, y0, z0 + dz, y1]);
    if (!skip.includes('py')) this.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), [x0, z1, x0 + dx, z0]);
    if (!skip.includes('ny')) this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), [x0, z0, x0 + dx, z1]);
    if (!skip.includes('pz')) this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [x0, y0, x0 + dx, y1]);
    if (!skip.includes('nz')) this.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), [x1, y0, x1 - dx, y1]);
    return this;
  }

  /** Oriented box: centre c, half-axes ax, ay, az (need not be unit). */
  obox(c: Vector3, ax: Vector3, ay: Vector3, az: Vector3, skip: string[] = []): this {
    const p = (sx: number, sy: number, sz: number) => c.clone().addScaledVector(ax, sx).addScaledVector(ay, sy).addScaledVector(az, sz);
    const lx = ax.length() * 2;
    const ly = ay.length() * 2;
    const lz = az.length() * 2;
    if (!skip.includes('px')) this.quad(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), [0, 0, lz, ly]);
    if (!skip.includes('nx')) this.quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), [0, 0, lz, ly]);
    if (!skip.includes('py')) this.quad(p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1), [0, 0, lx, lz]);
    if (!skip.includes('ny')) this.quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), [0, 0, lx, lz]);
    if (!skip.includes('pz')) this.quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), [0, 0, lx, ly]);
    if (!skip.includes('nz')) this.quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), [0, 0, lx, ly]);
    return this;
  }

  /** Box spanning a segment p0→p1 (a bar): `up` is the thickness vector, `width` the size across both. */
  bar(p0: Vector3, p1: Vector3, up: Vector3, width: number, skip: string[] = []): this {
    const c = p0.clone().add(p1).multiplyScalar(0.5);
    const ax = p1.clone().sub(p0).multiplyScalar(0.5);
    const side = ax.clone().cross(up).normalize().multiplyScalar(width * 0.5);
    return this.obox(c, ax, up.clone().multiplyScalar(0.5), side, skip);
  }

  /** Truncated cone / cylinder from p0 (radius r0) to p1 (radius r1), smooth normals. */
  cylinder(p0: Vector3, p1: Vector3, r0: number, r1: number, seg: number, caps = true, v0 = 0, v1 = 1): this {
    const axis = p1.clone().sub(p0);
    const len = axis.length();
    axis.normalize();
    const t1 = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0).cross(axis).normalize() : new Vector3(1, 0, 0).cross(axis).normalize();
    const t2 = axis.clone().cross(t1).normalize();
    const slope = (r0 - r1) / Math.max(len, 1e-6);
    const ring = (i: number) => {
      const a = (i / seg) * Math.PI * 2;
      return t1.clone().multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
    };
    for (let i = 0; i < seg; i++) {
      const d0 = ring(i);
      const d1 = ring(i + 1);
      const n0 = d0.clone().addScaledVector(axis, slope).normalize();
      const n1 = d1.clone().addScaledVector(axis, slope).normalize();
      const a = p0.clone().addScaledVector(d0, r0);
      const b = p0.clone().addScaledVector(d1, r0);
      const c = p1.clone().addScaledVector(d1, r1);
      const d = p1.clone().addScaledVector(d0, r1);
      const u0 = i / seg;
      const u1 = (i + 1) / seg;
      this.v(a, n0, u0, v0);
      this.v(b, n1, u1, v0);
      this.v(c, n1, u1, v1);
      this.v(a, n0, u0, v0);
      this.v(c, n1, u1, v1);
      this.v(d, n0, u0, v1);
      if (caps) {
        if (r1 > 0) this.tri(p1, d, c);
        if (r0 > 0) this.tri(p0, b, a);
      }
    }
    return this;
  }

  /** Append another builder's triangles transformed by m. */
  append(o: GeoBuilder, m?: Matrix4): this {
    const nm = m ? new Matrix4().copy(m).invert().transpose() : null;
    for (let i = 0; i < o.pos.length; i += 3) {
      _a.set(o.pos[i], o.pos[i + 1], o.pos[i + 2]);
      _b.set(o.nor[i], o.nor[i + 1], o.nor[i + 2]);
      if (m) {
        _a.applyMatrix4(m);
        _b.applyMatrix4(nm!).normalize();
      }
      this.pos.push(_a.x, _a.y, _a.z);
      this.nor.push(_b.x, _b.y, _b.z);
    }
    this.col.push(...o.col);
    this.uv.push(...o.uv);
    this.aux.push(...o.aux);
    return this;
  }

  build(withAux = false): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    if (withAux) g.setAttribute('aux', new BufferAttribute(new Float32Array(this.aux), 4));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Point helper */
export const P = (x: number, y: number, z: number) => new Vector3(x, y, z);