// Keyboard, mouse (pointer lock) and touch, reduced to one small state the walker and the vehicles read.
//   Desktop: click to lock the pointer, mouse look, WASD, Shift faster, Space jump, E ride, M mute, Esc.
//   Touch: left thumb stick to move, drag anywhere else to look, buttons for jump, ride and mute.

export interface InputState {
  /** -1..1 */
  moveX: number;
  moveZ: number;
  fast: boolean;
  /** accumulated look deltas since last read (radians) */
  lookX: number;
  lookY: number;
  jump: boolean;
  ride: boolean;
  mute: boolean;
  locked: boolean;
  touch: boolean;
}

export class Input {
  readonly s: InputState = { moveX: 0, moveZ: 0, fast: false, lookX: 0, lookY: 0, jump: false, ride: false, mute: false, locked: false, touch: false };
  private keys = new Set<string>();
  private taps = new Set<string>();
  private stick = { id: -1, x0: 0, y0: 0, dx: 0, dy: 0 };
  private look = { id: -1, x: 0, y: 0 };
  private ui: HTMLDivElement | null = null;
  onLockChange: (locked: boolean) => void = () => {};
  sensitivity = 0.0022;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.taps.add(e.code);
      if (e.code === 'Space') this.s.jump = true;
      if (e.code === 'KeyE') this.s.ride = true;
      if (e.code === 'KeyM') this.s.mute = true;
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.s.locked = document.pointerLockElement === this.canvas;
      this.onLockChange(this.s.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.s.locked) return;
      this.s.lookX += e.movementX * this.sensitivity;
      this.s.lookY += e.movementY * this.sensitivity;
    });
    canvas.addEventListener('click', () => {
      if (!this.s.touch && !this.s.locked) this.lock();
    });
  }

  lock(): void {
    const p = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  /** Build the on-screen touch controls (only on touch devices). */
  enableTouch(): void {
    this.s.touch = true;
    const ui = document.createElement('div');
    ui.id = 'touch';
    ui.innerHTML = `
      <div class="stick"><i></i></div>
      <button data-k="jump">JUMP</button>
      <button data-k="ride">USE</button>
      <button data-k="card">CARD</button>
      <button data-k="mute">MUTE</button>`;
    const css = document.createElement('style');
    css.textContent = `
      #touch { position: fixed; inset: 0; pointer-events: none; z-index: 7; font-family: 'Avenir Next', system-ui, sans-serif; }
      #touch .stick { position: absolute; left: 28px; bottom: 28px; width: 124px; height: 124px; border-radius: 50%;
        border: 1.5px solid rgba(255,252,246,0.55); background: rgba(40,30,40,0.12); }
      #touch .stick i { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%;
        background: rgba(255,252,246,0.55); }
      #touch button { position: absolute; right: 24px; pointer-events: auto; width: 64px; height: 64px; border-radius: 50%;
        border: 1.5px solid rgba(255,252,246,0.6); background: rgba(40,30,40,0.14); color: rgba(255,252,246,0.9);
        font-size: 10px; letter-spacing: 0.15em; }
      #touch button[data-k=jump] { bottom: 30px; right: 30px; }
      #touch button[data-k=ride] { bottom: 110px; right: 44px; }
      #touch button[data-k=mute] { top: 24px; right: 24px; width: 48px; height: 48px; }
      #touch button[data-k=card] { top: 84px; right: 24px; width: 48px; height: 48px; font-size: 9px; }`;
    document.head.appendChild(css);
    document.body.appendChild(ui);
    this.ui = ui;
    const knob = ui.querySelector('.stick i') as HTMLElement;
    ui.querySelectorAll('button').forEach((b) =>
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const k = (b as HTMLButtonElement).dataset.k;
        if (k === 'jump') this.s.jump = true;
        if (k === 'ride') this.s.ride = true;
        if (k === 'mute') this.s.mute = true;
        if (k === 'card') this.taps.add('KeyI');
      }),
    );
    const onStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth * 0.4 && t.clientY > window.innerHeight * 0.45 && this.stick.id < 0) {
          this.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, dx: 0, dy: 0 };
        } else if (this.look.id < 0) {
          this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
        }
      }
    };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stick.id) {
          this.stick.dx = Math.max(-1, Math.min(1, (t.clientX - this.stick.x0) / 50));
          this.stick.dy = Math.max(-1, Math.min(1, (t.clientY - this.stick.y0) / 50));
          knob.style.transform = `translate(${this.stick.dx * 36}px, ${this.stick.dy * 36}px)`;
        } else if (t.identifier === this.look.id) {
          this.s.lookX += (t.clientX - this.look.x) * 0.005;
          this.s.lookY += (t.clientY - this.look.y) * 0.005;
          this.look.x = t.clientX;
          this.look.y = t.clientY;
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stick.id) {
          this.stick = { id: -1, x0: 0, y0: 0, dx: 0, dy: 0 };
          knob.style.transform = '';
        }
        if (t.identifier === this.look.id) this.look.id = -1;
      }
    };
    this.canvas.addEventListener('touchstart', onStart, { passive: false });
    this.canvas.addEventListener('touchmove', onMove, { passive: false });
    this.canvas.addEventListener('touchend', onEnd);
    this.canvas.addEventListener('touchcancel', onEnd);
  }

  showTouch(on: boolean): void {
    if (this.ui) this.ui.style.display = on ? '' : 'none';
  }

  /** Refresh the axes from the held keys / stick. Call once per frame before reading. */
  poll(): void {
    const k = this.keys;
    let x = 0;
    let z = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) z += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (this.stick.id >= 0) {
      x += this.stick.dx;
      z -= this.stick.dy;
    }
    const l = Math.hypot(x, z);
    if (l > 1) {
      x /= l;
      z /= l;
    }
    this.s.moveX = x;
    this.s.moveZ = z;
    this.s.fast = k.has('ShiftLeft') || k.has('ShiftRight') || (this.stick.id >= 0 && Math.hypot(this.stick.dx, this.stick.dy) > 0.95);
  }

  /** Was this key pressed since the last time anyone asked? (one-shot keys like I and R) */
  took(code: string): boolean {
    const had = this.taps.has(code);
    this.taps.delete(code);
    return had;
  }

  /** Read and clear the one-shot flags and look deltas. */
  consume(): { jump: boolean; ride: boolean; mute: boolean; lookX: number; lookY: number } {
    const out = { jump: this.s.jump, ride: this.s.ride, mute: this.s.mute, lookX: this.s.lookX, lookY: this.s.lookY };
    this.s.jump = this.s.ride = this.s.mute = false;
    this.s.lookX = this.s.lookY = 0;
    return out;
  }
}
