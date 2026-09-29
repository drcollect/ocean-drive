// The drop garage's sounds, all synthesized and placed at the garage: the bill going into the slot, the
// chatter of the randomness request, the lock of the assignment, the roller door, and a reveal sting that
// grows with the tier.
import { setPos, type AudioEngine } from './engine';
import type { TierId } from '../drop/drop01';

export class DropSfx {
  private out: PannerNode;
  constructor(private a: AudioEngine, x: number, y: number, z: number) {
    this.out = a.panner(5, 0.9, 300);
    setPos(this.out, x, y, z, a.now);
  }

  private chord(at: number, freqs: number[], gain: number, decay: number, type: OscillatorType = 'triangle', spread = 0): void {
    freqs.forEach((f, i) => this.a.tone(this.out, at + i * spread, { type, f0: f, gain, attack: 0.012, decay }));
  }

  pay(): void {
    const a = this.a;
    const t = a.now + 0.02;
    // the bill sliding in, the transport pulling it, a clunk, a two-note chime
    a.burst(this.out, t, { buf: a.pink, type: 'bandpass', freq: 1800, freqEnd: 600, q: 0.8, gain: 0.35, attack: 0.03, decay: 0.3 });
    for (let i = 0; i < 6; i++) a.burst(this.out, t + 0.12 + i * 0.045, { type: 'bandpass', freq: 3200, q: 3, gain: 0.08, attack: 0.002, decay: 0.02 });
    a.tone(this.out, t + 0.42, { type: 'square', f0: 150, f1: 70, gain: 0.18, attack: 0.004, decay: 0.08 });
    a.tone(this.out, t + 0.55, { f0: 1318.5, gain: 0.16, attack: 0.005, decay: 0.35 });
    a.tone(this.out, t + 0.68, { f0: 1760, gain: 0.16, attack: 0.005, decay: 0.5 });
  }

  /** digital chatter while the randomness comes in */
  entropy(dur: number): void {
    const a = this.a;
    const t0 = a.now + 0.02;
    a.burst(this.out, t0, { type: 'highpass', freq: 5000, gain: 0.05, attack: dur * 0.6, decay: dur * 0.4 });
    for (let t = 0; t < dur; t += 0.035 + Math.random() * 0.04) {
      const up = t / dur;
      a.tone(this.out, t0 + t, { type: 'square', f0: 600 + Math.random() * 1400 + up * 1200, gain: 0.035 + up * 0.03, attack: 0.002, decay: 0.03 });
    }
  }

  assign(): void {
    const a = this.a;
    const t = a.now + 0.01;
    a.tone(this.out, t, { type: 'square', f0: 220, f1: 110, gain: 0.2, attack: 0.003, decay: 0.09 });
    a.burst(this.out, t, { type: 'highpass', freq: 3000, gain: 0.2, attack: 0.001, decay: 0.03 });
    a.tone(this.out, t + 0.1, { f0: 55, gain: 0.3, attack: 0.01, decay: 0.4 });
  }

  /** the roller door: motor hum and slat rattle */
  door(dur: number): void {
    const a = this.a;
    const t0 = a.now + 0.02;
    const osc = a.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(46, t0);
    osc.frequency.linearRampToValueAtTime(58, t0 + dur);
    const f = a.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.15);
    g.gain.setValueAtTime(0.2, t0 + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.1);
    osc.connect(f).connect(g).connect(this.out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.2);
    for (let t = 0; t < dur; t += 0.06 + Math.random() * 0.03) a.burst(this.out, t0 + t, { type: 'bandpass', freq: 1500 + Math.random() * 900, q: 2.5, gain: 0.06, attack: 0.002, decay: 0.03 });
    a.tone(this.out, t0 + dur, { type: 'square', f0: 90, f1: 50, gain: 0.15, attack: 0.004, decay: 0.12 });
  }

  /** the sting: brighter and longer with each tier */
  reveal(tier: TierId): void {
    const a = this.a;
    const t = a.now + 0.02;
    const C = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];
    switch (tier) {
      case 'common':
        this.chord(t, C.slice(0, 3), 0.12, 1.1);
        break;
      case 'uncommon':
        this.chord(t, [...C.slice(0, 3), 1174.7], 0.11, 1.4, 'triangle', 0.03);
        break;
      case 'rare':
        this.chord(t, C.slice(0, 5), 0.11, 1.6, 'triangle', 0.07);
        this.chord(t + 0.4, [2637, 3136], 0.05, 1.4, 'sine', 0.05);
        break;
      case 'ultra':
        a.tone(this.out, t, { f0: 110, gain: 0.3, attack: 0.02, decay: 1.6 });
        this.chord(t, [440, 554.37, 659.25, 880, 1108.7], 0.11, 2.0, 'sawtooth', 0.06);
        this.chord(t + 0.35, [1760, 2217.5, 2637], 0.05, 1.6, 'sine', 0.05);
        break;
      case 'secret':
        a.tone(this.out, t, { f0: 55, gain: 0.4, attack: 0.02, decay: 2.2 });
        this.chord(t, C, 0.1, 2.4, 'sawtooth', 0.06);
        this.chord(t + 0.5, [C[0], C[1], C[2], C[3]], 0.1, 2.8, 'triangle');
        for (let i = 0; i < 26; i++) a.tone(this.out, t + 0.4 + Math.random() * 2.2, { f0: 2600 + Math.random() * 3600, gain: 0.04, attack: 0.003, decay: 0.12 });
        break;
    }
  }

  deny(): void {
    const a = this.a;
    a.tone(this.out, a.now + 0.01, { type: 'square', f0: 180, gain: 0.12, attack: 0.005, decay: 0.12 });
    a.tone(this.out, a.now + 0.15, { type: 'square', f0: 140, gain: 0.12, attack: 0.005, decay: 0.16 });
  }
}
