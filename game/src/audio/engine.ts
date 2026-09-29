// The audio context and the few building blocks every sound uses: noise buffers, HRTF panners, envelopes.
// Everything is synthesized; nothing is loaded.

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  /** everything spatial goes through here (then the master) */
  readonly bus: GainNode;
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  readonly brown: AudioBuffer;
  muted = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.bus = this.ctx.createGain();
    this.bus.connect(this.master);
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.white = this.noise('white', 4);
    this.pink = this.noise('pink', 4);
    this.brown = this.noise('brown', 4);
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.now, 0.6);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.now, 0.08);
    return this.muted;
  }

  private noise(kind: 'white' | 'pink' | 'brown', seconds: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0,
        last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
      // crossfade the loop point
      const f = Math.floor(sr * 0.05);
      for (let i = 0; i < f; i++) {
        const a = i / f;
        d[n - f + i] = d[n - f + i] * (1 - a) + d[i] * a;
      }
    }
    return buf;
  }

  /** An HRTF panner at a position. */
  panner(ref = 3, rolloff = 1, max = 400): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = max;
    p.connect(this.bus);
    return p;
  }

  /** A looping noise source (random offset so loops don't phase). */
  loop(buf: AudioBuffer, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(this.now, Math.random() * buf.duration);
    return s;
  }

  /** One-shot noise burst through a filter, with an attack/decay envelope, into `out`. */
  burst(out: AudioNode, at: number, o: { buf?: AudioBuffer; type: BiquadFilterType; freq: number; q?: number; gain: number; attack: number; decay: number; freqEnd?: number; rate?: number }): void {
    const s = this.ctx.createBufferSource();
    s.buffer = o.buf ?? this.white;
    s.playbackRate.value = o.rate ?? 1;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.setValueAtTime(o.freq, at);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, at + o.attack + o.decay);
    f.Q.value = o.q ?? 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), at + o.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + o.attack + o.decay);
    s.connect(f).connect(g).connect(out);
    s.start(at, Math.random() * Math.max(0, s.buffer.duration - o.attack - o.decay - 0.1));
    s.stop(at + o.attack + o.decay + 0.05);
  }

  /** A short sine/triangle tone with a pitch glide. */
  tone(out: AudioNode, at: number, o: { type?: OscillatorType; f0: number; f1?: number; gain: number; attack: number; decay: number }): void {
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, at);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, at + o.attack + o.decay);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), at + o.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + o.attack + o.decay);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + o.attack + o.decay + 0.05);
  }
}

export function setPos(p: PannerNode, x: number, y: number, z: number, at: number): void {
  if (p.positionX) {
    p.positionX.setTargetAtTime(x, at, 0.03);
    p.positionY.setTargetAtTime(y, at, 0.03);
    p.positionZ.setTargetAtTime(z, at, 0.03);
  } else p.setPosition(x, y, z);
}
