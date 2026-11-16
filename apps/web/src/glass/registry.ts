// The glass registry: every glass surface registers its element and its
// shape here. The registry measures the elements (ResizeObserver, layout
// events, and every frame while something animates) and hands the list of
// shapes to the active backend:
// - WebGL: the 3D viewer's composite pass draws the glass into the canvas
//   (`attachWebGL`), the DOM elements stay transparent;
// - CSS: each element draws itself with the CSS material (glass.css).
// Components never talk to a backend directly.
import type { GlassMaterial, GlassShape } from '@opensu/render';
import { GLASS, type GlassRole, type GlassTone, shaderMaterial, tintOf } from './material';
import { onSpringFrame } from './spring';

export type GlassBackend = 'webgl' | 'css';

/** Where the WebGL backend draws: the viewer's canvas and its glass API. */
export interface GlassTarget {
  canvas: HTMLElement;
  setGlass(shapes: readonly GlassShape[] | null, material?: GlassMaterial): void;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a surface draws this frame (viewport CSS px). Fields left out come from the spec and the element. */
export interface ShapeOverride {
  rect?: Rect;
  radius?: number;
  tint?: number;
  frost?: number;
  alpha?: number;
  magnify?: number;
  bend?: number;
  lift?: number;
  light?: { x: number; y: number; strength: number };
}

export interface SurfaceSpec {
  el: HTMLElement;
  role: GlassRole;
  /** Corner radius, px; 'capsule' = half the short side. */
  radius: number | 'capsule';
  /** Surfaces of the same group merge (smooth union). Default: their own. */
  group?: number;
  /** 1 = a lens on top of the chrome layer. */
  layer?: 0 | 1;
  /** Per-frame shape (morphs, lenses, press); null hides the surface. */
  shape?: () => ShapeOverride | null;
}

let nextGroup = 1000;
/** A fresh merge group id (a component and the panel that flows out of it share one). */
export function newGroup(): number {
  return nextGroup++;
}

/**
 * How visible an element is through its own and its ancestors' opacity
 * and visibility (a surface faded or hidden by a parent, e.g. the phone
 * input while a sheet is open, must not stay drawn in the canvas).
 */
function visibleAlpha(el: HTMLElement): number {
  let a = 1;
  for (let e: HTMLElement | null = el; e && e !== document.body; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
    const o = parseFloat(cs.opacity);
    if (o < 1) a *= o;
    if (a <= 0.005) return 0;
  }
  return a;
}

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

/** How long measuring continues every frame after a layout change (transitions, entry animations). */
const HOT_MS = 450;

class Registry {
  private surfaces = new Map<number, SurfaceSpec & { auto: number }>();
  private nextId = 1;
  private target: GlassTarget | null = null;
  private tone: GlassTone = 'dark';
  private opaque = false;
  private raf = 0;
  private hotUntil = 0;
  private last = '';
  private listeners = new Set<() => void>();
  private ro: ResizeObserver | null = null;
  private wired = false;
  /** Glass pushes to the viewer (tests count them while a panel animates). */
  pushes = 0;
  /** The last shape drawn per element, viewport px (tests read it: `window.__glass.shapeOf`). */
  private drawn = new WeakMap<HTMLElement, Rect & { radius: number; alpha: number }>();

  /** The shape the WebGL backend drew last for `el` (null on the CSS backend or when not drawn). */
  shapeOf(el: HTMLElement): (Rect & { radius: number; alpha: number }) | null {
    return this.target ? (this.drawn.get(el) ?? null) : null;
  }

  get backend(): GlassBackend {
    return this.target ? 'webgl' : 'css';
  }

  get glassTone(): GlassTone {
    return this.tone;
  }

  get reducedTransparency(): boolean {
    return this.opaque;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit(): void {
    for (const f of this.listeners) f();
  }

  private wire(): void {
    if (this.wired || typeof window === 'undefined') return;
    this.wired = true;
    this.ro = new ResizeObserver(() => this.kick());
    const kick = () => this.kick();
    window.addEventListener('resize', kick);
    window.addEventListener('scroll', kick, true);
    for (const ev of ['transitionrun', 'transitionend', 'animationstart', 'animationend']) document.addEventListener(ev, kick, true);
    onSpringFrame(() => this.collect());
    (window as unknown as { __glass?: unknown }).__glass = { shapeOf: (el: HTMLElement) => this.shapeOf(el) };
    const mq = matchMedia('(prefers-reduced-transparency: reduce)');
    const onMq = () => this.setOpaque(mq.matches);
    mq.addEventListener?.('change', onMq);
    onMq();
  }

  register(spec: SurfaceSpec): () => void {
    this.wire();
    const id = this.nextId++;
    this.surfaces.set(id, { ...spec, auto: spec.group ?? -id });
    this.ro?.observe(spec.el);
    this.kick();
    return () => {
      this.surfaces.delete(id);
      this.ro?.unobserve(spec.el);
      this.kick();
    };
  }

  /** The 3D viewer's canvas is showing: draw the glass there. `null`: back to CSS. */
  attachWebGL(target: GlassTarget | null): void {
    if (this.target === target) return;
    this.target?.setGlass(null);
    this.target = target;
    this.last = '';
    this.emit();
    this.kick();
  }

  setTone(tone: GlassTone): void {
    if (tone === this.tone) return;
    this.tone = tone;
    this.last = '';
    this.emit();
    this.kick();
  }

  setOpaque(on: boolean): void {
    if (on === this.opaque) return;
    this.opaque = on;
    this.last = '';
    this.emit();
    this.kick();
  }

  private paused = false;

  /**
   * Tests that read the drawing's pixels from the canvas: take the glass out
   * of the canvas (`true`) and put it back (`false`).
   */
  setPaused(on: boolean): void {
    this.paused = on;
    this.last = '';
    if (on) this.target?.setGlass(null);
    else this.kick();
  }

  /** Something may have moved: measure on the next frames. */
  kick(): void {
    this.hotUntil = performance.now() + HOT_MS;
    if (!this.raf && typeof requestAnimationFrame === 'function') this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    this.raf = 0;
    this.collect();
    if (performance.now() < this.hotUntil) this.raf = requestAnimationFrame(this.frame);
  };

  /** Measures every surface and pushes the shapes to the WebGL backend when they changed. */
  collect(): void {
    const target = this.target;
    if (!target || this.paused) return;
    const base = target.canvas.getBoundingClientRect();
    const shapes: GlassShape[] = [];
    for (const s of this.surfaces.values()) {
      this.drawn.delete(s.el);
      if (!s.el.isConnected) continue;
      const o = s.shape ? s.shape() : {};
      if (o === null) continue;
      const r = o.rect ?? rectOf(s.el);
      if (r.width < 1 || r.height < 1) continue;
      const seen = visibleAlpha(s.el);
      if (seen <= 0) continue;
      const radius = o.radius ?? (s.radius === 'capsule' ? Math.min(r.width, r.height) / 2 : s.radius);
      this.drawn.set(s.el, { ...r, radius: Math.min(radius, r.width / 2, r.height / 2), alpha: o.alpha ?? 1 });
      shapes.push({
        x: r.x - base.left,
        y: r.y - base.top,
        width: r.width,
        height: r.height,
        radius,
        tint: o.tint ?? tintOf(this.tone, s.role),
        frost: o.frost ?? (s.role === 'text' ? GLASS.frostPanel : GLASS.frostControl),
        alpha: (o.alpha ?? 1) * seen,
        layer: s.layer ?? 0,
        group: s.auto,
        magnify: o.magnify ?? 1,
        bend: o.bend ?? 1,
        lift: o.lift ?? 1,
        light: o.light ? { x: o.light.x - base.left, y: o.light.y - base.top, strength: o.light.strength } : undefined,
      });
    }
    const key = JSON.stringify(shapes) + this.tone + this.opaque;
    if (key === this.last) return;
    this.last = key;
    this.pushes++;
    target.setGlass(shapes, shaderMaterial(this.tone, this.opaque));
  }
}

/** The one registry of the app. */
export const glassRegistry = new Registry();
