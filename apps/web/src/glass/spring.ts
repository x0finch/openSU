// The one spring every glass motion uses (task 017, section 2b.6): a damped
// harmonic oscillator stepped analytically each frame, on one shared
// requestAnimationFrame loop. Presets are given the way Apple describes
// springs (response in seconds, damping fraction: 1 = no bounce) and
// converted to stiffness / damping for a unit mass.
//
// With `prefers-reduced-motion` a spring jumps to its target; the glass
// module then fades instead (see `Spring.reduced`).

export interface SpringPreset {
  /** Period of the undamped oscillation, s (Apple's "response"). */
  response: number;
  /** Damping fraction: 1 critically damped, < 1 bounces. */
  damping: number;
}

/**
 * Presets. Measured against Apple's WWDC25 footage (frames at 30 fps):
 * a popover or lens settles in about 0.3-0.4 s with a small overshoot,
 * the lift of a lens takes ~0.15 s, sheets glide without bounce.
 */
export const SPRINGS = {
  /** A panel flowing out of its button and back. */
  morph: { response: 0.42, damping: 0.78 },
  /** A lens sliding to the next segment. */
  slide: { response: 0.34, damping: 0.8 },
  /** A lens lifting (pressed, dragged) and settling. */
  lift: { response: 0.24, damping: 0.82 },
  /** Press: grow on pointer-down (quick) and settle on release (softer). */
  press: { response: 0.3, damping: 0.72 },
  release: { response: 0.42, damping: 0.78 },
  /** Phone sheets: no bounce. */
  sheet: { response: 0.4, damping: 1 },
  /** The fade that replaces motion under prefers-reduced-motion. */
  fade: { response: 0.3, damping: 1 },
} satisfies Record<string, SpringPreset>;

export function stiffnessOf(p: SpringPreset): { k: number; c: number } {
  const w = (2 * Math.PI) / p.response;
  return { k: w * w, c: 2 * p.damping * w };
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Advances x (offset from the target) and v by dt seconds, exactly. */
export function step(x: number, v: number, k: number, c: number, dt: number): [number, number] {
  const half = c / 2;
  const disc = half * half - k;
  if (disc > 1e-9) {
    const s = Math.sqrt(disc);
    const r1 = -half + s, r2 = -half - s;
    const b = (v - r1 * x) / (r2 - r1);
    const a = x - b;
    const e1 = Math.exp(r1 * dt), e2 = Math.exp(r2 * dt);
    return [a * e1 + b * e2, a * r1 * e1 + b * r2 * e2];
  }
  if (disc < -1e-9) {
    const w = Math.sqrt(-disc);
    const e = Math.exp(-half * dt), cs = Math.cos(w * dt), sn = Math.sin(w * dt);
    return [e * (x * cs + ((v + half * x) / w) * sn), e * (v * cs - ((half * v + k * x) / w) * sn)];
  }
  // Critically damped.
  const e = Math.exp(-half * dt);
  const b = v + half * x;
  return [e * (x + b * dt), e * (b - half * (x + b * dt))];
}

const moving = new Set<Spring>();
let frame = 0;
let last = 0;
const frameListeners = new Set<() => void>();

function tick(): void {
  // performance.now() rather than the frame's timestamp: the same clock as
  // `last` (they can differ, e.g. under a test's fake clock).
  const now = performance.now();
  frame = 0;
  const dt = Math.min(0.064, Math.max(0, (now - last) / 1000));
  last = now;
  for (const s of [...moving]) s.advance(dt);
  for (const f of frameListeners) f();
  if (moving.size) frame = requestAnimationFrame(tick);
}

/** Called after the springs advanced, on every frame while any spring moves. */
export function onSpringFrame(fn: () => void): () => void {
  frameListeners.add(fn);
  return () => frameListeners.delete(fn);
}

/** True while any spring is moving. */
export function springsMoving(): boolean {
  return moving.size > 0;
}

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  private k: number;
  private c: number;
  /** Set when the last `set` jumped because of reduced motion. */
  reduced = false;

  private readonly onChange?: (v: number) => void;

  constructor(value: number, preset: SpringPreset, onChange?: (v: number) => void) {
    this.onChange = onChange;
    this.value = this.target = value;
    ({ k: this.k, c: this.c } = stiffnessOf(preset));
  }

  tune(preset: SpringPreset): this {
    ({ k: this.k, c: this.c } = stiffnessOf(preset));
    return this;
  }

  /**
   * Moves towards `target`. `always`: animate even with reduced motion
   * (the fades that stand in for motion use it).
   */
  set(target: number, opts: { instant?: boolean; preset?: SpringPreset; velocity?: number; always?: boolean } = {}): void {
    if (opts.preset) this.tune(opts.preset);
    this.target = target;
    if (opts.velocity !== undefined) this.velocity = opts.velocity;
    this.reduced = !opts.always && prefersReducedMotion();
    if (opts.instant || this.reduced || (typeof document !== 'undefined' && document.hidden)) {
      this.value = target;
      this.velocity = 0;
      moving.delete(this);
      this.onChange?.(target);
      return;
    }
    if (this.value === target && this.velocity === 0) return;
    moving.add(this);
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  get moving(): boolean {
    return moving.has(this);
  }

  advance(dt: number): void {
    const [x, v] = step(this.value - this.target, this.velocity, this.k, this.c, dt);
    this.value = this.target + x;
    this.velocity = v;
    if (Math.abs(x) < 1e-4 && Math.abs(v) < 1e-3) {
      this.value = this.target;
      this.velocity = 0;
      moving.delete(this);
    }
    this.onChange?.(this.value);
  }

  stop(): void {
    moving.delete(this);
  }
}
