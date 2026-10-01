// The trailer, recorded by the game itself on the dev server. A shot steps the world 1/30 s per frame (two
// physics steps of 1/60, only the second drawn), flies the camera or lets the chase camera follow the car the
// autopilot drives, draws the captions and the end card in the title screen's type onto a 1920×1080 canvas and
// saves each frame as game/.trailer/<shot>/NNNN.jpg. Load the page at 1920×1080 with ?q=high&drop=7, then in
// the console: __trailer.peek('street', 1.2) saves the frame 1.2 s into a shot to .trailer/peek/, and
// __trailer.record('street') records it. Shots that move cars for good want a fresh page each.
// scripts/trailer.sh cuts the shots together.
import { Vector3, type PerspectiveCamera } from 'three';
import type { Soundscape } from '../audio';
import type { DropGarage } from '../drop/garage';
import type { Input } from '../player/input';
import type { Player } from '../player/player';
import type { Pipeline } from '../renderer/pipeline';
import type { Driving } from '../vehicles/drive';
import { Ride, type RideControls } from '../vehicles/ride';
import type { Cars } from '../world/cars';

interface OD {
  camera: PerspectiveCamera;
  pipe: Pipeline;
  player: Player;
  canvas: HTMLCanvasElement;
  input: Input;
  driving: Driving;
  garage: DropGarage;
  sound: Soundscape;
  readonly time: number;
  camHook: ((t: number, dt: number) => void) | null;
  pause(on: boolean): void;
  step(dtMs: number, draw?: boolean): void;
  freeze(t?: number): void;
  run(): void;
  press(code: string): void;
  cam(id: string): string;
  drop: { pull(edition?: number): void; reset(): void; phase(): string };
}
const od = () => (window as unknown as { __od: OD }).__od;
const cars = () => (window as unknown as { __cars: Cars }).__cars;

export const W = 1920;
export const H = 1080;
export const FPS = 30;
/** the game draws at twice the size and the frame is scaled down: smooth palm fronds and thin lines */
export const SS = 2;

// ---- the frame: the game's canvas, then the type on top

const out = document.createElement('canvas');
out.width = W;
out.height = H;
const g = out.getContext('2d')!;
g.imageSmoothingQuality = 'high';
const FONT = "'Avenir Next', Avenir, Futura, 'Helvetica Neue', system-ui, sans-serif";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Tracked capitals, centred on x (the tracking after the last letter doesn't push it off centre). */
function spaced(text: string, x: number, y: number, size: number, weight: number, track: number, color: string, alpha: number): void {
  if (alpha <= 0) return;
  g.save();
  g.globalAlpha = alpha;
  g.font = `${weight} ${size}px ${FONT}`;
  g.letterSpacing = `${track * size}px`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = color;
  g.fillText(text, x + (track * size) / 2, y);
  g.restore();
}

export interface Caption {
  text: string;
  sub?: string;
  /** seconds into the shot */
  from?: number;
  to?: number;
}

/** A caption in the lower third, over a soft shade so it reads on any sky. */
function caption(c: Caption, s: number, dur: number): void {
  const from = c.from ?? 0.15;
  const to = c.to ?? dur;
  const a = smooth((s - from) / 0.3) * (to >= dur ? 1 : 1 - smooth((s - (to - 0.25)) / 0.25));
  if (a <= 0) return;
  g.save();
  g.globalAlpha = a * 0.5;
  const shade = g.createLinearGradient(0, H * 0.58, 0, H);
  shade.addColorStop(0, 'rgba(38, 22, 30, 0)');
  shade.addColorStop(1, 'rgba(38, 22, 30, 0.75)');
  g.fillStyle = shade;
  g.fillRect(0, H * 0.58, W, H * 0.42);
  g.restore();
  g.save();
  g.shadowColor = 'rgba(40, 18, 28, 0.55)';
  g.shadowBlur = 22;
  const rise = (1 - smooth((s - from) / 0.45)) * 14;
  spaced(c.text.toUpperCase(), W / 2, H * 0.855 + rise, 54, 500, 0.26, '#fff8f0', a);
  if (c.sub) spaced(c.sub.toUpperCase(), W / 2, H * 0.915 + rise, 22, 500, 0.42, '#ffe6d2', a * 0.92);
  g.restore();
}

/** The end card: the title screen's name and a line, and where to play. */
function endCard(s: number, line = 'MIAMI BEACH · MORNING'): void {
  const a = smooth(s / 0.6);
  g.save();
  // the title screen's warm wash
  g.globalAlpha = a * 0.42;
  const wash = g.createRadialGradient(W / 2, H * 1.05, 0, W / 2, H * 1.05, H * 1.25);
  wash.addColorStop(0, 'rgba(255, 217, 160, 0.55)');
  wash.addColorStop(0.45, 'rgba(233, 169, 180, 0.4)');
  wash.addColorStop(1, 'rgba(60, 40, 60, 0.55)');
  g.fillStyle = wash;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = a * 0.55;
  const low = g.createLinearGradient(0, H * 0.55, 0, H);
  low.addColorStop(0, 'rgba(38, 22, 30, 0)');
  low.addColorStop(1, 'rgba(38, 22, 30, 0.8)');
  g.fillStyle = low;
  g.fillRect(0, H * 0.55, W, H * 0.45);
  g.restore();
  g.save();
  g.shadowColor = 'rgba(90, 30, 45, 0.6)';
  g.shadowBlur = 40;
  spaced('OCEAN DRIVE', W / 2, H * 0.4, 128, 500, 0.3, '#fff8f0', a);
  spaced(line.toUpperCase(), W / 2, H * 0.4 + 74, 28, 600, 0.42, '#fff3e6', smooth((s - 0.25) / 0.5));
  const b = smooth((s - 0.55) / 0.5);
  g.shadowColor = 'rgba(30, 12, 20, 0.7)';
  g.shadowBlur = 24;
  spaced('PLAY FREE IN YOUR BROWSER', W / 2, H * 0.76, 28, 600, 0.3, '#fff8f0', b);
  spaced('drcollect.github.io/ocean-drive', W / 2, H * 0.76 + 64, 46, 600, 0.03, '#ffffff', b);
  g.restore();
}

// ---- shots

export interface Shot {
  name: string;
  /** seconds */
  dur: number;
  /** put the world in place (a fresh page: nothing else has moved yet) */
  setup?(o: OD): void;
  /** after the setup: wait for something that needs the page to breathe (the pulled car loading) */
  ready?(o: OD): Promise<void>;
  /** seconds simulated before the first frame (a car gets up to speed, the door gets going) */
  preroll?: number;
  /** fly the camera; u runs 0→1 over the shot, s in seconds (none: the player's own camera) */
  cam?(cam: PerspectiveCamera, u: number, s: number): void;
  caption?: Caption;
  /** the end card (a string: its line under the name) */
  end?: boolean | string;
  /** keys held down through the shot (the walker walks: KeyW, ShiftLeft) */
  hold?: string[];
  /** the sound pass: stand the walker here (the surf plays from where you stand) */
  listen?: [number, number];
  /** the sound pass: the engine of the car you drive, as heard from this camera (1: from the driver's seat) */
  engine?: number;
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const lerpV = (a: Vector3, b: Vector3, t: number) => a.clone().lerp(b, t);

function aim(cam: PerspectiveCamera, p: Vector3, look: Vector3, fov = 52): void {
  cam.position.copy(p);
  cam.lookAt(look);
  if (Math.abs(cam.fov - fov) > 1e-3) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
}

/** Keep the walker (and the long shadow only the sun sees) out of the way of a flown camera. */
function park(o: OD, x = -38, z = 330): void {
  o.player.teleport(x, z, 0, 0);
}

/**
 * The autopilot: follow a polyline of (x, z) at the speed given for each point, looking ahead as it goes
 * faster. Returns the controls for the ride each step.
 */
function pilot(path: [number, number, number][]): (r: Ride) => RideControls {
  return (r) => {
    // the nearest segment, then a point further along
    let best = 0;
    let bd = Infinity;
    let bt = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      const t = clamp01(((r.pos.x - ax) * dx + (r.pos.z - az) * dz) / l2);
      const d = Math.hypot(ax + dx * t - r.pos.x, az + dz * t - r.pos.z);
      if (d < bd) {
        bd = d;
        best = i;
        bt = t;
      }
    }
    let ahead = 5 + Math.abs(r.speed) * 0.45;
    let i = best;
    let px = path[i][0] + (path[i + 1][0] - path[i][0]) * bt;
    let pz = path[i][1] + (path[i + 1][1] - path[i][1]) * bt;
    const want = path[i][2] + (path[i + 1][2] - path[i][2]) * bt;
    while (ahead > 0 && i < path.length - 1) {
      const [bx, bz] = path[i + 1];
      const d = Math.hypot(bx - px, bz - pz);
      if (d >= ahead) {
        px += ((bx - px) / d) * ahead;
        pz += ((bz - pz) / d) * ahead;
        ahead = 0;
      } else {
        ahead -= d;
        px = bx;
        pz = bz;
        i++;
      }
    }
    const yawTo = Math.atan2(px - r.pos.x, pz - r.pos.z);
    let err = yawTo - r.yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    const throttle = want < 0 ? -1 : Math.max(-1, Math.min(1, (want - r.speed) * 0.6));
    return { throttle, steer: Math.max(-1, Math.min(1, err * 3)) };
  };
}

/** Get into the car parked nearest (x, z) (the E key, as you would), then put it where the shot starts. */
function takeCar(o: OD, x: number, z: number, at?: { x: number; z: number; yaw: number }): Ride | null {
  o.player.teleport(x, z, 0, 0);
  const c = o.driving.nearest(x, o.player.feet.y, z, 3);
  if (!c) return null;
  const r = o.driving.take(c);
  if (!r) return null;
  o.player.mount(r);
  if (at) {
    r.pos.set(at.x, r.pos.y, at.z);
    r.yaw = at.yaw;
    r.speed = 0;
    r.place(0);
  }
  return r;
}

let ride: Ride | null = null;

/** the keys the walker reads (a lost focus clears them, so a shot holds its own every step) */
const keys = (o: OD) => (o.input as unknown as { keys: Set<string> }).keys;
function hold(o: OD, codes: string[]): void {
  for (const c of codes) keys(o).add(c);
}
function release(o: OD): void {
  keys(o).clear();
}

/** The pull's 32 bytes, the same on every take (the garage asks the browser's crypto for them). */
function fixedBytes(): void {
  let x = 0x2f6b9d31;
  crypto.getRandomValues = (<T extends ArrayBufferView | null>(a: T): T => {
    if (a) {
      const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      for (let i = 0; i < u.length; i++) {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        u[i] = x >>> 24;
      }
    }
    return a;
  }) as typeof crypto.getRandomValues;
}

/** Step until the garage reaches a phase (the car loads in between: let the page breathe). */
async function untilPhase(o: OD, phase: string, max = 1800): Promise<void> {
  for (let i = 0; i < max && o.drop.phase() !== phase; i++) {
    o.step(1000 / 60, false);
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
}

/** A chase camera that starts close (inside the garage) and drops back as the car gets going. */
function chaseOut(): Shot['cam'] {
  const pos = new Vector3();
  const look = new Vector3();
  return (cam, _u, s) => {
    const r = ride;
    if (!r) return;
    const k = smooth(s / 2.2);
    const dist = 3.1 + 3.6 * k;
    const f = r.forward;
    const rt = r.right;
    const want = v(r.pos.x - f.x * dist + rt.x * 0.35, r.pos.y + 1.45 + 0.1 * k, r.pos.z - f.z * dist + rt.z * 0.35);
    const at = v(r.pos.x + f.x * 8, r.pos.y + 0.9, r.pos.z + f.z * 8);
    if (s < 0.02) {
      pos.copy(want);
      look.copy(at);
    }
    pos.lerp(want, 0.22);
    look.lerp(at, 0.3);
    aim(cam, pos, look, 54 - 8 * k);
  };
}

/** A trailer chase camera: closer and lower than the game's, on a longer lens, a little off to one side. */
function chase(dist: number, height: number, side: number, fov: number): Shot['cam'] {
  const pos = new Vector3();
  const look = new Vector3();
  return (cam, _u, s) => {
    const r = ride;
    if (!r) return;
    const f = r.forward;
    const rt = r.right;
    const want = v(r.pos.x - f.x * dist + rt.x * side, r.pos.y + height, r.pos.z - f.z * dist + rt.z * side);
    const at = v(r.pos.x + f.x * 9, r.pos.y + 0.8, r.pos.z + f.z * 9);
    if (s < 0.02) {
      pos.copy(want);
      look.copy(at);
    }
    pos.lerp(want, 0.2);
    look.lerp(at, 0.3);
    aim(cam, pos, look, fov);
  };
}

/** a knock shakes a flown camera too */
let shake = 0;
const crashes: string[] = [];
let hooked = false;
function hookCrashes(): void {
  if (hooked) return;
  hooked = true;
  const prev = Ride.onCrash;
  Ride.onCrash = (x, y, z, s, c) => {
    if (current) {
      crashes.push(`${current.name} ${shotS.toFixed(2)}s hit ${s.toFixed(1)} m/s at ${x.toFixed(1)},${z.toFixed(1)}${c ? ' car' : ''}`);
      if (c) shake = Math.max(shake, Math.min(0.28, s * 0.012));
    }
    prev?.(x, y, z, s, c);
  };
}

export const SHOTS: Record<string, Shot> = {
  // the street at sunrise, rising from the kerb over the parked cars and the palms
  street: {
    name: 'street',
    dur: 2.8,
    setup: (o) => {
      o.freeze(28.6);
      o.run();
      park(o);
    },
    cam: (cam, u) => {
      const k = smooth(u);
      aim(cam, lerpV(v(1.8, 2.4, 138), v(0.6, 8.8, 136), k), lerpV(v(-2.5, 3.8, 60), v(-2, 1.4, 44), k), 50);
    },
    caption: { text: 'Miami Beach at sunrise', sub: 'in your browser' },
    listen: [1.6, 137],
  },
  // the beach from above the breakers: the surf, a lifeguard tower, the hotel row
  beach: {
    name: 'beach',
    dur: 2.2,
    setup: (o) => {
      o.freeze(31);
      o.run();
      park(o);
    },
    cam: (cam, u) => {
      const k = smooth(u);
      aim(cam, lerpV(v(128, 7, 78), v(126.5, 7.6, 62), k), lerpV(v(100, 0, -28), v(98, 0, -44), k), 50);
    },
    caption: { text: 'Generated in code', sub: 'hotels · palms · sky · surf · sound' },
    listen: [123, 72],
  },
  // a Collect car up Ocean Drive, on the chase camera
  drive: {
    name: 'drive',
    dur: 2.8,
    preroll: 3.85,
    setup: (o) => {
      o.freeze(40);
      o.run();
      ride = takeCar(o, -4.2, 116.1, { x: 2.6, z: 240, yaw: Math.PI });
      o.player.pilot = pilot([
        [2.6, 240, 30],
        [2.6, 150, 30],
        [2.8, 141, 28],
        [4.9, 131, 26],
        [5.3, 112, 0],
      ]);
    },
    cam: chase(7.2, 1.35, 0.9, 40),
    caption: { text: 'Drive any car' },
    engine: 0.5,
  },
  // head on from up the street: into the white convertible by the kerb
  crash: {
    name: 'crash',
    dur: 2.6,
    cam: (cam, u) => {
      aim(cam, lerpV(v(1.2, 3.6, 110), v(1.4, 3.2, 111.5), smooth(u)), v(4.6, 0.7, 127.5), 38);
    },
    caption: { text: 'and crash it', from: 0.85 },
    engine: 0.22,
  },
  // the drop garage: the door rolls up on a Secret Rare
  drop: {
    name: 'drop',
    dur: 2.6,
    setup: (o) => {
      o.freeze(50);
      o.run();
      park(o, 10, 99);
      o.drop.reset();
      o.drop.pull(32);
    },
    // pay, randomness, assign: then the car loads (a promise, so let the page breathe) and the door opens
    ready: async (o) => {
      for (let i = 0; i < 3000 && o.drop.phase() !== 'opening'; i++) {
        o.step(1000 / 60, false);
        if (o.drop.phase() === 'assign') await new Promise((r) => setTimeout(r, 0));
      }
    },
    preroll: 0.25,
    cam: (cam, u) => {
      const k = smooth(u);
      aim(cam, lerpV(v(10.3, 2.7, 99.6), v(12.5, 2.3, 99.3), k), lerpV(v(30, 3.2, 97.6), v(30, 2.6, 97.6), k), 50);
    },
    caption: { text: 'Pull a car from the drop', sub: 'Collect Drop 01 · demo' },
  },
  // the end card over the beach and the hotel row
  end: {
    name: 'end',
    dur: 2.0,
    setup: (o) => {
      o.freeze(60);
      o.run();
      park(o);
    },
    cam: (cam, u) => {
      const k = smooth(u);
      aim(cam, lerpV(v(0.4, 15, 58), v(0.2, 17, 52), k), lerpV(v(0, 5, 200), v(0, 4.5, 196), k), 52);
    },
    end: true,
    listen: [0.4, 55],
  },
};

// ---- the drop cut (renders/social): walk Ocean Drive, find the garage, throw in money, the door rolls up on
// your car, get in and drive away (or crash it). A concept for future drops: demo data.

const garageCam = (cam: PerspectiveCamera, u: number) => {
  const k = smooth(u);
  aim(cam, lerpV(v(10.3, 2.7, 99.6), v(12.5, 2.3, 99.3), k), lerpV(v(30, 3.2, 97.6), v(30, 2.6, 97.6), k), 50);
};

Object.assign(SHOTS, {
  's-street': {
    name: 's-street',
    dur: 2.0,
    setup: (o: OD) => {
      o.freeze(28.6);
      o.run();
      park(o);
    },
    cam: (cam: PerspectiveCamera, u: number) => {
      const k = smooth(u);
      aim(cam, lerpV(v(1.8, 2.4, 138), v(0.7, 8.2, 136.4), k), lerpV(v(-2.5, 3.8, 60), v(-2, 1.5, 44), k), 50);
    },
    caption: { text: 'Walk Ocean Drive at sunrise', sub: 'a 3D concept for future drops' },
    listen: [1.6, 137],
  },
  // you, walking from the sidewalk across the lawn to the kiosk
  's-walk': {
    name: 's-walk',
    dur: 2.0,
    preroll: 0.4,
    setup: (o: OD) => {
      o.freeze(44);
      o.run();
      o.player.teleport(8.6, 100.6, Math.PI / 2, 0.03);
      hold(o, ['KeyW', 'ShiftLeft']);
    },
    hold: ['KeyW', 'ShiftLeft'],
    caption: { text: 'There’s a garage in the park' },
  },
  // at the kiosk: the bill goes in
  's-pay': {
    name: 's-pay',
    dur: 2.0,
    setup: (o: OD) => {
      release(o);
      o.player.teleport(16.0, 100.2, Math.PI / 2 + 0.3, -0.06);
      fixedBytes();
      o.drop.reset();
      o.drop.pull(32);
    },
    caption: { text: 'Throw in some money', sub: '$99 · demo price' },
  },
  // the board: the bytes come in, the number mod the cars left picks the car
  's-board': {
    name: 's-board',
    dur: 1.8,
    cam: (cam: PerspectiveCamera, u: number) => aim(cam, lerpV(v(16.6, 3.45, 103.4), v(17.1, 3.47, 103.45), smooth(u)), v(20.3, 3.5, 103.5), 32),
    caption: { text: '32 random bytes pick your car' },
  },
  // the door rolls up
  's-reveal': {
    name: 's-reveal',
    dur: 2.8,
    setup: () => {},
    ready: (o: OD) => untilPhase(o, 'opening'),
    preroll: 0.15,
    cam: garageCam,
    caption: { text: 'Secret Rare', sub: '1 of 25 · the rarest tier', from: 1.15 },
  },
  // you walk in to it
  's-getin': {
    name: 's-getin',
    dur: 1.6,
    setup: () => {},
    ready: async (o: OD) => {
      await untilPhase(o, 'show');
      o.player.teleport(18.6, 98.0, Math.PI / 2, -0.12);
      hold(o, ['KeyW']);
    },
    hold: ['KeyW'],
    caption: { text: 'Get in' },
  },
  // and out of the garage, onto Ocean Drive
  's-drive': {
    name: 's-drive',
    dur: 3.0,
    setup: (o: OD) => {
      release(o);
      ride = takeCar(o, o.player.feet.x, o.player.feet.z, { x: 24.4, z: 98, yaw: -Math.PI / 2 });
      // out of the door, right across the lawn between the lamps, then north up Ocean Drive
      o.player.pilot = pilot([
        [24.4, 98, 7],
        [19.5, 98, 9],
        [16, 97.4, 10],
        [12.8, 95.2, 11],
        [10, 92.3, 12],
        [7, 89, 13],
        [4.2, 85.5, 15],
        [2.8, 81, 17],
        [2.6, 70, 20],
        [2.6, 20, 22],
      ]);
    },
    preroll: 0.5,
    cam: chaseOut(),
    caption: { text: 'and drive away' },
    engine: 0.45,
  },
  // or crash it: the Streamliner up Ocean Drive into the white convertible
  's-crash': {
    name: 's-crash',
    dur: 2.2,
    setup: (o: OD) => SHOTS.drive.setup!(o),
    preroll: 6.65,
    cam: SHOTS.crash.cam,
    caption: { text: 'or crash it', from: 0.75 },
    engine: 0.22,
  },
  's-end': {
    name: 's-end',
    dur: 2.0,
    setup: SHOTS.end.setup,
    cam: SHOTS.end.cam,
    end: 'a 3D concept for future drops',
    listen: [0.4, 55],
  },
} satisfies Record<string, Shot>);

// ---- stills for the thread, without captions: __trailer.peek('p-cars') (the crash wants a fresh page)

const pullSetup = (o: OD) => {
  o.freeze(50);
  o.run();
  park(o, 10, 99);
  fixedBytes();
  o.drop.reset();
  o.drop.pull(32);
};
const steps = (o: OD, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) o.step(1000 / 60, false);
};

Object.assign(SHOTS, {
  // the five Collect cars in their row in front of the hotels
  'p-cars': {
    name: 'p-cars',
    dur: 1,
    setup: (o: OD) => {
      o.freeze(28.6);
      o.run();
      park(o);
    },
    cam: (cam: PerspectiveCamera) => aim(cam, v(2.8, 2.2, 125), v(-5.8, 0.7, 103), 34),
  },
  'p-street': {
    name: 'p-street',
    dur: 1,
    setup: (o: OD) => {
      o.freeze(28.6);
      o.run();
      park(o);
    },
    cam: (cam: PerspectiveCamera) => aim(cam, v(0.7, 8.2, 136.4), v(-2, 1.5, 44), 50),
  },
  'p-board': {
    name: 'p-board',
    dur: 1,
    setup: pullSetup,
    ready: async (o: OD) => {
      await untilPhase(o, 'assign');
      steps(o, 0.7);
    },
    cam: (cam: PerspectiveCamera) => aim(cam, v(16.9, 3.3, 103.45), v(20.3, 3.3, 103.5), 36),
  },
  'p-reveal': {
    name: 'p-reveal',
    dur: 1,
    setup: pullSetup,
    ready: async (o: OD) => {
      await untilPhase(o, 'show');
      steps(o, 0.4);
    },
    cam: (cam: PerspectiveCamera) => aim(cam, v(12.2, 2.2, 99.4), v(30, 2.4, 97.8), 48),
  },
  'p-drive': { ...SHOTS.drive, name: 'p-drive', caption: undefined },
  'p-crash': { ...(SHOTS['s-crash'] as Shot), name: 'p-crash', caption: undefined },
} satisfies Record<string, Shot>);

/** The review cameras in a grid (how every stage of the build was checked), saved to .trailer/peek/p-cams.jpg. */
async function cams(ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'J']): Promise<string> {
  const o = od();
  prepare(o);
  current = null;
  o.freeze(28.6);
  o.run();
  const cols = 3;
  const w = W / cols;
  const h = H / cols;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  ids.forEach((id, i) => {
    o.cam(id);
    for (let k = 0; k < 3; k++) o.step(1000 / 60, k === 2);
    const x = (i % cols) * w;
    const y = Math.floor(i / cols) * h;
    g.drawImage(o.canvas, x + 2, y + 2, w - 4, h - 4);
    g.save();
    g.fillStyle = 'rgba(20, 12, 18, 0.55)';
    g.fillRect(x + 14, y + 14, 46, 46);
    g.font = `600 30px ${FONT}`;
    g.fillStyle = '#fff8f0';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(id, x + 37, y + 38);
    g.restore();
  });
  await save('peek/p-cams.jpg', await blob());
  return 'peek/p-cams.jpg';
}

export const ORDER = ['street', 'beach', 'drive', 'crash', 'drop', 'end'];
/** the cuts, and which shots record on one page (in one go) */
export const CUTS = {
  trailer: { shots: ORDER, pages: [['street'], ['beach'], ['drive', 'crash'], ['drop'], ['end']] },
  social: {
    shots: ['s-street', 's-walk', 's-pay', 's-board', 's-reveal', 's-getin', 's-drive', 's-crash', 's-end'],
    pages: [['s-street'], ['s-walk', 's-pay', 's-board', 's-reveal', 's-getin', 's-drive'], ['s-crash'], ['s-end']],
  },
};

// ---- recording

let shotS = 0;
let current: Shot | null = null;

function prepare(o: OD): void {
  o.pause(true);
  o.pipe.dynamic = false;
  const pipe = o.pipe as unknown as { basePR: number; scale: number };
  if (pipe.scale !== 1 || pipe.basePR !== SS) {
    pipe.scale = 1;
    pipe.basePR = SS;
    window.dispatchEvent(new Event('resize'));
  }
  hookCrashes();
  o.camHook = (_t, dt) => {
    if (!current) return;
    shotS += dt;
    if (current.hold) hold(o, current.hold);
    if (!current.cam) return;
    current.cam(o.camera, clamp01(shotS / current.dur), shotS);
    if (shake > 0.004) o.camera.position.add(v((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    shake *= Math.exp(-dt * 5);
  };
}

async function begin(o: OD, shot: Shot, fresh: boolean): Promise<void> {
  current = shot;
  shotS = 0;
  if (fresh) shot.setup?.(o);
  if (fresh && shot.ready) await shot.ready(o);
  // the pre-roll: simulate without drawing
  const n = Math.round((shot.preroll ?? 0) * 60);
  for (let i = 0; i < n; i++) o.step(1000 / 60, false);
  shotS = 0;
}

/** One frame: two physics steps, the second drawn, then the type. */
function frame(o: OD, shot: Shot): void {
  o.step(1000 / 60, false);
  o.step(1000 / 60, true);
  g.drawImage(o.canvas, 0, 0, W, H);
  if (shot.caption) caption(shot.caption, shotS, shot.dur);
  if (shot.end) endCard(shotS, typeof shot.end === 'string' ? shot.end : undefined);
}

const blob = () => new Promise<Blob>((res) => out.toBlob((b) => res(b!), 'image/jpeg', 0.94));
const save = (path: string, b: Blob) => fetch(`/__save?path=${encodeURIComponent(path)}`, { method: 'POST', body: b });

let lost = false;
let watching = false;

/** Record shots (by name, in order, on this page); the first one sets up the world. */
async function record(names: string | string[]): Promise<string> {
  const o = od();
  prepare(o);
  // a lost GPU context draws black: stop rather than save black frames
  if (!watching) {
    watching = true;
    o.canvas.addEventListener('webglcontextlost', () => (lost = true));
  }
  const list = typeof names === 'string' ? [names] : names;
  const done: string[] = [];
  for (let k = 0; k < list.length; k++) {
    const shot = SHOTS[list[k]];
    await begin(o, shot, k === 0 || !!shot.setup);
    const n = Math.round(shot.dur * FPS);
    const pending: Promise<unknown>[] = [];
    for (let f = 0; f < n; f++) {
      frame(o, shot);
      if (lost) throw new Error(`the WebGL context was lost at ${shot.name} frame ${f + 1}`);
      pending.push(save(`${shot.name}/${String(f + 1).padStart(4, '0')}.jpg`, await blob()));
      if (pending.length > 6) await pending.shift();
    }
    await Promise.all(pending);
    done.push(`${shot.name}: ${n} frames`);
  }
  current = null;
  o.camHook = null;
  return done.join(', ');
}

/** Save the frame `s` seconds into a shot (after its setup and pre-roll) to .trailer/peek/<name>.jpg. */
async function peek(name: string, s = 0): Promise<string> {
  const o = od();
  prepare(o);
  const shot = SHOTS[name];
  await begin(o, shot, true);
  const n = Math.round(s * FPS);
  for (let f = 0; f < n; f++) {
    o.step(1000 / 60, false);
    o.step(1000 / 60, false);
  }
  frame(o, shot);
  const file = `peek/${name}_${s.toFixed(1)}.jpg`;
  await save(file, await blob());
  current = null;
  o.camHook = null;
  return file;
}

/**
 * A rehearsal: run shots as record() would, but save only a frame every `every` seconds (to .trailer/peek/),
 * with where the car was and when it hit something.
 */
async function rehearse(names: string[], every = 0.5): Promise<string[]> {
  const o = od();
  prepare(o);
  const log: string[] = [];
  for (let k = 0; k < names.length; k++) {
    const shot = SHOTS[names[k]];
    await begin(o, shot, k === 0 || !!shot.setup);
    const n = Math.round(shot.dur * FPS);
    for (let f = 0; f < n; f++) {
      const due = f % Math.max(1, Math.round(every * FPS)) === 0 || f === n - 1;
      if (due) {
        frame(o, shot);
        await save(`peek/${shot.name}_${shotS.toFixed(1)}.jpg`, await blob());
        const r = ride;
        log.push(`${shot.name} ${shotS.toFixed(2)}s${r ? ` car ${r.pos.x.toFixed(1)},${r.pos.z.toFixed(1)} ${(r.speed * 3.6).toFixed(0)} km/h` : ''}`);
      } else {
        o.step(1000 / 60, false);
        o.step(1000 / 60, false);
      }
    }
  }
  current = null;
  o.camHook = null;
  return log.concat(crashes.splice(0));
}

// ---- the sound: a second pass in real time, through the game's own synthesizer

// a worklet that hands every block of the mix, with its frame number, to the page
const WORKLET = `class Rec extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const i = inputs[0];
    if (i && i.length) this.port.postMessage({ f: currentFrame, l: i[0].slice(), r: (i[1] || i[0]).slice() });
    return true;
  }
}
registerProcessor('od-rec', Rec);`;
let workletReady = false;

interface Tap {
  chunks: { f: number; l: Float32Array; r: Float32Array }[];
  node: AudioWorkletNode;
}

/** Record whatever `src` plays (the rest of the graph keeps running; `sink` keeps the recorder pulled). */
async function tap(ctx: AudioContext, src: AudioNode, sink: AudioNode): Promise<Tap> {
  if (!workletReady) {
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
    workletReady = true;
  }
  const node = new AudioWorkletNode(ctx, 'od-rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
  const t: Tap = { chunks: [], node };
  node.port.onmessage = (e) => t.chunks.push(e.data);
  src.connect(node);
  node.connect(sink);
  return t;
}

/** frames [from, from + n) of a tap as a 32-bit float stereo WAV (a block the audio thread dropped is bridged) */
function wav(t: Tap, from: number, n: number, sr: number): Blob {
  const data = new Float32Array(n * 2);
  const have = new Uint8Array(n);
  for (const c of t.chunks)
    for (let i = 0; i < c.l.length; i++) {
      const k = c.f + i - from;
      if (k < 0 || k >= n) continue;
      data[k * 2] = c.l[i];
      data[k * 2 + 1] = c.r[i];
      have[k] = 1;
    }
  for (let k = 1; k < n; k++) {
    if (have[k] || !have[k - 1]) continue;
    let e = k;
    while (e < n && !have[e]) e++;
    if (e >= n) break;
    for (let j = k; j < e; j++) {
      const u = (j - k + 1) / (e - k + 1);
      for (const ch of [0, 1]) data[j * 2 + ch] = data[(k - 1) * 2 + ch] * (1 - u) + data[e * 2 + ch] * u;
    }
    k = e;
  }
  const head = new DataView(new ArrayBuffer(44));
  const str = (o: number, x: string) => [...x].forEach((ch, i) => head.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  head.setUint32(4, 36 + data.byteLength, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  head.setUint32(16, 16, true);
  head.setUint16(20, 3, true); // IEEE float
  head.setUint16(22, 2, true);
  head.setUint32(24, sr, true);
  head.setUint32(28, sr * 8, true);
  head.setUint16(32, 8, true);
  head.setUint16(34, 32, true);
  str(36, 'data');
  head.setUint32(40, data.byteLength, true);
  return new Blob([head.buffer, data.buffer], { type: 'audio/wav' });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Sound {
  engine: { ctx: AudioContext; master: GainNode; bus: AudioNode; out: AudioNode };
  bossa: { out: AudioNode; panner: AudioNode };
  engineS: { g: GainNode };
  crashes: { pans: PannerNode[] };
  start(): Promise<void>;
}

/** The mix goes to the recorder only (nothing out of the speakers); the music becomes its own track. */
async function studio(o: OD): Promise<{ s: Sound; ctx: AudioContext; mute: GainNode }> {
  const s = o.sound as unknown as Sound;
  const ctx = s.engine.ctx;
  // off the speakers first, then wake the sound up
  s.engine.out.disconnect();
  s.bossa.panner.disconnect();
  await s.start();
  if (ctx.state !== 'running') throw new Error('the sound has not started: click the page once, then run this again');
  const mute = ctx.createGain();
  mute.gain.value = 0;
  mute.connect(ctx.destination);
  return { s, ctx, mute };
}

/**
 * The sound of shots (in order, on this page): set up as record() does, then step the world in real time (the
 * audio clock sets the pace) so the game plays what the picture shows, and save each shot's mix to
 * .trailer/audio/<shot>.wav. The camera, the walker, the car and the crashes run exactly as in the picture pass.
 */
async function recordSound(names: string | string[]): Promise<string> {
  const o = od();
  prepare(o);
  const { s, ctx, mute } = await studio(o);
  const list = (typeof names === 'string' ? [names] : names).map((n) => SHOTS[n]);
  const master = s.engine.master.gain;
  master.cancelScheduledValues(0);
  master.value = 0;
  // the trailer's mix: the engine as heard from each camera, the knocks up close whatever the camera
  const trim = ctx.createGain();
  s.engineS.g.disconnect();
  s.engineS.g.connect(trim).connect(s.engine.bus);
  for (const pn of s.crashes.pans) pn.refDistance = 14;
  const t = await tap(ctx, s.engine.out, mute);
  const sr = ctx.sampleRate;
  const done: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const shot = list[i];
    await begin(o, shot, i === 0 || !!shot.setup);
    const at = shot.listen;
    if (at && !o.player.riding) o.player.teleport(at[0], at[1], 0, 0);
    trim.gain.value = shot.engine ?? 1;
    const t0 = ctx.currentTime + 0.12;
    if (i === 0) master.setValueAtTime(0.9, t0 - 0.02);
    const n = Math.round(shot.dur * 60);
    for (let k = 0; k < n; ) {
      // a frame shows the world after its two steps, a thirtieth of a second on: step that far ahead
      if (ctx.currentTime >= t0 + (k + 1) / 60 - 1 / 30) {
        o.step(1000 / 60, false);
        k++;
      } else await sleep(2);
    }
    const dur = n / 60;
    while (ctx.currentTime < t0 + dur + 0.05) await sleep(5);
    const file = `audio/${shot.name}.wav`;
    await save(file, wav(t, Math.round(t0 * sr), Math.round(dur * sr), sr));
    t.chunks = t.chunks.filter((c) => c.f >= Math.round((t0 + dur) * sr) - 512);
    done.push(`${file}: ${dur.toFixed(2)} s`);
  }
  t.node.disconnect();
  s.engine.out.disconnect();
  current = null;
  o.camHook = null;
  return done.join(', ');
}

/** The café's bossa nova on its own, dry (in the game it plays from a terrace): `seconds` of it. */
async function recordMusic(seconds = 16): Promise<string> {
  const o = od();
  o.pause(true);
  const { s, ctx, mute } = await studio(o);
  const t = await tap(ctx, s.bossa.out, mute);
  const sr = ctx.sampleRate;
  const t0 = ctx.currentTime + 0.1;
  while (ctx.currentTime < t0 + seconds + 0.1) await sleep(20);
  t.node.disconnect();
  await save('audio/music.wav', wav(t, Math.round(t0 * sr), Math.round(seconds * sr), sr));
  return `audio/music.wav: ${seconds} s`;
}

(window as unknown as { __trailer: unknown }).__trailer = { record, recordSound, recordMusic, peek, rehearse, cams, SHOTS, ORDER, CUTS, ride: () => ride, cars };
