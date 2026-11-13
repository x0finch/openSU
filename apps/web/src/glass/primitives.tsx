// Glass primitives the whole studio composes: button group, standalone
// button, segmented control (sliding lens), popover / menu that flows out
// of its control, input bar, text surface, toast, and what sits inside
// glass (plates, rows, separators, choice chips, the lens slider). A
// screen composes these; it never styles glass itself.
import {
  type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type ReactNode, type Ref, useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { cx, Glass, type GlassProps, GlassLens, useGlass, useMergedRef } from './Glass';
import { GLASS, TONES } from './material';
import { glassRegistry, type Rect, type ShapeOverride } from './registry';
import { prefersReducedMotion, Spring, SPRINGS } from './spring';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const toRect = (r: DOMRect): Rect => ({ x: r.left, y: r.top, width: r.width, height: r.height });

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

/** One capsule holding several icon buttons (a toolbar group). */
export function GlassButtonGroup({ label, group, className, children, testId, ref }: { label: string; group?: number; className?: string; children: ReactNode; testId?: string; ref?: Ref<HTMLElement> }) {
  return (
    <Glass ref={ref} ariaRole="toolbar" aria-label={label} group={group} press className={cx('pointer-events-auto flex h-12 items-center gap-0.5 px-1.5', className)} data-testid={testId}>
      {children}
    </Glass>
  );
}

/**
 * An icon button inside a group: icon only with a tooltip; an active tool
 * shows its value beside the icon (e.g. the sun time). `on`: its panel is
 * open (a plate marks it).
 */
export function GlassGroupButton({ icon, label, value, on, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; label: string; value?: ReactNode; on?: boolean }) {
  return (
    <span className="lg-tipped relative inline-flex">
      <button
        type="button"
        aria-label={label}
        data-on={on ? '' : undefined}
        className={cx('lg-plate tnum inline-flex h-9 min-w-9 items-center justify-center gap-1.5 text-[14px] font-medium whitespace-nowrap', value ? 'pr-3 pl-2.5' : 'px-0', className)}
        {...rest}
      >
        {icon}
        {value && <span>{value}</span>}
      </button>
      {!value && <span className="lg-tip" aria-hidden="true">{label}</span>}
    </span>
  );
}

/** A standalone glass button: circular (icon) or a capsule (icon and label). */
export function GlassButton({ icon, children, label, size = 48, accent, className, glassClassName, group, ref, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; label?: string; size?: number; accent?: boolean; glassClassName?: string; group?: number; ref?: Ref<HTMLButtonElement> }) {
  const round = !children;
  return (
    <Glass press group={group} className={cx('pointer-events-auto inline-flex', glassClassName)} style={{ height: size, minWidth: size }}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cx('lg-focus inline-flex h-full flex-1 items-center justify-center gap-2 rounded-full text-[14px] font-medium whitespace-nowrap', round ? 'w-full' : 'px-4', accent && 'text-on-accent', className)}
        {...rest}
      >
        {icon}
        {children}
      </button>
    </Glass>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control with a sliding lens                               */
/* ------------------------------------------------------------------ */

export interface GlassSegment<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * Radio group in a capsule. The selected segment is a slightly denser lens
 * that slides with a spring; pressed or dragged it lifts into a clear
 * magnifying lens over the labels and settles back on release (2b.2).
 */
export function GlassSegmented<T extends string>({ value, onChange, segments, label, className, height = 48, compact, testId }: { value: T; onChange: (v: T) => void; segments: GlassSegment<T>[]; label: string; className?: string; height?: number; compact?: boolean; testId?: string }) {
  const box = useRef<HTMLElement | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const pad = 4;
  const geo = useRef({ x: 0, w: 0, h: 0, ready: false });
  const valueRef = useRef(value);
  valueRef.current = value;
  const [slotState, setSlotState] = useState<{ left: number; width: number; value: T }[]>([]);
  const slots = () => [...(row.current?.querySelectorAll<HTMLElement>('[data-seg]') ?? [])].map((b) => ({ left: b.offsetLeft + (row.current?.offsetLeft ?? 0), width: b.offsetWidth, value: b.dataset.seg as T }));
  const paint = useCallback(() => {
    const L = lens.current, C = copy.current, R = row.current;
    if (!L || !C || !R) return;
    const s = springs.current!;
    // A moving lens stretches along its path a little (jelly), centred where it is.
    const stretch = Math.min(GLASS.lensStretchMax, Math.abs(s.x.velocity) * GLASS.lensStretch);
    const x = s.x.value - stretch / 2, w = s.w.value + stretch, h = geo.current.h, lift = clamp(s.lift.value, 0, 1.2);
    const sx = 1 + (GLASS.lensGrowX / Math.max(1, w)) * lift, sy = 1 + (GLASS.lensGrowY / Math.max(1, h)) * lift;
    const mag = 1 + (GLASS.lensMagnify - 1) * clamp(lift, 0, 1);
    L.style.left = `${x}px`;
    L.style.top = `${pad}px`;
    L.style.width = `${w}px`;
    L.style.height = `${h}px`;
    L.style.transform = `scale(${sx}, ${sy})`;
    L.style.setProperty('--lg-lift', clamp(lift, 0, 1).toFixed(3));
    // The copy of the labels inside the lens, magnified about its centre.
    const cxL = w / 2, cyL = h / 2, CX = x + cxL, CY = pad + cyL;
    const kx = mag / sx, ky = mag / sy;
    C.style.transform = `translate(${cxL - kx * CX}px, ${cyL - ky * CY}px) scale(${kx}, ${ky})`;
    // The labels under the lens give way to the copy.
    const a = CX - (w * sx) / 2, b = CX + (w * sx) / 2;
    const m = `linear-gradient(to right, #000 ${a - R.offsetLeft}px, transparent ${a - R.offsetLeft}px, transparent ${b - R.offsetLeft}px, #000 ${b - R.offsetLeft}px)`;
    R.style.maskImage = m;
    R.style.webkitMaskImage = m;
  }, []);
  const springs = useRef<{ x: Spring; w: Spring; lift: Spring } | null>(null);
  if (!springs.current) springs.current = { x: new Spring(0, SPRINGS.slide, () => paint()), w: new Spring(0, SPRINGS.slide, () => paint()), lift: new Spring(0, SPRINGS.lift, () => paint()) };

  const goTo = useCallback((v: T, instant = false) => {
    const sl = slots().find((s) => s.value === v);
    if (!sl) return;
    const s = springs.current!;
    s.x.set(sl.left, { instant, preset: SPRINGS.slide });
    s.w.set(sl.width, { instant, preset: SPRINGS.slide });
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      geo.current.h = el.clientHeight - 2 * pad;
      const sl = slots();
      setSlotState((c) => (JSON.stringify(c) === JSON.stringify(sl) ? c : sl));
      goTo(valueRef.current, !geo.current.ready);
      geo.current.ready = true;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (row.current) ro.observe(row.current);
    return () => ro.disconnect();
  }, [goTo]);
  useEffect(() => {
    if (geo.current.ready && !drag.current) goTo(value);
  }, [value, goTo]);

  // Press and drag: the lens lifts, follows the pointer, settles on release.
  const drag = useRef<{ id: number; x0: number; moved: boolean; grab: number } | null>(null);
  const settleTimer = useRef(0);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const el = box.current!;
    const r = el.getBoundingClientRect();
    const s = springs.current!;
    clearTimeout(settleTimer.current);
    drag.current = { id: e.pointerId, x0: e.clientX, moved: false, grab: e.clientX - r.left - s.x.value };
    s.lift.set(1, { preset: SPRINGS.lift });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 4) return;
    if (!d.moved) {
      d.moved = true;
      box.current!.setPointerCapture(e.pointerId);
      // Grabbed outside the lens: it comes to the finger.
      const s = springs.current!;
      if (d.grab < 0 || d.grab > s.w.value) d.grab = s.w.value / 2;
    }
    const r = box.current!.getBoundingClientRect();
    const sl = slots();
    const s = springs.current!;
    const minX = sl[0]?.left ?? 0, maxX = (sl[sl.length - 1]?.left ?? 0) + (sl[sl.length - 1]?.width ?? 0) - s.w.value;
    // A little rubber band past the ends.
    let x = e.clientX - r.left - d.grab;
    if (x < minX) x = minX - (1 - 1 / (1 + (minX - x) / 60)) * 12;
    if (x > maxX) x = maxX + (1 - 1 / (1 + (x - maxX) / 60)) * 12;
    s.x.set(x, { preset: { response: 0.12, damping: 0.9 } });
    // The lens takes the width of the segment under its centre.
    const c = x + s.w.value / 2;
    const under = sl.find((q) => c >= q.left && c < q.left + q.width) ?? (c < minX ? sl[0] : sl[sl.length - 1]);
    if (under) s.w.set(under.width, { preset: SPRINGS.slide });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const s = springs.current!;
    let target = valueRef.current;
    const sl = slots();
    if (d.moved) {
      const c = s.x.value + s.w.value / 2;
      let best = sl[0];
      for (const q of sl) if (Math.abs(q.left + q.width / 2 - c) < Math.abs((best?.left ?? 0) + (best?.width ?? 0) / 2 - c)) best = q;
      if (best) target = best.value;
    } else {
      const r = box.current!.getBoundingClientRect();
      const px = e.clientX - r.left;
      const hit = sl.find((q) => px >= q.left && px < q.left + q.width);
      if (hit) target = hit.value;
    }
    goTo(target);
    if (target !== valueRef.current) onChange(target);
    // Lifted while it travels, then it settles into a solid selection.
    settleTimer.current = window.setTimeout(() => s.lift.set(0, { preset: SPRINGS.lift }), d.moved ? 60 : 160);
  };
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const onKey = (e: RKeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = Math.max(0, segments.findIndex((s) => s.value === value));
    const next = segments[(i + d + segments.length) % segments.length]!;
    onChange(next.value);
    box.current?.querySelector<HTMLButtonElement>(`[data-seg="${next.value}"]`)?.focus();
  };

  const tone = useGlass().tone;
  const lensShape = (): ShapeOverride | null => {
    const el = box.current, L = lens.current;
    if (!el || !L || !geo.current.ready) return null;
    const r = el.getBoundingClientRect();
    const s = springs.current!;
    const lift = clamp(s.lift.value, 0, 1.2);
    const w = s.w.value + Math.min(GLASS.lensStretchMax, Math.abs(s.x.velocity) * GLASS.lensStretch), h = geo.current.h;
    const W = w + GLASS.lensGrowX * lift, H = h + GLASS.lensGrowY * lift;
    const cxv = r.left + s.x.value + s.w.value / 2, cyv = r.top + pad + h / 2;
    const l01 = clamp(lift, 0, 1);
    return {
      rect: { x: cxv - W / 2, y: cyv - H / 2, width: W, height: H },
      tint: TONES[tone].tintLens * (1 - l01 * (1 - GLASS.lensClear)),
      frost: lerp(GLASS.frostControl, 0.5, l01),
      magnify: 1 + (GLASS.lensMagnify - 1) * l01,
      bend: 1 + (GLASS.lensBend - 1) * l01,
      lift: 1 + (GLASS.lensLift - 1) * l01,
    };
  };

  const labels = () =>
    segments.map((s) => {
      const sl = slotState.find((q) => q.value === s.value);
      return (
        <span key={s.value} className="absolute top-0 inline-flex h-full items-center justify-center text-[14px] font-semibold whitespace-nowrap text-ink" style={{ left: sl?.left ?? 0, width: sl?.width ?? 0 }}>
          {s.label}
        </span>
      );
    });
  return (
    <Glass
      ref={box}
      ariaRole="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cx('pointer-events-auto relative inline-flex touch-pan-y items-stretch select-none', className)}
      style={{ height, padding: pad }}
      data-testid={testId}
    >
      <div ref={row} className="relative flex">
        {segments.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={s.value === value}
            tabIndex={s.value === value ? 0 : -1}
            data-seg={s.value}
            data-value={s.value}
            onClick={() => s.value !== valueRef.current && onChange(s.value)}
            className={cx('lg-focus inline-flex h-full items-center justify-center rounded-full text-[14px] font-medium whitespace-nowrap text-ink-2', compact ? 'px-3 max-[339px]:px-2' : 'px-[18px]')}
            style={{ minWidth: compact ? 44 : 60 }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <GlassLens ref={lens} shape={lensShape}>
        <div ref={copy} className="lg-lens-copy" style={{ width: 1, height: 1 }}>
          <div className="absolute left-0" style={{ top: pad, height: height - 2 * pad }}>
            {labels()}
          </div>
        </div>
      </GlassLens>
    </Glass>
  );
}

/* ------------------------------------------------------------------ */
/* Popover / menu that flows out of its control                        */
/* ------------------------------------------------------------------ */

export interface PopoverProps extends Omit<GlassProps, 'shape' | 'kind' | 'radius'> {
  open: boolean;
  /** The control it grows out of (and flows back into). */
  anchor: () => HTMLElement | null;
  radius?: number;
  kind?: 'control' | 'text';
  /** Called once it has flowed back and unmounted. */
  onClosed?: () => void;
  /** Reports the settled box (offset geometry) while open, null when closed. */
  onBox?: (b: { left: number; top: number; right: number; bottom: number } | null) => void;
  /** Class of the content wrapper (it fades in over the last part of the morph). */
  bodyClassName?: string;
}

/**
 * A glass panel that grows out of `anchor` (shape, radius, tint and frost
 * follow one spring, with a slight jelly: height trails width a little)
 * and flows back into it on close. Content fades in over the last part.
 * Reduced motion: it fades in place.
 */
export function GlassPopover({ open, anchor, radius = GLASS.radiusPanel, kind = 'text', onClosed, onBox, bodyClassName, className, style, children, ref, ...rest }: PopoverProps) {
  const [mounted, setMounted] = useState(open);
  const el = useRef<HTMLElement | null>(null);
  const merged = useMergedRef(el, ref);
  const inner = useRef<HTMLDivElement>(null);
  const applied = useRef({ dx: 0, dy: 0, sx: 1, sy: 1 });
  const { backend, tone } = useGlass();
  const backendRef = useRef(backend);
  backendRef.current = backend;
  const openRef = useRef(open);
  openRef.current = open;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;

  /** The panel's own box in the viewport, without the morph transform. */
  const natural = (): Rect | null => {
    const e = el.current;
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const a = applied.current;
    return { x: r.left - a.dx, y: r.top - a.dy, width: r.width / a.sx, height: r.height / a.sy };
  };
  const morphRect = (): { rect: Rect; t: number; a: Rect | null } | null => {
    const n = natural();
    if (!n) return null;
    const s = springs.current!;
    const anc = anchorRef.current();
    const a = anc && anc.isConnected ? toRect(anc.getBoundingClientRect()) : null;
    if (!a || s.reduced) return { rect: n, t: 1, a };
    const tx = Math.max(0, s.px.value), ty = Math.max(0, s.py.value);
    return { rect: { x: lerp(a.x, n.x, tx), y: lerp(a.y, n.y, ty), width: lerp(a.width, n.width, tx), height: lerp(a.height, n.height, ty) }, t: tx, a };
  };
  const paint = () => {
    const e = el.current;
    if (!e) return;
    const s = springs.current!;
    const p = s.px.value;
    const fade = s.reduced ? s.fade.value : 1;
    if (inner.current) inner.current.style.opacity = String(s.reduced ? 1 : clamp((p - 0.55) / 0.45, 0, 1));
    e.style.opacity = s.reduced ? String(fade) : '';
    e.style.visibility = (s.reduced ? fade : p) < 0.02 && !openRef.current ? 'hidden' : '';
    if (backendRef.current === 'css' && !s.reduced) {
      // The CSS backend morphs the element itself (transform from its box).
      applied.current = { dx: 0, dy: 0, sx: 1, sy: 1 };
      e.style.transform = '';
      const m = morphRect();
      if (m) {
        const n = natural()!;
        const sx = m.rect.width / n.width, sy = m.rect.height / n.height;
        const dx = m.rect.x - n.x, dy = m.rect.y - n.y;
        applied.current = { dx, dy, sx, sy };
        e.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      }
    } else if (e.style.transform) {
      e.style.transform = '';
      applied.current = { dx: 0, dy: 0, sx: 1, sy: 1 };
    }
    const done = s.reduced ? fade <= 0.001 : p <= 0.001 && s.py.value <= 0.001;
    if (!openRef.current && done && !s.px.moving && !s.py.moving && !s.fade.moving) {
      setMounted(false);
      onClosedRef.current?.();
    }
  };
  const springs = useRef<{ px: Spring; py: Spring; fade: Spring; reduced: boolean } | null>(null);
  if (!springs.current) {
    const p = () => paint();
    springs.current = { px: new Spring(0, SPRINGS.morph, p), py: new Spring(0, { ...SPRINGS.morph, response: SPRINGS.morph.response * 1.12 }, p), fade: new Spring(0, SPRINGS.fade, p), reduced: false };
  }

  useLayoutEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  useLayoutEffect(() => {
    if (!mounted) return;
    const s = springs.current!;
    s.reduced = prefersReducedMotion();
    s.px.set(open ? 1 : 0);
    s.py.set(open ? 1 : 0);
    s.fade.set(open ? 1 : 0, { always: true });
    paint();
    glassRegistry.kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  useLayoutEffect(() => {
    const e = el.current;
    if (!onBox) return;
    if (!e || !open) {
      onBox(null);
      return;
    }
    const report = () => onBox({ left: e.offsetLeft, top: e.offsetTop, right: e.offsetLeft + e.offsetWidth, bottom: e.offsetTop + e.offsetHeight });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(e);
    return () => ro.disconnect();
  }, [open, mounted, onBox]);

  if (!mounted) return null;
  const shape = (): ShapeOverride | null => {
    const s = springs.current!;
    if (s.reduced) return { alpha: s.fade.value, radius };
    const m = morphRect();
    if (!m) return null;
    const t = clamp(m.t, 0, 1.2);
    if (t <= 0.003 && s.py.value <= 0.003) return null;
    const aRad = m.a ? Math.min(m.a.width, m.a.height) / 2 : radius;
    return {
      rect: m.rect,
      radius: lerp(aRad, radius, clamp(t, 0, 1)),
      tint: lerp(TONES[tone].tintControl, kind === 'text' ? TONES[tone].tintText : TONES[tone].tintControl, clamp(t, 0, 1)),
      frost: lerp(GLASS.frostControl, GLASS.frostPanel, clamp(t, 0, 1)),
    };
  };
  return (
    <Glass ref={merged} kind={kind} radius={radius} shape={shape} className={cx('pointer-events-auto', className)} style={style} data-morph="" data-open={open ? '' : undefined} {...rest}>
      <div ref={inner} className={bodyClassName} style={{ opacity: 0 }}>
        {children}
      </div>
    </Glass>
  );
}

/** A menu: a popover with menu semantics; rows separated by inset hairlines. */
export function GlassMenu({ label, children, ...rest }: PopoverProps & { label: string }) {
  return (
    <GlassPopover ariaRole="menu" aria-label={label} kind="text" radius={22} {...rest}>
      <div className="flex flex-col p-1.5">{children}</div>
    </GlassPopover>
  );
}

export function GlassMenuItem({ children, icon, detail, danger, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; detail?: ReactNode; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={cx('lg-plate flex h-10 w-full items-center gap-2.5 rounded-[16px] px-3 text-left text-[14px] font-medium focus-visible:bg-[var(--lg-row-active)] focus-visible:outline-none', danger && 'text-[#c0392b]', className)} {...rest}>
      {icon && <span className="grid size-5 shrink-0 place-items-center text-ink-2">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detail !== undefined && <span className="max-w-[52%] shrink-0 truncate text-[13px] font-normal text-ink-2">{detail}</span>}
    </button>
  );
}

/** An inset hairline between rows or groups of a panel. */
export function GlassSep({ className }: { className?: string }) {
  return <div role="separator" className={cx('lg-sep mx-3 my-1', className)} />;
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

/** A surface that holds body text (the latest exchange): denser tint, radius 26. */
export function GlassTextSurface({ className, children, ...rest }: Omit<GlassProps, 'kind'>) {
  return (
    <Glass kind="text" radius={GLASS.radiusText} className={cx('pointer-events-auto', className)} {...rest}>
      {children}
    </Glass>
  );
}

/** The input capsule (Apple's compose field). `working`: the yellow light travels round its edge. */
export function GlassInputBar({ working, className, children, ref, ...rest }: Omit<GlassProps, 'kind' | 'radius'> & { working?: boolean }) {
  const el = useRef<HTMLElement | null>(null);
  const merged = useMergedRef(el, ref);
  useLayoutEffect(() => {
    const e = el.current;
    if (!e) return;
    const set = () => e.style.setProperty('--d', `${Math.ceil(Math.hypot(e.offsetWidth, e.offsetHeight)) + 4}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(e);
    return () => ro.disconnect();
  }, []);
  return (
    <Glass ref={merged} kind="control" radius={28} className={cx('pointer-events-auto', className)} data-working={working ? '' : undefined} {...rest}>
      <span className="lg-halo" aria-hidden="true" />
      <span className="lg-glow" aria-hidden="true">
        <i />
      </span>
      {children}
    </Glass>
  );
}

/** A small capsule above the input that disappears by itself (the caller times it). */
export function GlassToast({ children, className, ...rest }: Omit<GlassProps, 'kind'>) {
  return (
    <Glass ariaRole="status" className={cx('pointer-events-auto inline-flex h-10 items-center px-4 text-[13px] font-medium', className)} {...rest}>
      {children}
    </Glass>
  );
}

/* ------------------------------------------------------------------ */
/* Inside the glass                                                    */
/* ------------------------------------------------------------------ */

/** Radio chips inside a panel (no box: the chosen one carries a plate). */
export function GlassChoice<T extends string>({ value, onChange, options, label, className, testId }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string; ariaLabel?: string }[]; label: string; className?: string; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: RKeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + d + options.length) % options.length]!;
    onChange(next.value);
    ref.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} onKeyDown={onKey} className={cx('flex gap-0.5', className)} data-testid={testId}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} aria-label={o.ariaLabel} title={o.title} tabIndex={on ? 0 : -1} data-value={o.value} data-on={on ? '' : undefined} onClick={() => onChange(o.value)} className={cx('lg-plate h-8 flex-auto px-1 text-[13px] whitespace-nowrap', on ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A row inside a panel: label, value, optional action. Rows are separated by GlassSep. */
export function GlassRow({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx('lg-plate flex min-h-11 w-full items-center gap-2.5 rounded-[14px] px-3 text-left text-[14.5px] font-medium', className)} {...rest}>
      {children}
    </button>
  );
}

const THUMB_W = 40;
const THUMB_H = 26;
/** A lifted thumb grows by this share (Apple's grows about half again). */
const THUMB_GROW = 0.5;

/**
 * A slider whose thumb is a glass lens: a solid white pill at rest; while
 * dragged it lifts into a clear lens that magnifies the track and settles
 * back on release (2b.4). The native range input stays for keyboard and
 * screen readers.
 */
export function GlassSlider({ min, max, value, onChange, ariaLabel, ariaValueText, idle, className, style, children }: { min: number; max: number; value: number; onChange: (v: number) => void; ariaLabel: string; ariaValueText?: string; idle?: boolean; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const progress = clamp((value - min) / Math.max(1e-6, max - min), 0, 1);
  const progRef = useRef(progress);
  progRef.current = progress;
  const tone = useGlass().tone;
  const paint = useCallback(() => {
    const W = wrap.current, L = lens.current, C = copy.current, R = rail.current;
    if (!W || !L || !C || !R) return;
    const lift = clamp(lifted.current!.value, 0, 1.2);
    const w = W.clientWidth, h = W.clientHeight;
    const cxp = THUMB_W / 2 + progRef.current * (w - THUMB_W);
    const sx = 1 + THUMB_GROW * lift, sy = 1 + THUMB_GROW * lift;
    L.style.left = `${cxp - THUMB_W / 2}px`;
    L.style.top = `${(h - THUMB_H) / 2}px`;
    L.style.width = `${THUMB_W}px`;
    L.style.height = `${THUMB_H}px`;
    L.style.transform = `scale(${sx}, ${sy})`;
    L.style.setProperty('--lg-lift', clamp(lift, 0, 1).toFixed(3));
    const mag = 1 + 0.5 * clamp(lift, 0, 1);
    const kx = mag / sx, ky = mag / sy;
    const CX = cxp, CY = h / 2;
    C.style.transform = `translate(${THUMB_W / 2 - kx * CX}px, ${THUMB_H / 2 - ky * CY}px) scale(${kx}, ${ky})`;
    C.style.opacity = clamp(lift * 1.6, 0, 1).toFixed(3);
    C.style.width = `${w}px`;
    C.style.height = `${h}px`;
    const a = cxp - (THUMB_W * sx) / 2 + 2, b = cxp + (THUMB_W * sx) / 2 - 2;
    const m = `linear-gradient(to right, #000 ${a}px, transparent ${a}px, transparent ${b}px, #000 ${b}px)`;
    R.style.maskImage = m;
    R.style.webkitMaskImage = m;
  }, []);
  const lifted = useRef<Spring | null>(null);
  if (!lifted.current) lifted.current = new Spring(0, SPRINGS.lift, () => paint());
  useLayoutEffect(() => {
    paint();
    glassRegistry.kick();
  });
  useLayoutEffect(() => {
    const W = wrap.current;
    if (!W) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(W);
    return () => ro.disconnect();
  }, [paint]);
  const lift = (on: boolean) => lifted.current!.set(on ? 1 : 0, { preset: SPRINGS.lift });
  const lensShape = (): ShapeOverride | null => {
    const W = wrap.current;
    if (!W) return null;
    const r = W.getBoundingClientRect();
    const l = clamp(lifted.current!.value, 0, 1.2), l01 = clamp(l, 0, 1);
    const cxp = r.left + THUMB_W / 2 + progRef.current * (r.width - THUMB_W);
    const tw = THUMB_W * (1 + THUMB_GROW * l), th = THUMB_H * (1 + THUMB_GROW * l);
    return {
      rect: { x: cxp - tw / 2, y: r.top + r.height / 2 - th / 2, width: tw, height: th },
      // At rest a solid white pill (the tint of a light thumb), lifted clear.
      tint: lerp(tone === 'light' ? 0.96 : TONES.dark.tintText, 0.06, l01),
      frost: lerp(1, 0.4, l01),
      magnify: 1 + 0.5 * l01,
      bend: 1 + 1.2 * l01,
      lift: 1 + 0.4 * l01,
    };
  };
  const fill = `${progress * 100}%`;
  const railInner = (
    <div className="lg-slider-fill" style={{ width: `calc(${THUMB_W / 2}px + (100% - ${THUMB_W}px) * ${progress})`, ...(idle ? { background: 'var(--lg-ink-2)' } : {}) }} />
  );
  return (
    <div ref={wrap} className={cx('lg-slider', className)} style={style} data-fill={fill}>
      <div ref={rail} className="lg-slider-rail">
        {railInner}
      </div>
      <GlassLens ref={lens} shape={lensShape}>
        <div ref={copy} className="lg-lens-copy">
          <div className="lg-slider-rail" style={{ maskImage: 'none' }}>
            {railInner}
          </div>
        </div>
      </GlassLens>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => lift(true)}
        onPointerUp={() => lift(false)}
        onPointerCancel={() => lift(false)}
        onBlur={() => lift(false)}
        aria-label={ariaLabel}
        aria-valuetext={ariaValueText}
      />
      {children}
    </div>
  );
}
