// Footsteps per surface, gull and grackle calls from the birds you can see, the wind in the palms, the
// passing car (Doppler by hand: Web Audio has none), the cruiser's freewheel and the ATV's engine.
import type { StepSurface } from '../player/player';
import { setPos, type AudioEngine } from './engine';

export class Steps {
  private out: GainNode;
  constructor(private a: AudioEngine) {
    this.out = a.ctx.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(a.bus);
  }

  play(surface: StepSurface, strength: number): void {
    const a = this.a;
    const at = a.now + 0.005;
    const g = strength * (0.85 + Math.random() * 0.3);
    const o = this.out;
    const r = () => 0.85 + Math.random() * 0.3;
    switch (surface) {
      case 'pavement':
      case 'asphalt':
      case 'curb':
      case 'tile':
        // heel then toe: a tick and a soft thud
        a.burst(o, at, { type: 'bandpass', freq: 2400 * r(), q: 1.2, gain: 0.32 * g, attack: 0.002, decay: 0.035 });
        a.burst(o, at + 0.045, { type: 'bandpass', freq: 3300 * r(), q: 1.4, gain: 0.18 * g, attack: 0.002, decay: 0.03 });
        a.tone(o, at, { f0: 110, f1: 60, gain: 0.3 * g, attack: 0.003, decay: 0.06 });
        break;
      case 'grass':
        a.burst(o, at, { type: 'bandpass', freq: 1500 * r(), q: 0.6, gain: 0.16 * g, attack: 0.02, decay: 0.12 });
        a.burst(o, at + 0.03, { type: 'highpass', freq: 4000, gain: 0.05 * g, attack: 0.01, decay: 0.08 });
        break;
      case 'sand':
        // soft 'shff' and a muffled push
        a.burst(o, at, { buf: a.pink, type: 'lowpass', freq: 1300 * r(), freqEnd: 500, gain: 0.3 * g, attack: 0.035, decay: 0.2 });
        a.burst(o, at + 0.02, { type: 'bandpass', freq: 3800 * r(), q: 2, gain: 0.05 * g, attack: 0.01, decay: 0.09 });
        a.tone(o, at, { f0: 70, f1: 45, gain: 0.12 * g, attack: 0.01, decay: 0.08 });
        break;
      case 'wetsand':
        // a firm, squelchy press
        a.burst(o, at, { buf: a.pink, type: 'bandpass', freq: 900 * r(), freqEnd: 350, q: 2.5, gain: 0.35 * g, attack: 0.01, decay: 0.13 });
        a.tone(o, at + 0.03, { f0: 320, f1: 180, gain: 0.05 * g, attack: 0.005, decay: 0.06 });
        break;
      case 'wood':
        // hollow boards: a knock and a couple of resonant modes
        a.burst(o, at, { type: 'bandpass', freq: 900, q: 1, gain: 0.3 * g, attack: 0.002, decay: 0.04 });
        for (const [f, k] of [[175, 0.35], [310, 0.2], [545, 0.1]] as [number, number][]) a.tone(o, at, { type: 'triangle', f0: f * r(), gain: k * g, attack: 0.003, decay: 0.16 });
        break;
      case 'splash':
      case 'water':
        a.burst(o, at, { type: 'bandpass', freq: 2200 * r(), freqEnd: 900, q: 0.9, gain: 0.45 * g, attack: 0.008, decay: 0.28 });
        for (let i = 0; i < 4; i++) {
          const t0 = at + 0.02 + Math.random() * 0.2;
          const f = 500 + Math.random() * 900;
          a.tone(o, t0, { f0: f, f1: f * 2.2, gain: 0.06 * g, attack: 0.004, decay: 0.05 });
        }
        break;
    }
  }
}

export class Calls {
  constructor(private a: AudioEngine) {}

  /** Laughing gull: a run of nasal, falling 'ha' notes. */
  gull(x: number, y: number, z: number): void {
    const a = this.a;
    const p = a.panner(8, 1.2, 250);
    setPos(p, x, y, z, a.now);
    const n = 4 + Math.floor(Math.random() * 5);
    let t = a.now + 0.02;
    const base = 900 + Math.random() * 250;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const dur = last ? 0.32 : 0.11 + Math.random() * 0.04;
      const f0 = base * (1.1 - i * 0.03) * (last ? 1.05 : 1);
      const osc = a.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.linearRampToValueAtTime(f0 * (last ? 0.72 : 0.86), t + dur);
      const bp = a.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2100;
      bp.Q.value = 3;
      const bp2 = a.ctx.createBiquadFilter();
      bp2.type = 'peaking';
      bp2.frequency.value = 3400;
      bp2.gain.value = 8;
      const g = a.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(bp).connect(bp2).connect(g).connect(p);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur + 0.05 + Math.random() * 0.04;
    }
    setTimeout(() => p.disconnect(), (t - a.now + 0.5) * 1000);
  }

  /** Boat-tailed grackle: a rising whistle and a dry click. */
  grackle(x: number, y: number, z: number): void {
    const a = this.a;
    const p = a.panner(4, 1.4, 80);
    setPos(p, x, y, z, a.now);
    const t = a.now + 0.02;
    a.tone(p, t, { type: 'triangle', f0: 1800, f1: 4200, gain: 0.12, attack: 0.02, decay: 0.22 });
    a.burst(p, t + 0.3, { type: 'bandpass', freq: 3000, q: 4, gain: 0.15, attack: 0.002, decay: 0.03 });
    a.burst(p, t + 0.36, { type: 'bandpass', freq: 3200, q: 4, gain: 0.12, attack: 0.002, decay: 0.03 });
    setTimeout(() => p.disconnect(), 1500);
  }
}

export class Wind {
  private whoosh: GainNode;
  private rustle: GainNode;
  private rustleF: BiquadFilterNode;
  constructor(private a: AudioEngine) {
    const ctx = a.ctx;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.35;
    this.whoosh = ctx.createGain();
    this.whoosh.gain.value = 0;
    a.loop(a.pink, 0.8).connect(bp).connect(this.whoosh).connect(a.bus);
    // palm fronds: high, papery clatter
    this.rustleF = ctx.createBiquadFilter();
    this.rustleF.type = 'bandpass';
    this.rustleF.frequency.value = 4200;
    this.rustleF.Q.value = 0.6;
    this.rustle = ctx.createGain();
    this.rustle.gain.value = 0;
    const am = ctx.createGain();
    am.gain.value = 0.6;
    // flutter: amplitude modulation from a slow noise source
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.35;
    lfo.connect(lfoG).connect(am.gain);
    lfo.start();
    a.loop(a.white, 1).connect(this.rustleF).connect(am).connect(this.rustle).connect(a.bus);
  }

  update(gust: number, palms: number): void {
    const now = this.a.now;
    this.whoosh.gain.setTargetAtTime(0.03 + gust * 0.07, now, 0.4);
    const r = Math.min(1, palms / 10) * (0.2 + gust * 0.8);
    this.rustle.gain.setTargetAtTime(r * 0.06, now, 0.25);
    this.rustleF.frequency.setTargetAtTime(3200 + gust * 2400, now, 0.4);
  }
}

/** The moving car: engine hum and tyre roar, Doppler-shifted by hand. */
export class CarSound {
  private panner: PannerNode;
  private osc: OscillatorNode;
  private tyres: AudioBufferSourceNode;
  private eng: GainNode;
  private roar: GainNode;
  private lastD = 0;
  constructor(private a: AudioEngine) {
    const ctx = a.ctx;
    this.panner = a.panner(6, 1.1, 400);
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 42;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    this.eng = ctx.createGain();
    this.eng.gain.value = 0;
    this.osc.connect(lp).connect(this.eng).connect(this.panner);
    this.osc.start();
    this.tyres = a.loop(a.pink, 1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.5;
    this.roar = ctx.createGain();
    this.roar.gain.value = 0;
    this.tyres.connect(bp).connect(this.roar).connect(this.panner);
  }

  update(pos: { x: number; y: number; z: number }, vel: { x: number; z: number }, speed: number, visible: boolean, lx: number, lz: number, dt: number): void {
    const now = this.a.now;
    setPos(this.panner, pos.x, 0.6, pos.z, now);
    const dx = pos.x - lx;
    const dz = pos.z - lz;
    const d = Math.hypot(dx, dz);
    // radial velocity (positive = coming closer)
    const vr = dt > 0 ? (this.lastD - d) / dt : 0;
    this.lastD = d;
    const c = 343;
    const shift = Math.max(0.7, Math.min(1.4, c / (c - Math.max(-60, Math.min(60, vr)))));
    const on = visible && speed > 0.1 ? 1 : 0;
    this.osc.frequency.setTargetAtTime((38 + speed * 4.5) * shift, now, 0.05);
    this.tyres.playbackRate.setTargetAtTime((0.6 + speed * 0.05) * shift, now, 0.05);
    this.eng.gain.setTargetAtTime(on * 0.16, now, 0.2);
    this.roar.gain.setTargetAtTime(on * Math.min(0.5, speed * 0.05), now, 0.2);
    void vel;
  }
}

/** The cruiser: freewheel ticks when coasting, a soft chain whirr when pedalling, tyre on the ground. */
export class BikeSound {
  private tick = 0;
  private out: GainNode;
  private tyre: GainNode;
  private tyreF: BiquadFilterNode;
  constructor(private a: AudioEngine) {
    this.out = a.ctx.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(a.bus);
    this.tyreF = a.ctx.createBiquadFilter();
    this.tyreF.type = 'bandpass';
    this.tyreF.frequency.value = 700;
    this.tyre = a.ctx.createGain();
    this.tyre.gain.value = 0;
    a.loop(a.pink).connect(this.tyreF).connect(this.tyre).connect(this.out);
  }

  update(dt: number, riding: boolean, speed: number, pedalling: boolean, surface: StepSurface): void {
    const now = this.a.now;
    const sandy = surface === 'sand' || surface === 'wetsand';
    this.tyre.gain.setTargetAtTime(riding ? Math.min(0.25, speed * 0.04) * (sandy ? 1.6 : 1) : 0, now, 0.1);
    this.tyreF.frequency.setTargetAtTime(sandy ? 450 : 1100, now, 0.2);
    if (!riding || speed < 0.4) return;
    // pawls: ~24 per wheel turn when coasting, a quieter whirr when pedalling
    const rate = (speed / (2 * Math.PI * 0.33)) * 24;
    this.tick += rate * dt;
    while (this.tick >= 1) {
      this.tick -= 1;
      if (!pedalling) this.a.burst(this.out, now + Math.random() * 0.01, { type: 'highpass', freq: 5200, gain: 0.07, attack: 0.001, decay: 0.012 });
      else if (Math.random() < 0.3) this.a.burst(this.out, now, { type: 'bandpass', freq: 2200, q: 2, gain: 0.025, attack: 0.002, decay: 0.02 });
    }
  }
}

/** The ATV: a single-cylinder thump that rises with speed and throttle, with intake noise. */
/** Crashes: a thump and a crunch for every hit, clanging metal and tinkling glass when cars meet, and the
 *  alarm of a parked car you knocked. */
export class Crashes {
  private pans: PannerNode[] = [];
  private next = 0;
  private alarmsUntil: number[] = [];
  constructor(private a: AudioEngine) {
    for (let i = 0; i < 6; i++) this.pans.push(a.panner(4, 1, 260));
  }

  private at(x: number, y: number, z: number): PannerNode {
    const p = this.pans[this.next++ % this.pans.length];
    setPos(p, x, y, z, this.a.now);
    return p;
  }

  hit(x: number, y: number, z: number, strength: number, cars: boolean): void {
    const a = this.a;
    const p = this.at(x, y, z);
    const t = a.now + 0.005;
    const k = Math.min(1, strength / 12);
    a.tone(p, t, { f0: 95, f1: 38, gain: 0.12 + 0.5 * k, attack: 0.003, decay: 0.22 + 0.2 * k });
    a.burst(p, t, { buf: a.white, type: 'lowpass', freq: 3200, freqEnd: 260, gain: 0.1 + 0.55 * k, attack: 0.002, decay: 0.18 + 0.35 * k });
    if (!cars) return;
    for (const f of [305, 517, 840, 1185, 1730]) a.tone(p, t + Math.random() * 0.02, { type: 'triangle', f0: f * (0.9 + Math.random() * 0.2), gain: 0.03 + 0.07 * k, attack: 0.002, decay: 0.3 + 0.6 * k });
    if (strength > 6) for (let i = 0; i < 9; i++) a.burst(p, t + 0.05 + Math.random() * 0.45, { type: 'bandpass', freq: 4500 + Math.random() * 4000, q: 6, gain: 0.05, attack: 0.001, decay: 0.05 });
  }

  /** a two-tone car alarm for a few seconds (no more than two at once) */
  alarm(x: number, y: number, z: number): void {
    const a = this.a;
    const now = a.now;
    this.alarmsUntil = this.alarmsUntil.filter((u) => u > now);
    if (this.alarmsUntil.length >= 2) return;
    this.alarmsUntil.push(now + 6);
    const p = this.at(x, y, z);
    for (let i = 0; i < 20; i++) a.tone(p, now + 0.3 + i * 0.28, { type: 'square', f0: i % 2 ? 960 : 1320, gain: 0.05, attack: 0.01, decay: 0.24 });
  }
}

/** The car you drive: a lower, smoother engine than the ATV, climbing through the gears. */
export class CarEngine {
  private osc: OscillatorNode;
  private sub: OscillatorNode;
  private lp: BiquadFilterNode;
  private g: GainNode;
  private on = false;
  constructor(private a: AudioEngine) {
    const ctx = a.ctx;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.sub = ctx.createOscillator();
    this.sub.type = 'triangle';
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 300;
    this.lp.Q.value = 1.4;
    this.g = ctx.createGain();
    this.g.gain.value = 0;
    this.osc.connect(this.lp);
    this.sub.connect(this.lp);
    this.lp.connect(this.g).connect(a.bus);
    this.osc.start();
    this.sub.start();
  }

  update(driving: boolean, speed: number, throttle: number): void {
    const now = this.a.now;
    if (driving && !this.on) this.a.burst(this.a.bus, now, { buf: this.a.brown, type: 'lowpass', freq: 300, gain: 0.45, attack: 0.05, decay: 0.6 });
    this.on = driving;
    // six gears of about 7 m/s each
    const gear = Math.min(5, Math.floor(speed / 7));
    const inGear = (speed - gear * 7) / 7;
    const rpm = 850 + inGear * 4200 * (1 - gear * 0.08) + Math.max(0, throttle) * 500 + (gear > 0 ? 1600 : 0);
    const f = rpm / 60;
    this.osc.frequency.setTargetAtTime(f, now, 0.06);
    this.sub.frequency.setTargetAtTime(f * 0.5, now, 0.06);
    this.lp.frequency.setTargetAtTime(260 + Math.max(0, throttle) * 1100 + speed * 25, now, 0.1);
    this.g.gain.setTargetAtTime(driving ? 0.1 + Math.max(0, throttle) * 0.08 : 0, now, 0.12);
  }
}

export class AtvSound {
  private oscA: OscillatorNode;
  private oscB: OscillatorNode;
  private lp: BiquadFilterNode;
  private g: GainNode;
  private intake: GainNode;
  private on = false;
  constructor(private a: AudioEngine) {
    const ctx = a.ctx;
    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator();
    this.oscB.type = 'square';
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.5);
    }
    shaper.curve = curve;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 500;
    this.lp.Q.value = 2;
    this.g = ctx.createGain();
    this.g.gain.value = 0;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.oscA.connect(mix);
    this.oscB.connect(mix);
    mix.connect(shaper).connect(this.lp).connect(this.g).connect(a.bus);
    this.oscA.start();
    this.oscB.start();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    this.intake = ctx.createGain();
    this.intake.gain.value = 0;
    a.loop(a.white).connect(bp).connect(this.intake).connect(a.bus);
  }

  update(riding: boolean, speed: number, throttle: number): void {
    const now = this.a.now;
    if (riding && !this.on) {
      // starter and catch
      this.a.burst(this.a.bus, now, { buf: this.a.brown, type: 'lowpass', freq: 400, gain: 0.5, attack: 0.05, decay: 0.4 });
    }
    this.on = riding;
    const rpm = 1400 + speed * 520 + Math.max(0, throttle) * 900;
    const f = rpm / 60;
    this.oscA.frequency.setTargetAtTime(f, now, 0.08);
    this.oscB.frequency.setTargetAtTime(f * 0.5, now, 0.08);
    this.lp.frequency.setTargetAtTime(380 + Math.max(0, throttle) * 1600 + speed * 60, now, 0.1);
    this.g.gain.setTargetAtTime(riding ? 0.14 + Math.max(0, throttle) * 0.1 : 0, now, 0.15);
    this.intake.gain.setTargetAtTime(riding ? 0.02 + Math.max(0, throttle) * 0.05 : 0, now, 0.15);
  }
}
