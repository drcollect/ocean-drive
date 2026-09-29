// The soundscape, put together once the first click has unlocked audio, and fed each frame from the world:
// your ears follow the camera; the sea, the wind, the birds, the car, the rides and your own feet play
// from what the world is doing right now.
import { Vector3, type Camera } from 'three';
import type { Player } from '../player/player';
import type { Quality } from '../quality';
import type { Ride } from '../vehicles/ride';
import type { BirdCall } from '../world/birds';
import type { MovingCar } from '../world/cars';
import { windGust } from '../world/wind';
import { Bossa } from './bossa';
import { AudioEngine } from './engine';
import { AtvSound, BikeSound, CarEngine, Calls, CarSound, Crashes, Steps, Wind } from './sfx';
import { SurfSound } from './surfSound';

export interface AudioWorld {
  camera: Camera;
  player: Player;
  bike: Ride;
  atv: Ride;
  car: MovingCar;
  carVisible: () => boolean;
  calls: () => BirdCall[];
  palmsNear: (x: number, z: number, r: number) => number;
  musicSpot: Vector3;
}

export class Soundscape {
  readonly engine: AudioEngine;
  private surf: SurfSound;
  private steps: Steps;
  private calls: Calls;
  private wind: Wind;
  private car: CarSound;
  private bikeS: BikeSound;
  private atvS: AtvSound;
  private engineS: CarEngine;
  /** crash thumps, clangs and car alarms */
  readonly crashes: Crashes;
  private bossa: Bossa;
  private fwd = new Vector3();
  private up = new Vector3();

  constructor(private q: Quality, private w: AudioWorld) {
    const e = new AudioEngine();
    this.engine = e;
    this.surf = new SurfSound(e, q.waveVoices);
    this.steps = new Steps(e);
    this.calls = new Calls(e);
    this.wind = new Wind(e);
    this.car = new CarSound(e);
    this.bikeS = new BikeSound(e);
    this.atvS = new AtvSound(e);
    this.engineS = new CarEngine(e);
    this.crashes = new Crashes(e);
    this.bossa = new Bossa(e, w.musicSpot);
  }

  async start(): Promise<void> {
    await this.engine.resume();
    this.bossa.start();
  }

  toggleMute(): boolean {
    return this.engine.toggleMute();
  }

  update(t: number, dt: number): void {
    const e = this.engine;
    if (e.ctx.state !== 'running') return;
    const w = this.w;
    const cam = w.camera;
    const now = e.now;
    // the listener rides with the camera
    const l = e.ctx.listener;
    cam.getWorldDirection(this.fwd);
    this.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const p = cam.position;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, now, 0.02);
      l.positionY.setTargetAtTime(p.y, now, 0.02);
      l.positionZ.setTargetAtTime(p.z, now, 0.02);
      l.forwardX.setTargetAtTime(this.fwd.x, now, 0.02);
      l.forwardY.setTargetAtTime(this.fwd.y, now, 0.02);
      l.forwardZ.setTargetAtTime(this.fwd.z, now, 0.02);
      l.upX.setTargetAtTime(this.up.x, now, 0.02);
      l.upY.setTargetAtTime(this.up.y, now, 0.02);
      l.upZ.setTargetAtTime(this.up.z, now, 0.02);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(this.fwd.x, this.fwd.y, this.fwd.z, this.up.x, this.up.y, this.up.z);
    }
    const pl = w.player;
    this.surf.update(t, pl.feet.x, pl.feet.z);
    for (const s of pl.steps) this.steps.play(s.surface, s.strength);
    for (const c of w.calls()) {
      if (c.kind === 'gull') this.calls.gull(c.pos.x, c.pos.y + 0.3, c.pos.z);
      else if (c.kind === 'grackle') this.calls.grackle(c.pos.x, c.pos.y + 0.2, c.pos.z);
    }
    this.wind.update(windGust(p.x, p.z, t), w.palmsNear(p.x, p.z, 18));
    this.car.update(w.car.pos, w.car.vel, w.car.speed, w.carVisible(), p.x, p.z, dt);
    const r = pl.riding;
    this.bikeS.update(dt, r === w.bike, Math.abs(w.bike.speed), w.bike.throttle > 0.05, w.bike.surface);
    this.atvS.update(r === w.atv, Math.abs(w.atv.speed), w.atv.throttle);
    this.engineS.update(r?.def.kind === 'car', Math.abs(r?.speed ?? 0), r?.throttle ?? 0);
    this.bossa.update(Math.hypot(p.x - w.musicSpot.x, p.z - w.musicSpot.z));
  }
}

export type { Quality };
