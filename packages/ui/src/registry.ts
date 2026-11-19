// The glass registry: every glass surface registers its element here. Task
// 035: the glass is one CSS material everywhere (glass.css); the registry
// holds the layer's tone and transparency setting and, on Chromium, gives
// each surface its rim refraction (refract.ts) and keeps it sized to the
// element.
import type { GlassRole, GlassTone } from './material';
import { Refraction, refractionOn } from './refract';

export interface SurfaceSpec {
  el: HTMLElement;
  role: GlassRole;
}

class Registry {
  private surfaces = new Map<HTMLElement, Refraction | null>();
  private tone: GlassTone = 'dark';
  private opaque = false;
  private listeners = new Set<() => void>();
  private ro: ResizeObserver | null = null;
  private wired = false;

  get glassTone(): GlassTone {
    return this.tone;
  }

  get reducedTransparency(): boolean {
    return this.opaque;
  }

  /** Whether the surfaces bend the backdrop at their rim (Chromium). */
  get refraction(): boolean {
    return refractionOn();
  }

  /** The surfaces registered now (tests count them). */
  get count(): number {
    return this.surfaces.size;
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
    if (refractionOn()) {
      this.ro = new ResizeObserver((entries) => {
        for (const e of entries) this.surfaces.get(e.target as HTMLElement)?.update();
      });
    }
    const mq = matchMedia('(prefers-reduced-transparency: reduce)');
    const onMq = () => this.setOpaque(mq.matches);
    mq.addEventListener?.('change', onMq);
    onMq();
  }

  register(spec: SurfaceSpec): () => void {
    this.wire();
    const { el } = spec;
    const r = this.ro ? new Refraction(el) : null;
    this.surfaces.set(el, r);
    if (r) {
      r.update();
      this.ro!.observe(el);
    }
    return () => {
      this.ro?.unobserve(el);
      r?.dispose();
      this.surfaces.delete(el);
    };
  }

  setTone(tone: GlassTone): void {
    if (tone === this.tone) return;
    this.tone = tone;
    this.emit();
  }

  setOpaque(on: boolean): void {
    if (on === this.opaque) return;
    this.opaque = on;
    this.emit();
  }
}

/** The one registry of the app. */
export const glassRegistry = new Registry();
