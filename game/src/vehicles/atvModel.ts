// The lifeguard ATV: a small red utility quad with fat knobby tyres, a black tubular front rack and a rear
// rack, a long black seat and wide bars. Built in local space: front +Z, left +X, wheels on y = 0.
import { ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, Vector3, type BufferGeometry } from 'three';
import { GeoBuilder } from '../core/builder';
import { lin } from '../world/materials';

const P = (x: number, y: number, z: number) => new Vector3(x, y, z);

function fender(z0: number, z1: number, y0: number, top: number, w: number): BufferGeometry {
  // side profile of a fender: an arch hugging the wheel, extruded across the width
  const s = new Shape();
  const r = (z1 - z0) / 2;
  const cz = (z0 + z1) / 2;
  s.moveTo(z0 - 0.06, y0);
  s.absarc(cz, y0, r + 0.06, Math.PI, 0, true);
  s.lineTo(z1 + 0.06, y0);
  s.lineTo(z1, y0 - 0.02);
  s.absarc(cz, y0, r, 0, Math.PI, false);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2, curveSegments: 14 });
  g.rotateY(-Math.PI / 2);
  g.translate(w / 2, 0, 0);
  void top;
  return g;
}

export interface AtvModel {
  root: Group;
  wheels: Group[];
  bars: Group;
}

export function buildAtvModel(): AtvModel {
  const root = new Group();
  root.name = 'atv';
  const red = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.05 });
  red.color.setRGB(...lin('#c8211b'));
  const black = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
  const seatMat = new MeshStandardMaterial({ roughness: 0.7 });
  seatMat.color.setRGB(...lin('#151515'));
  const add = (g: BufferGeometry, m: MeshStandardMaterial) => {
    const mesh = new Mesh(g, m);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const wz = 0.62; // wheel centres ±z
  const wr = 0.29;
  // fenders
  for (const [z0, z1] of [[wz - 0.36, wz + 0.36], [-wz - 0.36, -wz + 0.36]] as [number, number][]) {
    for (const s of [-1, 1]) {
      const f = fender(z0, z1, wr + 0.02, 0.7, 0.34);
      f.translate(s * 0.46, 0, 0);
      add(f, red);
    }
  }
  // body: tank, side panels, nose
  const body = new GeoBuilder();
  body.setColor([1, 1, 1]);
  body.box(-0.3, 0.42, -0.45, 0.3, 0.72, 0.5);
  body.box(-0.24, 0.72, 0.05, 0.24, 0.86, 0.45); // tank
  body.box(-0.62, 0.62, 0.35, 0.62, 0.7, 0.95); // front fender deck
  body.box(-0.62, 0.62, -0.95, 0.62, 0.7, -0.35); // rear deck
  body.box(-0.34, 0.5, 0.95, 0.34, 0.74, 1.08); // nose / headlight pod
  const bg = body.build();
  bg.deleteAttribute('color');
  add(bg, red);
  // seat
  const seat = new GeoBuilder();
  seat.box(-0.2, 0.84, -0.62, 0.2, 0.96, 0.08);
  seat.box(-0.18, 0.96, -0.58, 0.18, 0.99, 0.04);
  const sg = seat.build();
  sg.deleteAttribute('color');
  add(sg, seatMat);
  // racks, frame, footrests, engine: black
  const k = new GeoBuilder();
  k.setColor(lin('#1a1a1a'));
  // tubular racks: round tubes, a frame and cross bars
  const rack = (zc: number, y: number, w: number, l: number) => {
    const tube = (a: Vector3, b: Vector3, r: number) => k.cylinder(a, b, r, r, 7, true);
    for (const s of [-1, 1]) tube(P(s * w, y, zc - l), P(s * w, y, zc + l), 0.02);
    for (const zz of [zc - l, zc + l]) tube(P(-w, y, zz), P(w, y, zz), 0.02);
    for (let i = 1; i < 4; i++) {
      const z = zc - l + (2 * l * i) / 4;
      tube(P(-w, y, z), P(w, y, z), 0.014);
    }
    for (const s of [-1, 1]) for (const zz of [zc - l, zc + l]) tube(P(s * w, y - 0.12, zz), P(s * w, y, zz), 0.016);
  };
  rack(0.72, 0.8, 0.46, 0.26);
  rack(-0.75, 0.78, 0.46, 0.22);
  k.box(-0.24, 0.26, -0.3, 0.24, 0.48, 0.3); // engine
  for (const s of [-1, 1]) k.box(s * 0.3, 0.3, -0.25, s * 0.52, 0.34, 0.15); // footrests
  // headlights
  k.setColor(lin('#e8e6de'));
  for (const s of [-1, 1]) k.box(s * 0.2 - 0.08, 0.6, 1.07, s * 0.2 + 0.08, 0.68, 1.1);
  add(k.build(), black);
  // wheels: fat knobby tyres with red rims
  const wheels: Group[] = [];
  const tyre = new GeoBuilder();
  tyre.setColor(lin('#161616'));
  tyre.cylinder(P(-0.13, 0, 0), P(0.13, 0, 0), wr, wr, 18, true);
  // knobs
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    for (const x of [-0.07, 0.07]) {
      const c = P(x + (i % 2 ? 0.02 : -0.02), Math.cos(a) * (wr + 0.012), Math.sin(a) * (wr + 0.012));
      tyre.obox(c, P(0.035, 0, 0), P(0, Math.cos(a), Math.sin(a)).multiplyScalar(0.014), P(0, -Math.sin(a), Math.cos(a)).multiplyScalar(0.035));
    }
  }
  tyre.setColor(lin('#b01c17'));
  tyre.cylinder(P(0.12, 0, 0), P(0.135, 0, 0), wr * 0.55, wr * 0.55, 12, true);
  tyre.cylinder(P(-0.135, 0, 0), P(-0.12, 0, 0), wr * 0.55, wr * 0.55, 12, true);
  const tg = tyre.build();
  const tyreMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  for (const [x, z] of [[0.5, wz], [-0.5, wz], [0.5, -wz], [-0.5, -wz]] as [number, number][]) {
    const w = new Group();
    w.position.set(x, wr, z);
    const spin = new Group();
    const m = new Mesh(tg, tyreMat);
    m.castShadow = m.receiveShadow = true;
    spin.add(m);
    w.add(spin);
    root.add(w);
    wheels.push(spin);
  }
  // handlebars on a steering column (steers as a group)
  const bars = new Group();
  bars.position.set(0, 0.86, 0.36);
  const hb = new GeoBuilder();
  hb.setColor(lin('#1d1d1d'));
  hb.cylinder(P(0, -0.1, 0), P(0, 0.22, -0.04), 0.024, 0.024, 8, true); // column
  hb.cylinder(P(-0.3, 0.24, -0.08), P(0.3, 0.24, -0.08), 0.014, 0.014, 8, true); // bar
  for (const s of [-1, 1]) {
    hb.cylinder(P(s * 0.3, 0.24, -0.08), P(s * 0.34, 0.25, -0.1), 0.014, 0.014, 8, true);
    hb.cylinder(P(s * 0.34, 0.25, -0.1), P(s * 0.46, 0.25, -0.11), 0.021, 0.021, 10, true); // grip
    hb.box(s * 0.28 - 0.03, 0.26, -0.13, s * 0.28 + 0.03, 0.28, -0.05); // lever mount
  }
  hb.setColor(lin('#2a2a2a'));
  hb.box(-0.07, 0.2, -0.1, 0.07, 0.26, 0.0); // display pod
  const hm = new Mesh(hb.build(), black);
  hm.castShadow = true;
  bars.add(hm);
  root.add(bars);
  return { root, wheels, bars };
}
