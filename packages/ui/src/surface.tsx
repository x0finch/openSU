// <Glass>: the base of every glass surface. It renders the element with the
// CSS material (glass.css) and registers it with the registry (its rim
// refraction on Chromium). Everything else in the module is built on it.
import { createContext, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cssVars, GLASS, type GlassRole, type GlassTone } from './material';
import { glassRegistry } from './registry';
import { preloadSurfaces } from './preload';
import { Spring, SPRINGS } from './spring';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

/** The glass layer's tone and transparency setting (re-renders when they change). */
export function useGlass(): { tone: GlassTone; opaque: boolean } {
  const tone = useSyncExternalStore(glassRegistry.subscribe, () => glassRegistry.glassTone, () => 'dark' as const);
  const opaque = useSyncExternalStore(glassRegistry.subscribe, () => glassRegistry.reducedTransparency, () => false);
  return { tone, opaque };
}

/**
 * Wraps the studio: sets the material's custom properties (ink, tint,
 * blur...) for everything inside. `tone` picks smoky (dark, the default
 * the owner chose) or light glass.
 */
export function GlassLayer({ tone = 'light', children }: { tone?: GlassTone; children: ReactNode }) {
  useEffect(() => glassRegistry.setTone(tone), [tone]);
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(preloadSurfaces, { timeout: 2000 });
    else window.setTimeout(preloadSurfaces, 1200);
  }, []);
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <div className="contents" style={cssVars(tone) as CSSProperties} data-glass-tone={tone}>
      <PortalHost value={host}>{children}</PortalHost>
      {/* Anchored surfaces (menus, panels) render here: out of any transformed or filtered surface, still inside the glass layer's properties. */}
      <div ref={setHost} className="contents" data-glass-portal="" />
    </div>
  );
}

const PortalCtx = createContext<HTMLElement | null>(null);
const PortalHost = PortalCtx.Provider;
/** Where anchored surfaces render (the glass layer's portal host). */
export function usePortalHost(): HTMLElement | null {
  return useContext(PortalCtx);
}

/** Merges refs. */
export function useMergedRef<T>(...refs: (Ref<T> | undefined)[]): (el: T | null) => void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((el: T | null) => {
    for (const r of refs) {
      if (typeof r === 'function') r(el);
      else if (r) (r as { current: T | null }).current = el;
    }
  }, refs);
}

/**
 * Press (section 2b.1): on pointer-down the surface lifts (grows a few px,
 * stretches a little towards a drag), a soft light follows the pointer
 * inside it; on release it springs back. After glisse's press (MIT).
 */
export function usePress(ref: { current: HTMLElement | null }, enabled: boolean): void {
  const springs = useRef<{ sx: Spring; sy: Spring; tx: Spring; ty: Spring; l: Spring } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const paint = () => {
      const s = springs.current!;
      el.style.scale = `${s.sx.value.toFixed(4)} ${s.sy.value.toFixed(4)}`;
      el.style.translate = `${s.tx.value.toFixed(2)}px ${s.ty.value.toFixed(2)}px`;
      el.style.setProperty('--lg-press', Math.max(0, s.l.value).toFixed(3));
    };
    const mk = (v: number) => new Spring(v, SPRINGS.release, paint);
    springs.current = { sx: mk(1), sy: mk(1), tx: mk(0), ty: mk(0), l: mk(0) };
    let ptr: { id: number; x: number; y: number; w: number; h: number; left: number; top: number; grow: number } | null = null;
    const to = (sx: number, sy: number, tx: number, ty: number, l: number, preset: typeof SPRINGS.press) => {
      const s = springs.current!;
      s.sx.set(sx, { preset });
      s.sy.set(sy, { preset });
      s.tx.set(tx, { preset });
      s.ty.set(ty, { preset });
      s.l.set(l, { preset });
    };
    const track = (e: PointerEvent) => {
      if (!ptr) return;
      el.style.setProperty('--lg-x', `${((e.clientX - ptr.left) / ptr.w) * 100}%`);
      el.style.setProperty('--lg-y', `${((e.clientY - ptr.top) / ptr.h) * 100}%`);
      const base = 1 + ptr.grow / Math.max(ptr.w, ptr.h);
      const aspect = ptr.w / ptr.h;
      const dx = (e.clientX - ptr.x) / aspect, dy = e.clientY - ptr.y;
      const len = Math.hypot(dx, dy);
      if (!len) return to(base, base, 0, 0, 1, SPRINGS.press);
      const nx = dx / len, ny = dy / len;
      const rubber = 1 - 1 / (1 + len / ptr.h / (5 * aspect));
      const stretch = 1 + (6 / ptr.h) * rubber * Math.abs(Math.abs(nx) - Math.abs(ny));
      const hor = Math.abs(nx) > Math.abs(ny);
      to(base * (hor ? stretch : 1 / stretch), base * (hor ? 1 / stretch : stretch), nx * 8 * rubber, ny * 8 * rubber, 1, SPRINGS.press);
    };
    const move = (e: PointerEvent) => e.pointerId === ptr?.id && track(e);
    const end = (e?: PointerEvent) => {
      if (e && e.pointerId !== ptr?.id) return;
      ptr = null;
      delete el.dataset.pressed;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      to(1, 1, 0, 0, 0, SPRINGS.release);
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0 || ptr) return;
      // Measure without the press transform.
      const r = el.getBoundingClientRect();
      const s = springs.current!;
      const w = r.width / s.sx.value, h = r.height / s.sy.value;
      ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, w, h, left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, grow: e.pointerType === 'mouse' ? GLASS.pressGrow : GLASS.pressGrowTouch };
      el.dataset.pressed = '';
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      track(e);
    };
    el.addEventListener('pointerdown', down);
    return () => {
      el.removeEventListener('pointerdown', down);
      end();
      for (const s of Object.values(springs.current!)) s.stop();
      el.style.scale = '';
      el.style.translate = '';
    };
  }, [ref, enabled]);
}

type Tag = 'div' | 'section' | 'form' | 'aside' | 'header' | 'nav';

export interface GlassProps extends Omit<HTMLAttributes<HTMLElement>, 'role'> {
  as?: Tag;
  /** A control or a surface holding text (the same material; it names the surface). */
  kind?: GlassRole;
  /** Corner radius, px, or 'capsule'. */
  radius?: number | 'capsule';
  /** Lift and light on press. */
  press?: boolean;
  /** ARIA role of the element. */
  ariaRole?: string;
  ref?: Ref<HTMLElement>;
}

/** The base glass surface. */
export function Glass({ as = 'div', kind = 'control', radius = 'capsule', press = false, ariaRole, className, style, children, ref, ...rest }: GlassProps) {
  const { opaque } = useGlass();
  const el = useRef<HTMLElement | null>(null);
  const merged = useMergedRef(el, ref);
  usePress(el, press);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    return glassRegistry.register({ el: node, role: kind });
  }, [kind, radius]);
  const Tag = as as 'div';
  return (
    <Tag
      ref={merged as Ref<HTMLDivElement>}
      role={ariaRole}
      className={cx('lg', className)}
      data-kind={kind}
      data-opaque={opaque ? '' : undefined}
      style={{ ['--lg-radius' as string]: radius === 'capsule' ? '9999px' : `${radius}px`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * A lens on a glass control (the selected segment, a slider thumb): a copy
 * of what lies under it, magnified while it is lifted (the component moves
 * and scales it).
 */
export function GlassLens({ className, style, children, ref }: { className?: string; style?: CSSProperties; children?: ReactNode; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={cx('lg-lens', className)} style={style} aria-hidden="true">
      {children}
    </div>
  );
}
