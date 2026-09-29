// Soft generative bossa nova from one café terrace: a nylon-string guitar (Karplus-Strong, pre-rendered
// in code) playing thumb bass on one and three and syncopated chords, a shaker in sixteenths and a rim
// click on the clave, over progressions that are chosen and varied as it goes. Positioned at the terrace,
// so it swells as you walk up to it and fades out along the street.
import { setPos, type AudioEngine } from './engine';

type Chord = { root: number; kind: 'maj7' | 'm7' | '7' | 'm7b5' | '6' };

const SHAPES: Record<Chord['kind'], number[]> = {
  maj7: [0, 4, 7, 11, 14],
  m7: [0, 3, 7, 10, 14],
  '7': [0, 4, 10, 14, 21],
  m7b5: [0, 3, 6, 10],
  '6': [0, 4, 7, 9, 14],
};

// progressions (MIDI roots): D major bossa changes and a few turnarounds
const PROGS: Chord[][] = [
  [{ root: 50, kind: 'maj7' }, { root: 50, kind: 'maj7' }, { root: 52, kind: '7' }, { root: 52, kind: '7' }, { root: 52, kind: 'm7' }, { root: 45, kind: '7' }, { root: 50, kind: 'maj7' }, { root: 45, kind: '7' }],
  [{ root: 43, kind: 'maj7' }, { root: 43, kind: 'm7' }, { root: 42, kind: 'm7' }, { root: 47, kind: '7' }, { root: 52, kind: 'm7' }, { root: 45, kind: '7' }, { root: 50, kind: '6' }, { root: 50, kind: '6' }],
  [{ root: 50, kind: 'maj7' }, { root: 47, kind: 'm7' }, { root: 52, kind: 'm7' }, { root: 45, kind: '7' }, { root: 42, kind: 'm7' }, { root: 47, kind: '7' }, { root: 52, kind: 'm7' }, { root: 45, kind: '7' }],
];

const CHORD_STEPS = [[0, 3, 6, 10, 13], [2, 5, 8, 11, 14]];
const CLAVE = [0, 3, 6, 10, 13];

export class Bossa {
  private out: GainNode;
  private panner: PannerNode;
  private air: BiquadFilterNode;
  private notes = new Map<number, AudioBuffer>();
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private prog = 0;
  private timer = 0;
  private readonly spb: number; // seconds per 16th

  constructor(private a: AudioEngine, pos: { x: number; y: number; z: number }) {
    const ctx = a.ctx;
    this.spb = 60 / 128 / 4;
    this.panner = a.panner(4, 1.25, 180);
    setPos(this.panner, pos.x, pos.y, pos.z, a.now);
    this.air = ctx.createBiquadFilter();
    this.air.type = 'lowpass';
    this.air.frequency.value = 6000;
    this.out = ctx.createGain();
    this.out.gain.value = 0.55;
    // a little terrace: a short slapback off the facade
    const slap = ctx.createDelay(0.2);
    slap.delayTime.value = 0.045;
    const slapG = ctx.createGain();
    slapG.gain.value = 0.25;
    this.out.connect(this.air).connect(this.panner);
    this.out.connect(slap).connect(slapG).connect(this.air);
    this.render();
  }

  /** Karplus-Strong plucks for E2 … E5, soft and warm like nylon. */
  private render(): void {
    const sr = this.a.ctx.sampleRate;
    for (let m = 40; m <= 79; m++) {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      const len = Math.floor(sr * (m < 55 ? 2.2 : 1.6));
      const buf = this.a.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      const N = Math.max(2, Math.round(sr / f));
      const ring = new Float32Array(N);
      // soft excitation: low-passed noise, plucked a fifth of the way along the string
      let lp = 0;
      for (let i = 0; i < N; i++) {
        lp += (Math.random() * 2 - 1 - lp) * 0.35;
        ring[i] = lp;
      }
      const pos = Math.floor(N * 0.2);
      for (let i = N - 1; i >= pos; i--) ring[i] -= ring[i - pos] * 0.6;
      const decay = m < 55 ? 0.9965 : 0.9952;
      let prev = 0;
      for (let i = 0; i < len; i++) {
        const j = i % N;
        const v = ring[j];
        d[i] = v;
        const nv = decay * 0.5 * (v + ring[(j + 1) % N]);
        ring[j] = nv * 0.7 + prev * 0.3; // extra damping: nylon, not steel
        prev = nv;
      }
      // fade the tail
      for (let i = len - 2000; i < len; i++) d[i] *= (len - i) / 2000;
      this.notes.set(m, buf);
    }
  }

  private pluck(m: number, at: number, gain: number): void {
    const buf = this.notes.get(Math.max(40, Math.min(79, m)));
    if (!buf) return;
    const s = this.a.ctx.createBufferSource();
    s.buffer = buf;
    s.detune.value = (Math.random() - 0.5) * 8;
    const g = this.a.ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(this.out);
    s.start(at);
  }

  private voicing(c: Chord): number[] {
    // close voicing around G3–D5
    return SHAPES[c.kind].map((iv) => {
      let n = c.root + iv;
      while (n < 55) n += 12;
      while (n > 74) n -= 12;
      return n;
    });
  }

  start(): void {
    this.nextTime = this.a.now + 0.3;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private schedule(): void {
    const ahead = this.a.now + 0.25;
    while (this.nextTime < ahead) {
      this.play(this.step, this.nextTime);
      // a little swing on the off-sixteenths
      this.nextTime += this.spb * (this.step % 2 === 0 ? 1.06 : 0.94);
      this.step++;
      if (this.step === 16) {
        this.step = 0;
        this.bar++;
        if (this.bar === 8) {
          this.bar = 0;
          this.prog = Math.random() < 0.6 ? this.prog : Math.floor(Math.random() * PROGS.length);
        }
      }
    }
  }

  private play(step: number, at: number): void {
    const prog = PROGS[this.prog];
    const c = prog[this.bar];
    const next = prog[(this.bar + 1) % prog.length];
    // thumb: root on 1, fifth on 3, now and then a leading tone into the next chord
    const bass = (n: number) => {
      while (n > 52) n -= 12;
      while (n < 40) n += 12;
      return n;
    };
    if (step === 0) this.pluck(bass(c.root), at, 0.5);
    if (step === 8) this.pluck(bass(c.root + 7), at, 0.42);
    if (step === 14 && Math.random() < 0.3) this.pluck(bass(next.root - 1), at, 0.3);
    // fingers: syncopated chord hits, strummed a few ms apart
    const pattern = CHORD_STEPS[this.bar % 2];
    if (pattern.includes(step)) {
      const v = this.voicing(c);
      v.slice(1).forEach((n, i) => this.pluck(n, at + i * 0.008, 0.17 + Math.random() * 0.04));
    }
    // now and then a single melody note from the chord, high up
    if ((step === 6 || step === 12) && Math.random() < 0.18) {
      const v = this.voicing(c);
      this.pluck(v[Math.floor(Math.random() * v.length)] + 12, at, 0.14);
    }
    // shaker: sixteenths, accents on the beat
    const acc = step % 4 === 0 ? 0.05 : step % 2 === 0 ? 0.03 : 0.02;
    this.a.burst(this.out, at, { type: 'highpass', freq: 6500, gain: acc, attack: 0.008, decay: 0.05 });
    // rim click on the clave
    if (CLAVE.includes(step) && this.bar % 2 === 0) this.a.burst(this.out, at, { type: 'bandpass', freq: 2800, q: 6, gain: 0.09, attack: 0.001, decay: 0.025 });
  }

  /** Air absorption: duller from further away. */
  update(dist: number): void {
    this.air.frequency.setTargetAtTime(Math.max(900, 7000 / (1 + dist / 25)), this.a.now, 0.3);
  }
}
