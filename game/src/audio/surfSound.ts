// The sea. A row of wave voices along the shore, each on its own slot of beach, plays every breaker at the
// moment the surf schedule breaks it there (the same schedule the ocean shader draws), then the rush of
// the whitewater and the fizz of the swash running up the sand. The voice at your own spot follows the
// swash edge: you hear the water arrive at your feet when you see it. Under it all, the far surf's roar.
import { breakTime, localA, localR, runup, swashAt, TAU_S, tDown, tUp, wave, WAVE_DT, X_BREAK, X_SHORE, type SwashState } from '../world/surf';
import { setPos, type AudioEngine } from './engine';

interface Voice {
  z: number;
  panner: PannerNode;
  scheduled: Set<number>;
}

export class SurfSound {
  private voices: Voice[] = [];
  private spacing = 20;
  private near: { panner: PannerNode; fizz: GainNode; drag: GainNode; splash: GainNode };
  private bed: GainNode;
  private sw: SwashState = { depth: 0, edgeX: X_SHORE, flow: 0, highX: X_SHORE };
  private lastDepth = 0;

  constructor(private a: AudioEngine, count: number) {
    const ctx = a.ctx;
    for (let i = 0; i < count; i++) {
      const p = a.panner(14, 1.1, 800);
      this.voices.push({ z: 1e9, panner: p, scheduled: new Set() });
    }
    // continuous far surf: brown and pink noise, low-passed, breathing slowly
    this.bed = ctx.createGain();
    this.bed.gain.value = 0.12;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    a.loop(a.brown).connect(lp);
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'bandpass';
    lp2.frequency.value = 900;
    lp2.Q.value = 0.4;
    const pg = ctx.createGain();
    pg.gain.value = 0.25;
    a.loop(a.pink).connect(lp2).connect(pg).connect(lp);
    lp.connect(this.bed).connect(a.bus);
    // the swash at your feet: fizz on the run-up, a gravelly drag on the backwash, splashes when it hits
    const np = a.panner(1.2, 1.4, 60);
    const mk = (buf: AudioBuffer, type: BiquadFilterType, f: number, q: number) => {
      const flt = ctx.createBiquadFilter();
      flt.type = type;
      flt.frequency.value = f;
      flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      a.loop(buf, 1).connect(flt).connect(g).connect(np);
      return g;
    };
    this.near = { panner: np, fizz: mk(a.white, 'highpass', 2600, 0.5), drag: mk(a.pink, 'bandpass', 1400, 0.8), splash: mk(a.white, 'bandpass', 3200, 1.2) };
  }

  update(t: number, lx: number, lz: number): void {
    const a = this.a;
    const now = a.now;
    // keep the voices on 20 m slots round you
    const n = this.voices.length;
    const base = Math.round(lz / this.spacing) - Math.floor(n / 2);
    const wanted = new Set(Array.from({ length: n }, (_, i) => (base + i) * this.spacing));
    const free = this.voices.filter((v) => !wanted.has(v.z));
    for (const z of wanted) {
      if (this.voices.some((v) => v.z === z)) continue;
      const v = free.pop();
      if (!v) break;
      v.z = z;
      v.scheduled.clear();
      setPos(v.panner, X_BREAK - 5, 0.5, z, now);
    }
    // the bed grows as you get close to the water
    const d = Math.max(0, X_SHORE - lx);
    this.bed.gain.setTargetAtTime(0.05 + 0.2 / (1 + d / 30), now, 0.5);
    // schedule the breakers 0.6 s ahead
    const look = 0.6;
    for (const v of this.voices) {
      const k0 = Math.floor(t / WAVE_DT) - 2;
      for (let k = k0; k < k0 + 5; k++) {
        if (v.scheduled.has(k)) continue;
        const w = wave(k);
        const tb = breakTime(w, v.z);
        if (tb < t - 0.05 || tb > t + look) continue;
        v.scheduled.add(k);
        const at = now + Math.max(0, tb - t);
        const A = localA(w, v.z);
        this.breaker(v.panner, at, A);
      }
      if (v.scheduled.size > 12) v.scheduled.clear();
    }
    // your spot: follow the swash edge and the water round your feet
    swashAt(lx, lz, t, this.sw);
    const edgeX = Math.min(this.sw.edgeX, X_SHORE);
    const dx = Math.abs(lx - edgeX);
    setPos(this.near.panner, edgeX, 0.1, lz, now);
    const running = this.sw.edgeX < X_SHORE - 0.2 ? 1 : 0;
    const closeness = 1 / (1 + dx / 4);
    const up = this.sw.flow > 0 ? 1 : 0;
    const back = this.sw.flow < 0 ? 1 : 0;
    this.near.fizz.gain.setTargetAtTime(running * (0.1 + 0.4 * up) * closeness, now, 0.08);
    this.near.drag.gain.setTargetAtTime(running * back * 0.22 * closeness, now, 0.15);
    // water reaching you: a splash, then it runs round your ankles
    const depth = this.sw.depth;
    if (depth > 0 && this.lastDepth <= 0) {
      a.burst(this.near.panner, now, { type: 'bandpass', freq: 1800, q: 0.8, gain: 0.5, attack: 0.02, decay: 0.5, freqEnd: 900 });
    }
    this.near.splash.gain.setTargetAtTime(depth > 0 ? 0.12 + depth * 2 : 0, now, 0.1);
    this.lastDepth = depth;
    void localR;
    void runup;
    void tUp;
    void tDown;
    void TAU_S;
  }

  /** One breaker: a thump as the lip lands, then the rolling rush of whitewater. */
  private breaker(out: AudioNode, at: number, A: number): void {
    const a = this.a;
    const g = Math.min(1.2, 0.35 + A * 0.9);
    a.burst(out, at, { buf: a.brown, type: 'lowpass', freq: 260, gain: 0.9 * g, attack: 0.05, decay: 0.7 });
    a.burst(out, at + 0.05, { buf: a.pink, type: 'bandpass', freq: 700, freqEnd: 1600, q: 0.5, gain: 0.55 * g, attack: 0.35, decay: 2.6 + A });
    a.burst(out, at + 0.4, { buf: a.white, type: 'highpass', freq: 2200, gain: 0.18 * g, attack: 0.6, decay: 2.8 });
  }
}
