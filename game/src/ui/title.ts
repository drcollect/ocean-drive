// The sunrise title card: real build stages drive the progress bar, then "click to start".

export const STAGES = ['sky', 'hotels', 'palms', 'street', 'beach', 'ocean', 'people', 'audio'] as const;
export type Stage = (typeof STAGES)[number];

/** Let the page paint between stages (with a timer fallback: hidden tabs don't run animation frames). */
const nextFrame = () =>
  new Promise<void>((r) => {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        r();
      }
    };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 60);
  });

export class Title {
  private root = document.getElementById('title') as HTMLDivElement;
  private bar = this.root.querySelector('.bar i') as HTMLElement;
  private label = this.root.querySelector('.stage') as HTMLElement;
  private go = this.root.querySelector('.go') as HTMLElement;
  private done = 0;

  /** Run one build stage; the bar advances when it finishes. */
  async stage<T>(name: Stage, fn: () => T | Promise<T>): Promise<T> {
    this.label.textContent = name;
    await nextFrame();
    const out = await fn();
    this.done++;
    this.bar.style.width = `${Math.round((this.done / STAGES.length) * 100)}%`;
    await nextFrame();
    return out;
  }

  ready(text: string): void {
    this.label.textContent = '';
    this.go.textContent = text;
    this.root.classList.add('ready');
  }

  onStart(fn: () => void): void {
    const handler = (e: Event) => {
      if (!this.root.classList.contains('ready')) return;
      e.preventDefault();
      fn();
    };
    this.root.addEventListener('click', handler);
    this.root.addEventListener('touchend', handler, { passive: false });
  }

  hide(immediate = false): void {
    if (immediate) this.root.style.transition = 'none';
    this.root.classList.add('gone');
  }

  show(): void {
    this.root.classList.remove('gone');
  }

  error(msg: string): void {
    const e = document.createElement('div');
    e.className = 'err';
    e.textContent = msg;
    this.root.appendChild(e);
  }
}
