// The Collect Drop garage in Lummus Park: a streamline-Deco pavilion with a roller door, a turntable under
// a light ceiling, a pay kiosk, the live-odds board on its tower and your garage bays beside it. Walk up to
// the kiosk and press E: the bill goes in ($99, demo price), 32 random bytes come in (here from the
// browser, as on the drop's demo page), the number mod the cars left picks the edition and swap-removes it
// from the pool, the pavilion lights up in the tier's colour, the door rolls up and the car turns on the
// stand in its look. Walk in and around it; the card has the look, ratings, spec and the maths. The pool
// and your pulls are kept in this browser; R twice resets the drop. DEMO data from a proposal.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Vector3,
  Quaternion,
  Euler,
  type Material,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { GeoBuilder, P } from '../core/builder';
import type { Interactable } from '../player/player';
import type { Input } from '../player/input';
import { captureProbe, releaseProbe } from '../renderer/probe';
import type { Sky } from '../sky/sky';
import type { AudioEngine } from '../audio/engine';
import { DropSfx } from '../audio/dropSfx';
import { DropCard } from '../ui/dropCard';
import { collectCar, collectTaken, MODEL_SIZE, sharedMaterials } from '../world/collect';
import type { CandidateSource, CarCandidate } from '../vehicles/drive';
import { terrainHeight } from '../world/layout';
import { wordWidth, writeText } from '../world/letters';
import { lin, materials } from '../world/materials';
import { addBox, addHeightBox, type Collider } from '../world/registry';
import { DEMO_PRICE, dropPool, freshState, liveOdds, loadState, pull, saveState, TIERS, TOTAL, type Car, type DropState, type Pull, type Tier } from './drop01';
import { dropToWorld, DROP_SITE } from './site';

const FLOOR = 0.24;
const ROOM = { x0: -4, x1: 4, z0: -3.6, z1: 3.4, h: 4.3 };
const DOOR = { x0: -3.7, x1: 3.7, y0: FLOOR, y1: 3.56 };
const TOWER = { x0: 4.3, x1: 6.7, z0: -2.6, z1: 3.8, h: 6.3 };
const APRON = { x0: -5.4, x1: 7.4, z0: 3.4, z1: 9.0, y: 0.07 };
const TT = { x: 0, z: -0.2, r: 3.0, h: 0.07 };
const KIOSK = { x: 2.5, z: 5.5 };
const BAYS = [-7.2, -10.1, -13.0, -15.9].map((x) => ({ x, z: 1.1 }));
const SLATS = 28;

const ed = (n: number) => `#${String(n).padStart(4, '0')}`;
const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export interface GarageDeps {
  scene: Scene;
  renderer: WebGLRenderer;
  sky: Sky;
  input: Input;
  audio: () => AudioEngine | null;
}

export interface DropGarage {
  /** the car on the stand (once revealed) and the cars in the bays: get in and drive them out */
  carCandidates: CandidateSource;
  /** how a hit car becomes a moving body (the driving manager's) */
  knockWith(fn: (c: CarCandidate) => unknown): void;
  root: Object3D;
  interactable: Interactable;
  update(t: number, dt: number, eye: Vector3): void;
  /** dev: pull this edition (the bytes are chosen so the maths lands on it), or a random one */
  debugPull(edition?: number): void;
  reset(): void;
  state: DropState;
  /** the phase of the pull, for tests */
  phase(): string;
}

type Phase = 'idle' | 'closing' | 'paying' | 'entropy' | 'assign' | 'opening' | 'show';
const DUR: Record<Phase, number> = { idle: 0, closing: 1.4, paying: 0.9, entropy: 2.4, assign: 1.2, opening: 3.2, show: 0 };

// ---------------------------------------------------------------- canvases

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D, CanvasTexture] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return [c, g, tex];
}
const FONT = `'Avenir Next', Avenir, Futura, 'Helvetica Neue', Arial, sans-serif`;

/** the Collect monogram: a C with a dot */
function monogram(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, lw: number): void {
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x, y, r, Math.PI * 0.22, Math.PI * 1.78);
  g.stroke();
  g.beginPath();
  g.arc(x, y, lw * 0.9, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'left' | 'center' | 'right' = 'left'): void {
  const chars = [...text];
  const w = chars.reduce((a, ch) => a + g.measureText(ch).width, 0) + spacing * (chars.length - 1);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const prev = g.textAlign;
  g.textAlign = 'left';
  for (const ch of chars) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + spacing;
  }
  g.textAlign = prev;
}

function shutterArt(): CanvasTexture {
  const [, g, tex] = canvas(1024, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#2b2e35');
  grd.addColorStop(1, '#1b1d22');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 512);
  // the tier palette as thin bands low on the door
  TIERS.forEach((t, i) => {
    g.fillStyle = t.color;
    g.fillRect(0, 392 + i * 12, 1024, 5);
  });
  monogram(g, 512, 178, 70, '#f3efe8', 16);
  g.fillStyle = '#f3efe8';
  g.font = `600 64px ${FONT}`;
  g.textBaseline = 'middle';
  spaced(g, 'COLLECT', 512, 300, 18, 'center');
  g.font = `500 26px ${FONT}`;
  g.globalAlpha = 0.8;
  spaced(g, 'DROP 01 · NIGHT RUN · DEMO', 512, 352, 8, 'center');
  g.globalAlpha = 1;
  tex.needsUpdate = true;
  return tex;
}

function backWallArt(): CanvasTexture {
  const [, g, tex] = canvas(1024, 384);
  const grd = g.createRadialGradient(512, 200, 20, 512, 200, 620);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.55, '#c9c9c9');
  grd.addColorStop(1, '#6a6a6a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 384);
  g.globalAlpha = 0.14;
  monogram(g, 512, 192, 120, '#000000', 22);
  g.globalAlpha = 1;
  tex.needsUpdate = true;
  return tex;
}

function dotTexture(): CanvasTexture {
  const [, g, tex] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- geometry

/** The shutter: slats with a slight corrugation; `slat` holds each slat's bottom so the shader can roll it up. */
function shutterGeometry(): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const slat: number[] = [];
  const h = (DOOR.y1 - DOOR.y0) / SLATS;
  const z = 3.56;
  const x0 = DOOR.x0 - 0.05;
  const x1 = DOOR.x1 + 0.05;
  const push = (x: number, y: number, zz: number, n: [number, number, number], y0: number) => {
    pos.push(x, y, zz);
    nor.push(...n);
    uv.push((x - x0) / (x1 - x0), (y - DOOR.y0) / (DOOR.y1 - DOOR.y0));
    slat.push(y0);
  };
  for (let i = 0; i < SLATS; i++) {
    const y0 = DOOR.y0 + i * h;
    const ym = y0 + h * 0.5;
    const y1 = y0 + h - 0.004;
    const bulge = 0.012;
    // lower half leaning out, upper half leaning back
    const nLow: [number, number, number] = [0, -0.24, 0.97];
    const nUp: [number, number, number] = [0, 0.24, 0.97];
    for (const [ya, yb, za, zb, n] of [
      [y0, ym, z, z + bulge, nLow],
      [ym, y1, z + bulge, z, nUp],
    ] as [number, number, number, number, [number, number, number]][]) {
      push(x0, ya, za, n, y0);
      push(x1, ya, za, n, y0);
      push(x1, yb, zb, n, y0);
      push(x0, ya, za, n, y0);
      push(x1, yb, zb, n, y0);
      push(x0, yb, zb, n, y0);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('slat', new BufferAttribute(new Float32Array(slat), 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- the board

interface BoardData {
  phase: Phase;
  t: number;
  /** the tier has been shown (the sting played): until then the board keeps the suspense */
  revealed: boolean;
  state: DropState;
  pool: Car[];
  pending: { car: Car; pull: Pull } | null;
  showing: { car: Car; pull: Pull } | null;
}

function drawBoard(g: CanvasRenderingContext2D, d: BoardData): void {
  const W = 640;
  const H = 960;
  g.fillStyle = '#0b0d13';
  g.fillRect(0, 0, W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(60,70,110,0.35)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#f3efe8';
  monogram(g, 70, 78, 30, '#f3efe8', 8);
  g.font = `600 44px ${FONT}`;
  spaced(g, 'COLLECT', 118, 94, 10);
  g.font = `500 20px ${FONT}`;
  g.globalAlpha = 0.75;
  spaced(g, 'DROP 01 · NIGHT RUN', 120, 128, 5);
  g.globalAlpha = 1;
  // DEMO badge
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 2;
  g.strokeRect(W - 128, 54, 88, 34);
  g.font = `600 18px ${FONT}`;
  spaced(g, 'DEMO', W - 84, 78, 4, 'center');
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(40, 156, W - 80, 2);
  const left = d.state.pool.length;
  const pending = d.pending;
  const busy = d.phase === 'entropy' || d.phase === 'assign' || d.phase === 'paying' || (d.phase === 'opening' && !d.revealed);
  if (busy && pending) {
    const p = pending.pull;
    g.fillStyle = '#f3efe8';
    g.font = `600 26px ${FONT}`;
    const title = { paying: 'PAYMENT · ' + DEMO_PRICE.toUpperCase(), entropy: 'REQUESTING RANDOMNESS', assign: 'ASSIGNING', opening: 'YOUR CAR IS HERE' } as Record<string, string>;
    spaced(g, title[d.phase] ?? '', W / 2, 230, 4, 'center');
    g.font = `400 17px ${FONT}`;
    g.globalAlpha = 0.6;
    spaced(g, 'CollectEntropy · demo: browser randomness', W / 2, 262, 1, 'center');
    g.globalAlpha = 1;
    // the 32 bytes, settling left to right
    const settle = d.phase === 'entropy' ? clamp01((d.t - 0.4) / 1.8) : d.phase === 'assign' || d.phase === 'opening' ? 1 : 0;
    const hex = p.bytes;
    g.font = `500 30px ui-monospace, Menlo, monospace`;
    for (let row = 0; row < 4; row++) {
      let line = '';
      for (let i = 0; i < 16; i++) {
        const k = row * 16 + i;
        line += k / 64 < settle ? hex[k] : '0123456789abcdef'[Math.floor(Math.random() * 16)];
        if (i % 2 === 1 && i < 15) line += ' ';
      }
      g.fillStyle = settle >= 1 ? '#f3efe8' : 'rgba(243,239,232,0.75)';
      g.fillText(line, 58, 330 + row * 46);
    }
    if (d.phase === 'assign' || d.phase === 'opening') {
      g.fillStyle = '#f3efe8';
      g.font = `500 24px ${FONT}`;
      g.fillText(`value mod ${fmt(p.poolSize)} = ${fmt(p.idx)}`, 58, 560);
      g.fillText(`pool[${fmt(p.idx)}] = ${ed(p.edition)}`, 58, 600);
      g.globalAlpha = 0.7;
      g.fillText(p.moved ? `${ed(p.moved)} moves into slot ${fmt(p.idx)}` : 'the last slot: nothing moves', 58, 640);
      g.globalAlpha = 1;
    }
  } else if ((d.phase === 'opening' || d.phase === 'show') && d.showing) {
    const { car, pull: p } = d.showing;
    const t = car.tier;
    g.fillStyle = t.color;
    g.font = `700 ${t.name.length > 9 ? 52 : 60}px ${FONT}`;
    spaced(g, t.name.toUpperCase(), W / 2, 258, 6, 'center');
    g.fillStyle = '#f3efe8';
    g.font = `600 34px ${FONT}`;
    spaced(g, `${t.bodyName.toUpperCase()} · ${ed(car.edition)}`, W / 2, 318, 4, 'center');
    g.font = `400 22px ${FONT}`;
    g.globalAlpha = 0.75;
    spaced(g, `${car.serial} of ${t.count} · PI ${car.pi}`, W / 2, 358, 2, 'center');
    g.globalAlpha = 1;
    g.font = `500 21px ${FONT}`;
    const L = car.looks;
    const lines = [
      ['Paint', L.paint.name],
      ['Pattern', { none: 'None', split: 'Split', twin: 'Twin Stripe', circuit: 'Circuit', topo: 'Topographic', hex: 'Hex', glitch: 'Glitch', monogram: 'Monogram' }[L.pattern]],
      ['Finish', L.finish],
      ['Light', L.light],
      ['Wheels', L.wheels],
    ];
    lines.forEach(([k, v], i) => {
      g.globalAlpha = 0.55;
      g.fillText(k.toUpperCase(), 70, 430 + i * 38);
      g.globalAlpha = 1;
      g.fillText(v, 220, 430 + i * 38);
    });
    g.globalAlpha = 0.55;
    g.font = `400 16px ui-monospace, Menlo, monospace`;
    g.fillText(`${p.bytes.slice(0, 32)}`, 70, 640);
    g.fillText(`${p.bytes.slice(32)}`, 70, 662);
    g.fillText(`mod ${p.poolSize} = ${p.idx} → ${ed(p.edition)}`, 70, 688);
    g.globalAlpha = 1;
  } else {
    // idle: price and the live odds
    g.fillStyle = '#f3efe8';
    g.font = `600 30px ${FONT}`;
    spaced(g, left > 0 ? 'PULL A CAR' : 'SOLD OUT', 58, 224, 4);
    g.font = `400 22px ${FONT}`;
    g.globalAlpha = 0.75;
    g.fillText(`${DEMO_PRICE} · one fixed price, no re-rolls`, 58, 262);
    g.globalAlpha = 1;
    g.font = `700 76px ${FONT}`;
    g.fillText(fmt(left), 58, 370);
    g.font = `400 24px ${FONT}`;
    g.globalAlpha = 0.6;
    g.fillText(`of ${fmt(TOTAL)} cars left`, 58 + g.measureText(fmt(left)).width + 190, 370);
    g.globalAlpha = 1;
  }
  // live odds, always at the bottom
  const odds = liveOdds(d.state, d.pool);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(40, 716, W - 80, 2);
  g.font = `600 17px ${FONT}`;
  g.fillStyle = '#f3efe8';
  g.globalAlpha = 0.6;
  spaced(g, 'LIVE ODDS · NEXT PULL', 58, 750, 3);
  g.globalAlpha = 1;
  odds.forEach((o, i) => {
    const y = 786 + i * 34;
    g.fillStyle = o.tier.color;
    g.fillRect(58, y - 16, 16, 16);
    g.fillStyle = '#f3efe8';
    g.font = `500 21px ${FONT}`;
    g.fillText(`${o.tier.name}`, 88, y);
    g.globalAlpha = 0.6;
    g.fillText(o.tier.bodyName, 250, y);
    g.globalAlpha = 1;
    g.textAlign = 'right';
    g.fillText(`${fmt(o.left)}`, 470, y);
    g.fillText(`${fmt(o.odds * 100, 1)}%`, W - 58, y);
    g.textAlign = 'left';
  });
}

function drawKiosk(g: CanvasRenderingContext2D, phase: Phase, state: DropState, pending: { car: Car; pull: Pull } | null, revealed: boolean): void {
  g.fillStyle = '#0d1016';
  g.fillRect(0, 0, 320, 208);
  g.fillStyle = '#f3efe8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (phase === 'paying') {
    g.font = `600 30px ${FONT}`;
    g.fillText('PROCESSING…', 160, 90);
    g.font = `400 18px ${FONT}`;
    g.fillText(DEMO_PRICE, 160, 132);
  } else if (phase === 'entropy' || phase === 'assign' || phase === 'opening' || phase === 'closing') {
    g.font = `600 28px ${FONT}`;
    g.fillText(phase === 'closing' ? 'NEXT CAR…' : 'THANK YOU', 160, 84);
    if (pending && phase !== 'closing') {
      g.font = `400 20px ${FONT}`;
      g.fillText(phase === 'opening' ? (revealed ? `${ed(pending.car.edition)} · ${pending.car.tier.name}` : `${ed(pending.car.edition)} · look up`) : 'your car is coming', 160, 128);
    }
  } else {
    g.font = `700 44px ${FONT}`;
    g.fillText('$99', 160, 76);
    g.font = `400 18px ${FONT}`;
    g.fillText('demo price · DEMO', 160, 114);
    g.font = `600 18px ${FONT}`;
    g.fillStyle = state.pool.length ? '#9fe8c9' : '#ff8a7a';
    g.fillText(state.pool.length ? 'press E to pay and pull' : 'sold out · R R to reset', 160, 160);
  }
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------- the garage

export async function buildDropGarage(d: GarageDeps): Promise<DropGarage> {
  const lib = materials();
  const pool = dropPool();
  let state = loadState();
  const root = new Group();
  root.name = 'drop-garage';
  // stand the pavilion on the highest lawn point under it
  let base = 0;
  for (let lx = -17; lx <= 7.6; lx += 0.8) for (let lz = -4.2; lz <= 9.2; lz += 0.8) base = Math.max(base, terrainHeight(...dropToWorld(lx, lz)));
  base += 0.02;
  root.position.set(DROP_SITE.x, base, DROP_SITE.z);
  root.rotation.y = DROP_SITE.yaw;
  root.updateMatrixWorld(true);
  const toWorld = (lx: number, ly: number, lz: number) => root.localToWorld(new Vector3(lx, ly, lz));

  // ---- the building
  const walls = new GeoBuilder();
  const trims = new GeoBuilder();
  const floorB = new GeoBuilder();
  const tiles = new GeoBuilder();
  const metal = new GeoBuilder();
  walls.setColor(lin('#F2E8D8'));
  walls.box(ROOM.x0 - 0.3, -0.6, ROOM.z0 - 0.3, ROOM.x1 + 0.3, ROOM.h, ROOM.z0); // back
  walls.box(ROOM.x0 - 0.3, -0.6, ROOM.z0 - 0.3, ROOM.x0, ROOM.h, ROOM.z1 + 0.35); // left
  walls.box(ROOM.x1, -0.6, ROOM.z0 - 0.3, ROOM.x1 + 0.3, ROOM.h, ROOM.z1 + 0.35); // right
  walls.box(ROOM.x0 - 0.3, -0.6, ROOM.z1, DOOR.x0, ROOM.h, ROOM.z1 + 0.35); // pilasters
  walls.box(DOOR.x1, -0.6, ROOM.z1, ROOM.x1 + 0.3, ROOM.h, ROOM.z1 + 0.35);
  walls.box(ROOM.x0 - 0.3, DOOR.y1, ROOM.z1, ROOM.x1 + 0.3, ROOM.h, ROOM.z1 + 0.42); // fascia
  walls.box(ROOM.x0 - 0.5, ROOM.h, ROOM.z0 - 0.5, ROOM.x1 + 0.3, ROOM.h + 0.34, ROOM.z1 + 0.6); // roof
  walls.setColor(lin('#F4B8A9'));
  walls.box(TOWER.x0, -0.6, TOWER.z0, TOWER.x1, TOWER.h, TOWER.z1); // the tower, coral
  walls.box(TOWER.x0 - 0.1, TOWER.h, TOWER.z0 - 0.1, TOWER.x1 + 0.1, TOWER.h + 0.22, TOWER.z1 + 0.1);
  // mint trim: the eyebrow over the door, speed lines, the fin
  trims.setColor(lin('#8FD8C7'));
  trims.box(DOOR.x0 - 0.2, DOOR.y1 + 0.06, ROOM.z1 + 0.42, DOOR.x1 + 0.2, DOOR.y1 + 0.14, ROOM.z1 + 1.15);
  for (const y of [2.9, 3.15, 3.4]) {
    trims.box(ROOM.x0 - 0.37, y, ROOM.z0 - 0.3, ROOM.x0 - 0.3, y + 0.08, ROOM.z1 + 0.2);
    trims.box(TOWER.x1, y + 1.6, TOWER.z0 + 0.3, TOWER.x1 + 0.07, y + 1.68, TOWER.z1);
  }
  for (const x of [4.75, 5.3, 5.85, 6.35]) trims.box(x - 0.05, 0.4, TOWER.z1, x + 0.05, 1.05, TOWER.z1 + 0.07); // fluting under the board
  trims.box(5.4, TOWER.h + 0.22, -1.4, 5.6, TOWER.h + 3.9, 3.4); // the fin
  trims.box(ROOM.x0 - 0.5, ROOM.h + 0.34, ROOM.z1 + 0.3, ROOM.x1 + 0.3, ROOM.h + 0.42, ROOM.z1 + 0.6); // roof lip
  // the showroom floor, the apron and the bays
  floorB.setColor(lin('#17191E'));
  floorB.box(ROOM.x0, -0.6, ROOM.z0, ROOM.x1, FLOOR, ROOM.z1 + 0.2);
  tiles.setColor(lin('#E9DDCB'));
  tiles.box(APRON.x0, -0.8, APRON.z0, APRON.x1, APRON.y, APRON.z1);
  for (const b of BAYS) tiles.box(b.x - 1.35, -0.8, b.z - 2.9, b.x + 1.35, 0.1, b.z + 2.9);
  // kiosk: pedestal, slanted head, a bill slot
  metal.setColor(lin('#22252B'));
  metal.box(KIOSK.x - 0.22, APRON.y, KIOSK.z - 0.16, KIOSK.x + 0.22, APRON.y + 0.86, KIOSK.z + 0.16);
  metal.obox(new Vector3(KIOSK.x, APRON.y + 0.95, KIOSK.z + 0.02), new Vector3(0.26, 0, 0), new Vector3(0, 0.12, -0.12), new Vector3(0, 0.05, 0.05));
  metal.setColor(lin('#050506'));
  metal.box(KIOSK.x - 0.1, APRON.y + 0.7, KIOSK.z + 0.16, KIOSK.x + 0.1, APRON.y + 0.72, KIOSK.z + 0.175);
  // the board's frame
  metal.setColor(lin('#1C1E23'));
  metal.box(4.42, 1.15, TOWER.z1, 6.58, 4.35, TOWER.z1 + 0.06);
  const addMesh = (b: GeoBuilder, m: Material, cast = true) => {
    const mesh = new Mesh(b.build(), m);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  addMesh(walls, lib.stucco);
  addMesh(trims, lib.trim);
  addMesh(tiles, lib.tiles, false);
  addMesh(metal, lib.metal);
  // inside, glossy things reflect the showroom (captured at each reveal), never the open sky
  const floorMat = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.1, envMapIntensity: 0.2, name: 'garage-floor' });
  addMesh(floorB, floorMat, false);
  // a black showroom inside
  const inner = new GeoBuilder();
  inner.setColor(lin('#1B1D22'));
  inner.box(ROOM.x0, FLOOR, ROOM.z0, ROOM.x0 + 0.02, ROOM.h, ROOM.z1);
  inner.box(ROOM.x1 - 0.02, FLOOR, ROOM.z0, ROOM.x1, ROOM.h, ROOM.z1);
  inner.box(ROOM.x0, FLOOR, ROOM.z0, ROOM.x1, ROOM.h, ROOM.z0 + 0.012);
  inner.box(ROOM.x0, ROOM.h - 0.015, ROOM.z0, ROOM.x1, ROOM.h, ROOM.z1 + 0.3);
  // skirting: hides the sliver of low sun that shadow maps let in along the foot of the walls
  inner.box(ROOM.x0, FLOOR - 0.02, ROOM.z0, ROOM.x1, FLOOR + 0.14, ROOM.z0 + 0.09);
  inner.box(ROOM.x0, FLOOR - 0.02, ROOM.z0, ROOM.x0 + 0.09, FLOOR + 0.14, ROOM.z1);
  inner.box(ROOM.x1 - 0.09, FLOOR - 0.02, ROOM.z0, ROOM.x1, FLOOR + 0.14, ROOM.z1);
  const innerMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2, envMapIntensity: 0.2, name: 'garage-inner' });
  addMesh(inner, innerMat, false);

  // neon letters: COLLECT down both faces of the fin, DROP 01 on the fascia
  const neon = new GeoBuilder();
  neon.setColor([1, 1, 1]);
  for (const s of [1, -1]) writeText(neon, 'COLLECT', P(5.5 + s * 0.1, TOWER.h + 3.7, 1.0), P(0, 0, -s), P(s, 0, 0), { height: 0.36, vertical: true, depth: 0.05, weight: 0.12 });
  const tw = wordWidth('DROP 01') * (0.42 / 6);
  writeText(neon, 'DROP 01', P(-tw / 2, DOOR.y1 + 0.17, ROOM.z1 + 0.42), P(1, 0, 0), P(0, 0, 1), { height: 0.42, depth: 0.04, weight: 0.12 });
  const neonMat = new MeshBasicMaterial({ color: new Color(3.2, 3.1, 3.0), name: 'garage-neon' });
  const neonMesh = new Mesh(neon.build(), neonMat);
  root.add(neonMesh);

  // ---- inside: ceiling light, back light wall, side strips, the turntable
  const tierCol = new Color(1, 1, 1);
  const glow = { level: 0.08 };
  const ceilMat = new MeshBasicMaterial({ color: new Color(1, 1, 1), name: 'garage-ceiling', side: DoubleSide });
  for (const z of [-2.4, -0.5, 1.4]) {
    const panel = new Mesh(new PlaneGeometry(6.4, 1.2), ceilMat);
    panel.rotation.x = Math.PI / 2;
    panel.position.set(0, ROOM.h - 0.02, z);
    root.add(panel);
  }
  const wallMat = new MeshBasicMaterial({ map: backWallArt(), color: new Color(1, 1, 1), name: 'garage-lightwall' });
  const wall = new Mesh(new PlaneGeometry(7.4, 2.9), wallMat);
  wall.position.set(0, FLOOR + 0.4 + 1.45, ROOM.z0 + 0.02);
  root.add(wall);
  const stripMat = new MeshBasicMaterial({ color: new Color(1, 1, 1), name: 'garage-strips' });
  const strips = new GeoBuilder();
  for (const s of [-1, 1]) for (const z of [-2.6, -0.6, 1.4]) strips.box(s * 3.97 - 0.008, 0.45, z - 0.04, s * 3.97 + 0.008, 3.9, z + 0.04);
  root.add(new Mesh(strips.build(), stripMat));
  // neon round the door, along the roof lip and down the kiosk
  const frameMat = new MeshBasicMaterial({ color: new Color(1, 1, 1), name: 'garage-frame' });
  const frame = new GeoBuilder();
  const fz = ROOM.z1 + 0.355;
  frame.box(DOOR.x0 - 0.07, FLOOR, fz, DOOR.x0 - 0.03, DOOR.y1 + 0.04, fz + 0.02);
  frame.box(DOOR.x1 + 0.03, FLOOR, fz, DOOR.x1 + 0.07, DOOR.y1 + 0.04, fz + 0.02);
  frame.box(DOOR.x0 - 0.07, DOOR.y1 + 0.0, ROOM.z1 + 0.425, DOOR.x1 + 0.07, DOOR.y1 + 0.04, ROOM.z1 + 0.445);
  frame.box(ROOM.x0 - 0.5, ROOM.h + 0.2, ROOM.z1 + 0.6, ROOM.x1 + 0.3, ROOM.h + 0.24, ROOM.z1 + 0.62);
  frame.box(ROOM.x0 - 0.52, ROOM.h + 0.2, ROOM.z0 - 0.5, ROOM.x0 - 0.5, ROOM.h + 0.24, ROOM.z1 + 0.6);
  frame.box(KIOSK.x - 0.015, APRON.y + 0.08, KIOSK.z + 0.16, KIOSK.x + 0.015, APRON.y + 0.62, KIOSK.z + 0.175);
  root.add(new Mesh(frame.build(), frameMat));
  const turn = new Group();
  turn.position.set(TT.x, FLOOR, TT.z);
  root.add(turn);
  const disc = new GeoBuilder();
  disc.setColor(lin('#101114'));
  disc.cylinder(P(0, 0, 0), P(0, TT.h, 0), TT.r, TT.r, 64, true);
  const discMat = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.2, name: 'turntable' });
  const discMesh = new Mesh(disc.build(), discMat);
  discMesh.receiveShadow = true;
  turn.add(discMesh);
  const ringB = new GeoBuilder();
  ringB.cylinder(P(0, TT.h - 0.015, 0), P(0, TT.h + 0.004, 0), TT.r + 0.02, TT.r + 0.02, 96, false);
  const ringMat = new MeshBasicMaterial({ color: new Color(1, 1, 1), name: 'turntable-ring' });
  const ring = new Mesh(ringB.build(), ringMat);
  ring.position.set(TT.x, FLOOR, TT.z);
  root.add(ring);

  // ---- the roller door
  const shutterUni = { uOpen: { value: 0 }, uTop: { value: DOOR.y1 } };
  const shutterMat = new MeshStandardMaterial({ map: shutterArt(), roughness: 0.42, metalness: 0.55, side: DoubleSide, name: 'garage-shutter' });
  shutterMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shutterUni);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float slat;\nuniform float uOpen;\nuniform float uTop;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (slat + uOpen > uTop - 0.05) transformed = vec3(transformed.x, uTop + 0.25, transformed.z - 0.3);
        else transformed.y += uOpen;`,
      );
  };
  shutterMat.customProgramCacheKey = () => 'od-garage-shutter';
  const shutter = new Mesh(shutterGeometry(), shutterMat);
  shutter.frustumCulled = false;
  root.add(shutter);

  // ---- the board and the kiosk screen
  const [, boardG, boardTex] = canvas(640, 960);
  const board = new Mesh(new PlaneGeometry(2.0, 3.0), new MeshBasicMaterial({ map: boardTex, color: new Color(1.7, 1.7, 1.7), name: 'garage-board' }));
  board.position.set(5.5, 2.75, TOWER.z1 + 0.065);
  root.add(board);
  const [, kioskG, kioskTex] = canvas(320, 208);
  const kioskScreen = new Mesh(new PlaneGeometry(0.46, 0.3), new MeshBasicMaterial({ map: kioskTex, color: new Color(1.6, 1.6, 1.6), name: 'kiosk-screen' }));
  // on the slanted face of the head (its normal leans back 45°)
  kioskScreen.position.set(KIOSK.x, APRON.y + 0.95 + 0.053, KIOSK.z + 0.02 + 0.053);
  kioskScreen.rotation.x = -Math.PI / 4;
  root.add(kioskScreen);
  const bill = new Mesh(new PlaneGeometry(0.16, 0.07), new MeshStandardMaterial({ color: new Color().setRGB(...lin('#8fbf8a')), roughness: 0.8, side: DoubleSide }));
  bill.visible = false;
  root.add(bill);

  // ---- sparks for the rarer tiers
  const SPARKS = 320;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkGeo = new BufferGeometry();
  sparkGeo.setAttribute('position', new BufferAttribute(sparkPos, 3));
  const sparkMat = new PointsMaterial({ size: 0.09, map: dotTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, color: new Color(1, 1, 1) });
  const sparks = new Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.visible = false;
  root.add(sparks);
  let sparkLife = 0;
  const burst = (n: number, c: Color) => {
    sparkMat.color.copy(c).multiplyScalar(3);
    for (let i = 0; i < SPARKS; i++) {
      const on = i < n;
      const a = Math.random() * Math.PI * 2;
      const r = TT.r * (0.6 + Math.random() * 0.45);
      sparkPos.set(on ? [TT.x + Math.cos(a) * r, FLOOR + 0.1 + Math.random() * 0.3, TT.z + Math.sin(a) * r] : [0, -50, 0], i * 3);
      sparkVel.set([Math.cos(a) * 0.3 * Math.random(), 1.2 + Math.random() * 2.2, Math.sin(a) * 0.3 * Math.random()], i * 3);
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparks.visible = true;
    sparkLife = 3.2;
  };

  // ---- walking: floors and walls
  const worldBox = (x0: number, z0: number, x1: number, z1: number) => {
    const [ax, az] = dropToWorld(x0, z0);
    const [bx, bz] = dropToWorld(x1, z1);
    return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) };
  };
  addHeightBox({ ...worldBox(APRON.x0, APRON.z0, APRON.x1, APRON.z1), y: base + APRON.y, surface: 'tile' });
  addHeightBox({ ...worldBox(ROOM.x0, ROOM.z0, ROOM.x1, ROOM.z1 + 0.35), y: base + FLOOR, surface: 'tile' });
  for (const b of BAYS) addHeightBox({ ...worldBox(b.x - 1.35, b.z - 2.9, b.x + 1.35, b.z + 2.9), y: base + 0.1, surface: 'tile' });
  const solid = (x0: number, z0: number, x1: number, z1: number, h = ROOM.h + 0.5) => {
    const w = worldBox(x0, z0, x1, z1);
    return addBox((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2, (w.x1 - w.x0) / 2, (w.z1 - w.z0) / 2, 0, base - 1, base + h, 'wall');
  };
  solid(ROOM.x0 - 0.3, ROOM.z0 - 0.3, ROOM.x1 + 0.3, ROOM.z0);
  solid(ROOM.x0 - 0.3, ROOM.z0 - 0.3, ROOM.x0, ROOM.z1 + 0.35);
  solid(ROOM.x1, ROOM.z0 - 0.3, TOWER.x1, TOWER.z1);
  solid(ROOM.x0 - 0.3, ROOM.z1, DOOR.x0, ROOM.z1 + 0.35);
  solid(DOOR.x1, ROOM.z1, ROOM.x1 + 0.3, ROOM.z1 + 0.35);
  const doorCol = solid(DOOR.x0, ROOM.z1, DOOR.x1, ROOM.z1 + 0.35, 3.2);
  const [kx, kz] = dropToWorld(KIOSK.x, KIOSK.z);
  solid(KIOSK.x - 0.22, KIOSK.z - 0.16, KIOSK.x + 0.22, KIOSK.z + 0.16, 1.2);
  const [tx, tz] = dropToWorld(TT.x, TT.z);
  const carCol: Collider = addBox(tx, tz, 1, 2.4, 0, base, base + 1.4, 'car');
  carCol.off = true;
  const bayCols = BAYS.map((b) => {
    const [bx, bz] = dropToWorld(b.x, b.z);
    const c = addBox(bx, bz, 1, 2.3, DROP_SITE.yaw, base, base + 1.4, 'car');
    c.off = true;
    return c;
  });

  // ---- cars: the one on the stand, the bays
  const card = new DropCard();
  let sfx: DropSfx | null = null;
  const sound = () => {
    const a = d.audio();
    if (a && !sfx) {
      const w = toWorld(TT.x, 1.5, 3.4);
      sfx = new DropSfx(a, w.x, w.y, w.z);
    }
    return sfx;
  };
  let studioEnv: Texture | null = null;
  const studioShared = () => {
    const s = sharedMaterials();
    const out: Record<string, Material> = {};
    for (const [k, m] of Object.entries(s)) out[k] = m.clone();
    return out;
  };
  interface Placed {
    car: Car;
    pull: Pull;
    obj: Object3D;
    mats: Material[];
  }
  let showing: Placed | null = null;
  let pending: { car: Car; pull: Pull } | null = null;
  let pendingObj: Promise<Placed | null> | null = null;
  const bays: (Placed | null)[] = BAYS.map(() => null);
  // a placard at each bay: edition, tier, body, look
  const placards = BAYS.map((b) => {
    const [, g, tex] = canvas(256, 160);
    const post = new Mesh(new PlaneGeometry(0.62, 0.39), new MeshBasicMaterial({ map: tex, color: new Color(1.3, 1.3, 1.3), side: DoubleSide }));
    post.position.set(b.x + 1.05, 0.95, b.z + 3.25);
    post.rotation.x = -0.35;
    post.visible = false;
    root.add(post);
    return { g, tex, post };
  });
  const stands = new GeoBuilder();
  stands.setColor(lin('#22252B'));
  for (const b of BAYS) stands.box(b.x + 1.02, 0.1, b.z + 3.2, b.x + 1.08, 0.82, b.z + 3.26);
  root.add(new Mesh(stands.build(), lib.metal));
  const drawPlacard = (i: number, pl: Placed | null) => {
    const { g, tex, post } = placards[i];
    post.visible = !!pl;
    if (!pl) return;
    const c = pl.car;
    g.fillStyle = '#0d1016';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = c.tier.color;
    g.fillRect(0, 0, 256, 8);
    g.font = `700 22px ${FONT}`;
    g.fillText(c.tier.name.toUpperCase(), 16, 40);
    g.fillStyle = '#f3efe8';
    g.font = `600 26px ${FONT}`;
    g.fillText(`${ed(c.edition)} · ${c.tier.bodyName}`, 16, 76);
    g.font = `400 17px ${FONT}`;
    g.globalAlpha = 0.75;
    g.fillText(`${c.looks.paint.name}`, 16, 106);
    g.fillText(`${c.serial} of ${c.tier.count} · PI ${c.pi}`, 16, 132);
    g.globalAlpha = 1;
    tex.needsUpdate = true;
  };

  const place = async (car: Car, p: Pull, studio: boolean): Promise<Placed | null> => {
    const shared = studio ? studioShared() : undefined;
    const made = await collectCar(car, { glow: studio ? 2.2 : 1.3, shared });
    if (!made) return null;
    return { car, pull: p, obj: made.obj, mats: [...made.materials, ...(shared ? Object.values(shared) : [])] };
  };
  const toBay = (pl: Placed, i: number) => {
    const b = BAYS[i];
    pl.obj.position.set(b.x, 0.1, b.z);
    pl.obj.rotation.set(0, 0, 0);
    root.add(pl.obj);
    for (const m of pl.mats) {
      (m as MeshStandardMaterial).envMap = null;
      m.needsUpdate = true;
    }
    drawPlacard(i, pl);
    const s = MODEL_SIZE[pl.car.tier.body];
    bayCols[i].hx = s.w / 2;
    bayCols[i].hz = s.l / 2;
    bayCols[i].off = false;
  };
  const shiftBays = (incoming: Placed) => {
    const last = bays[bays.length - 1];
    if (last) root.remove(last.obj);
    for (let i = bays.length - 1; i > 0; i--) {
      bays[i] = bays[i - 1];
      if (bays[i]) toBay(bays[i]!, i);
    }
    bays[0] = incoming;
    toBay(incoming, 0);
  };
  // your earlier pulls stand in the bays
  const restoreBays = async () => {
    const recent = state.pulls.slice(-BAYS.length).reverse();
    for (let i = 0; i < BAYS.length; i++) {
      if (bays[i]) root.remove(bays[i]!.obj);
      bays[i] = null;
      bayCols[i].off = true;
      drawPlacard(i, null);
    }
    const placed = await Promise.all(recent.map((p) => place(pool[p.edition - 1], p, false)));
    placed.forEach((pl, i) => {
      if (!pl) return;
      bays[i] = pl;
      toBay(pl, i);
    });
  };
  void restoreBays();

  // ---- the sequence
  let phase: Phase = 'idle';
  let phaseT = 0;
  let open = 0;
  let spin = 0;
  let boardDirty = true;
  let boardClock = 0;
  let resetArmed = 0;
  let cardWanted = true;
  let queued: number | undefined;
  let revealed = false;
  const go = (p: Phase) => {
    phase = p;
    phaseT = 0;
    boardDirty = true;
  };
  const randomBytes = () => {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    return b;
  };
  /** bytes whose value mod the cars left is the slot of `edition` */
  const bytesFor = (edition: number) => {
    const idx = state.pool.indexOf(edition);
    const b = randomBytes();
    if (idx < 0) return b;
    let v = 0n;
    for (const x of b) v = (v << 8n) | BigInt(x);
    const n = BigInt(state.pool.length);
    v = v - (v % n) + BigInt(idx);
    if (v >= 1n << 256n) v -= n;
    for (let i = 31; i >= 0; i--) {
      b[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return b;
  };
  const start = (edition?: number) => {
    if (phase !== 'idle' && phase !== 'show') return false;
    if (state.pool.length === 0) {
      sound()?.deny();
      return false;
    }
    queued = edition;
    revealed = false;
    card.show(false);
    if (showing || open > 0.01) {
      go('closing');
      sound()?.door(DUR.closing);
    } else beginPay();
    return true;
  };
  // (the bill and its sound on every pull: the first one used to skip the sound, the door being shut already)
  function beginPay(): void {
    go('paying');
    sound()?.pay();
    bill.visible = true;
  }
  const lightTier = (tier: Tier | null, level: number) => {
    const c = tier ? new Color(tier.color) : new Color(1, 1, 1);
    tierCol.copy(c);
    glow.level = level;
  };
  const captureStudio = (pl: Placed) => {
    // the stand as the car will see it: door up, lights on in the tier colour, the car itself hidden
    const keepOpen = shutterUni.uOpen.value;
    const keepLevel = glow.level;
    shutterUni.uOpen.value = DOOR.y1 - DOOR.y0 + 0.2;
    lightTier(pl.car.tier, 1);
    applyLights(1);
    const w = toWorld(TT.x, FLOOR + 1.0, TT.z);
    const env = captureProbe(d.renderer, d.scene, d.sky, w.x, w.y, w.z, [pl.obj]);
    shutterUni.uOpen.value = keepOpen;
    glow.level = keepLevel;
    applyLights(1);
    if (studioEnv) releaseProbe(studioEnv);
    studioEnv = env;
    for (const m of [...pl.mats, floorMat, innerMat, discMat]) {
      (m as MeshStandardMaterial).envMap = env;
      m.needsUpdate = true;
    }
    for (const m of [floorMat, innerMat, discMat]) m.envMapIntensity = 1;
  };
  const applyLights = (flash: number) => {
    const L = glow.level;
    const cool = new Color(1, 1, 1);
    const c = tierCol.clone().lerp(cool, 0.15);
    ceilMat.color.setScalar(0.35 + 5.2 * L);
    wallMat.color.copy(c).multiplyScalar(0.25 + 3.4 * L * flash);
    stripMat.color.copy(c).multiplyScalar(0.4 + 6 * L * flash);
    ringMat.color.copy(c).multiplyScalar(0.6 + 5 * L * flash);
    neonMat.color.copy(new Color(1, 0.97, 0.94).lerp(c, L * 0.8)).multiplyScalar(3 + 2 * L * flash);
    frameMat.color.copy(new Color(1, 0.97, 0.94).lerp(c, 0.25 + 0.75 * L)).multiplyScalar(2.2 + 4 * L * flash);
  };
  lightTier(null, 0.08);
  applyLights(1);

  const reset = () => {
    state = freshState();
    saveState(state);
    if (showing) root.remove(showing.obj);
    showing = null;
    pending = null;
    carCol.off = true;
    doorCol.off = false;
    open = 0;
    shutterUni.uOpen.value = 0;
    card.show(false);
    lightTier(null, 0.08);
    applyLights(1);
    go('idle');
    void restoreBays();
  };

  const interactable: Interactable = {
    pos: new Vector3(kx, base + APRON.y, kz),
    radius: 2.4,
    label: () => {
      if (performance.now() < resetArmed) return 'R  again to reset the drop (demo)';
      if (state.pool.length === 0 && (phase === 'idle' || phase === 'show')) return 'Drop 01 is sold out · R R  reset the drop (demo)';
      if (phase === 'idle') return `E  pay ${DEMO_PRICE} and pull a car`;
      if (phase === 'show') return `E  pull again · ${DEMO_PRICE}`;
      return null;
    },
    act: () => void start(),
  };

  // the cars here as candidates: to get into, or to come loose when something hits them
  const candidateOf = (pl: Placed, forget: () => void, turning: boolean): CarCandidate => {
    const wp = pl.obj.getWorldPosition(new Vector3());
    const yaw = new Euler().setFromQuaternion(pl.obj.getWorldQuaternion(new Quaternion()), 'YXZ').y;
    const s = MODEL_SIZE[pl.car.tier.body];
    return {
      label: `your ${pl.car.tier.name} ${pl.car.tier.bodyName} #${String(pl.car.edition).padStart(4, '0')}`,
      x: wp.x,
      y: wp.y,
      z: wp.z,
      yaw,
      // the car on the turning stand can be got into from anywhere round the stand
      l: turning ? s.l + 0.6 : s.l,
      w: turning ? s.l + 0.6 : s.w,
      take: () => {
        forget();
        // out of the showroom: the outdoor reflections again, and a contact shadow that travels along
        for (const m of pl.mats) {
          (m as MeshStandardMaterial).envMap = null;
          m.needsUpdate = true;
        }
        const blob = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x000000, map: dotTexture(), transparent: true, opacity: 0.5, depthWrite: false }));
        blob.scale.set(s.w + 0.4, 1, s.l + 0.3);
        blob.position.y = 0.015;
        pl.obj.add(blob);
        return collectTaken(pl.obj, pl.car);
      },
    };
  };
  const standCandidate = (): CarCandidate | null =>
    showing
      ? candidateOf(
          showing,
          () => {
            // the stand is empty and the door stays up until the next pull closes it
            showing = null;
            carCol.off = true;
            card.show(false);
            go('idle');
          },
          true,
        )
      : null;
  const bayCandidate = (i: number): CarCandidate | null => {
    const pl = bays[i];
    return pl
      ? candidateOf(
          pl,
          () => {
            bays[i] = null;
            bayCols[i].off = true;
            drawPlacard(i, null);
          },
          false,
        )
      : null;
  };
  let knockFn: ((c: CarCandidate) => unknown) | null = null;
  carCol.knock = () => {
    const c = knockFn && phase === 'show' ? standCandidate() : null;
    return c ? knockFn!(c) : null;
  };
  bayCols.forEach((col, i) => {
    col.knock = () => {
      const c = knockFn ? bayCandidate(i) : null;
      return c ? knockFn!(c) : null;
    };
  });

  return {
    root,
    interactable,
    carCandidates: (x: number, z: number, r: number) => {
      const out: CarCandidate[] = [];
      const add = (c: CarCandidate | null) => {
        if (c && Math.abs(c.x - x) < r + 3 && Math.abs(c.z - z) < r + 3) out.push(c);
      };
      if (showing && phase === 'show') add(standCandidate());
      bays.forEach((_, i) => add(bayCandidate(i)));
      return out;
    },
    knockWith(fn: (c: CarCandidate) => unknown) {
      knockFn = fn;
    },
    get state() {
      return state;
    },
    phase: () => phase,
    reset,
    debugPull: (edition?: number) => void start(edition),
    update(t: number, dt: number, eye: Vector3) {
      void t;
      phaseT += dt;
      boardClock += dt;
      const near = Math.hypot(eye.x - kx, eye.z - kz) < 22;
      // keys: I toggles the card, R twice resets
      if (d.input.took('KeyI') && showing) {
        cardWanted = !cardWanted;
        card.show(cardWanted && near);
      }
      if (d.input.took('KeyR') && near) {
        if (performance.now() < resetArmed) {
          resetArmed = 0;
          reset();
        } else resetArmed = performance.now() + 2500;
      }
      switch (phase) {
        case 'closing': {
          open = (DOOR.y1 - DOOR.y0 + 0.2) * (1 - smooth(clamp01(phaseT / DUR.closing)));
          if (phaseT >= DUR.closing) {
            doorCol.off = false;
            carCol.off = true;
            if (showing) shiftBays(showing);
            showing = null;
            lightTier(null, 0.08);
            beginPay();
          }
          break;
        }
        case 'paying': {
          const k = clamp01(phaseT / DUR.paying);
          bill.visible = k < 0.8;
          bill.position.set(KIOSK.x, APRON.y + 0.71, KIOSK.z + 0.46 - 0.3 * smooth(clamp01(k * 1.4)));
          bill.rotation.set(-0.2, 0, 0);
          if (phaseT >= DUR.paying) {
            const bytes = queued !== undefined ? bytesFor(queued) : randomBytes();
            const p = pull(state, bytes);
            if (!p) {
              go('idle');
              break;
            }
            saveState(state);
            pending = { car: pool[p.edition - 1], pull: p };
            pendingObj = place(pending.car, p, true);
            go('entropy');
            sound()?.entropy(DUR.entropy);
          }
          break;
        }
        case 'entropy':
          if (phaseT >= DUR.entropy) {
            go('assign');
            sound()?.assign();
          }
          break;
        case 'assign':
          if (phaseT >= DUR.assign && pendingObj) {
            const po = pendingObj;
            pendingObj = null;
            void po.then((pl) => {
              if (!pl) {
                go('idle');
                return;
              }
              showing = pl;
              pl.obj.position.set(0, TT.h, 0);
              pl.obj.rotation.set(0, 0, 0);
              turn.add(pl.obj);
              captureStudio(pl);
              const s = MODEL_SIZE[pl.car.tier.body];
              carCol.hx = s.w / 2 + 0.1;
              carCol.hz = s.l / 2 + 0.1;
              lightTier(pl.car.tier, 0);
              go('opening');
              sound()?.door(DUR.opening * 0.8);
            });
            phaseT = -1e9; // wait for the car
          }
          break;
        case 'opening': {
          const k = clamp01(phaseT / DUR.opening);
          const tier = showing!.car.tier;
          glow.level = smooth(clamp01(k * 2.2));
          open = (DOOR.y1 - DOOR.y0 + 0.2) * smooth(clamp01((k - 0.12) / 0.8));
          if (phaseT - dt < DUR.opening * 0.38 && phaseT >= DUR.opening * 0.38) {
            revealed = true;
            boardDirty = true;
            sound()?.reveal(tier.id);
            const n = { common: 0, uncommon: 40, rare: 110, ultra: 200, secret: 320 }[tier.id];
            if (n) burst(n, new Color(tier.color));
          }
          if (phaseT >= DUR.opening) {
            doorCol.off = true;
            carCol.off = false;
            go('show');
            cardWanted = true;
            const odds = liveOdds(state, pool);
            card.set(showing!.car, showing!.pull, odds, state.pool.length);
            card.show(near);
          }
          break;
        }
        case 'show':
          if (cardWanted) card.show(near);
          break;
      }
      if (phase === 'opening' || phase === 'closing') shutterUni.uOpen.value = open;
      // light show: secret rares strobe while they're revealed
      let flash = 1;
      if (showing && (phase === 'opening' || phase === 'show') && showing.car.tier.id === 'secret') flash = 0.8 + 0.35 * Math.max(0, Math.sin(phaseT * 9)) * Math.exp(-Math.max(0, phaseT - 1) * 0.4);
      applyLights(flash);
      // the stand turns
      if (showing && (phase === 'opening' || phase === 'show')) {
        // a showroom turn: once round about every ten seconds
        spin += dt * 0.62;
        turn.rotation.y = spin;
        carCol.rot = DROP_SITE.yaw + spin;
      }
      // sparks
      if (sparks.visible) {
        sparkLife -= dt;
        for (let i = 0; i < SPARKS; i++) {
          const o = i * 3;
          sparkVel[o + 1] -= dt * 0.6;
          sparkPos[o] += sparkVel[o] * dt;
          sparkPos[o + 1] += sparkVel[o + 1] * dt;
          sparkPos[o + 2] += sparkVel[o + 2] * dt;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        sparkMat.opacity = clamp01(sparkLife / 1.2);
        if (sparkLife <= 0) sparks.visible = false;
      }
      // the board: redraw on change, often while bytes stream
      const live = phase === 'entropy' || phase === 'assign' || phase === 'paying' || (phase === 'opening' && !revealed);
      if (boardDirty || (near && live && boardClock > 0.06)) {
        boardClock = 0;
        boardDirty = false;
        const shown = showing ? { car: showing.car, pull: showing.pull } : null;
        drawBoard(boardG, { phase, t: phaseT, revealed, state, pool, pending, showing: shown });
        boardTex.needsUpdate = true;
        drawKiosk(kioskG, phase, state, pending, revealed);
        kioskTex.needsUpdate = true;
      }
      if (!near && card.visible) card.show(false);
    },
  };
}
