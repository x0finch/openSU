// Glass primitives the whole studio composes: button group, standalone
// button, segmented control (sliding lens), popover / menu that flows out
// of its control, input bar, text surface, toast, and what sits inside
// glass (plates, rows, separators, choice chips, the lens slider). A
// screen composes these; it never styles glass itself.
import {
  type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type KeyboardEvent as RKeyboardEvent, type ReactNode, type Ref, useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { type Attach, coveredBy, type Placement, place, registerFloating, subscribeFloating } from './anchor';
import { cx, Glass, type GlassProps, GlassLens, useGlass, useMergedRef, usePortalHost } from './Glass';
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
 * A tool inside a group: an icon in a fixed slot, its name as a tooltip
 * below on hover (nothing changes width, nothing moves). A tool in use
 * shows its value in the icon's place (e.g. the sun time). `named`: the
 * name beside the icon (first visit, until the first use). `text`: the
 * button reads as text only (walking: "漫游 ×"). `on`: selected (a plate).
 */
export function GlassGroupButton({ icon, label, reading: value, named, text, on, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; label: string; reading?: string | null; named?: boolean; text?: string; on?: boolean }) {
  return (
    <span className="lg-tipped relative inline-flex">
      <button
        type="button"
        aria-label={value ? `${label}: ${value}` : label}
        data-on={on ? '' : undefined}
        className={cx('lg-plate tnum inline-flex h-9 items-center justify-center gap-1.5 text-[13px] font-semibold whitespace-nowrap', named || text ? 'min-w-11 px-3' : 'w-11', className)}
        {...rest}
      >
        {text ? <span>{text}</span> : value ? <span className="max-w-[42px] truncate tracking-[-0.01em]">{value}</span> : icon}
        {named && !text && <span className="font-medium">{label}</span>}
      </button>
      {!named && !text && <span className="lg-tip" aria-hidden="true">{value ? `${label} ${value}` : label}</span>}
    </span>
  );
}

/** A standalone glass button: circular (icon) or a capsule (icon and label). `tip`: its label as the module's tooltip. */
export function GlassButton({ icon, children, label, size = 48, accent, tip, className, glassClassName, group, ref, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; label?: string; size?: number; accent?: boolean; tip?: boolean; glassClassName?: string; group?: number; ref?: Ref<HTMLButtonElement> }) {
  const round = !children;
  if (tip && label) return <GlassTip label={label}><GlassButton icon={icon} label={label} size={size} accent={accent} className={className} glassClassName={glassClassName} group={group} ref={ref} {...rest}>{children}</GlassButton></GlassTip>;
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
  /** Tab bar: the icon above the label. */
  icon?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  /** Extra attributes of the item's button (test ids, aria-controls...). */
  props?: Record<string, string | boolean | undefined>;
}

/**
 * Radio group in a capsule. The selected segment is a slightly denser lens
 * that slides with a spring; pressed or dragged it lifts into a clear
 * magnifying lens over the labels and settles back on release (2b.2).
 * `variant="tabs"`: the phone tool bar (icon over label, items share the
 * width, buttons rather than radios); `value` may be null (no lens at
 * rest) and `reselect` reports a tap on the selected item too.
 */
export function GlassSegmented<T extends string>({ value, onChange, segments, label, className, height = 48, compact, testId, variant = 'segments', reselect, stepAside }: { value: T | null; onChange: (v: T) => void; segments: GlassSegment<T>[]; label: string; className?: string; height?: number; compact?: boolean; testId?: string; variant?: 'segments' | 'tabs'; reselect?: boolean; stepAside?: boolean }) {
  const tabs = variant === 'tabs';
  const box = useRef<HTMLElement | null>(null);
  const aside = useStepAside(box, !!stepAside);
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
    L.style.opacity = valueRef.current === null ? clamp(lift, 0, 1).toFixed(3) : '';
    // The copy of the labels inside the lens, magnified about its centre.
    const cxL = w / 2, cyL = h / 2, CX = x + cxL, CY = pad + cyL;
    const kx = mag / sx, ky = mag / sy;
    C.style.transform = `translate(${cxL - kx * CX}px, ${cyL - ky * CY}px) scale(${kx}, ${ky})`;
    // The labels under the lens give way to the copy.
    const a = CX - (w * sx) / 2, b = CX + (w * sx) / 2;
    // Nothing selected and the lens at rest: it is gone, and so is the gap it masks (task 023).
    const m = valueRef.current === null && lift < 0.01 ? '' : `linear-gradient(to right, #000 ${a - R.offsetLeft}px, transparent ${a - R.offsetLeft}px, transparent ${b - R.offsetLeft}px, #000 ${b - R.offsetLeft}px)`;
    R.style.maskImage = m;
    R.style.webkitMaskImage = m;
  }, []);
  const springs = useRef<{ x: Spring; w: Spring; lift: Spring } | null>(null);
  if (!springs.current) springs.current = { x: new Spring(0, SPRINGS.slide, () => paint()), w: new Spring(0, SPRINGS.slide, () => paint()), lift: new Spring(0, SPRINGS.lift, () => paint()) };

  const goTo = useCallback((v: T | null, instant = false) => {
    const sl = v === null ? undefined : slots().find((s) => s.value === v);
    if (!sl) {
      // Nothing (or nothing shown) selected: the lens fades out where it is.
      paint();
      return;
    }
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
    // Other segments (the phone tab bar in plan) can keep every size: measure again (task 023).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTo, segments.map((s) => s.value).join('|')]);
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
    const px = e.clientX - r.left;
    const hit = slots().find((q) => px >= q.left && px < q.left + q.width);
    if ((e.target as Element).closest('button:disabled')) return;
    // Nothing selected: the lens appears under the finger.
    if (valueRef.current === null && hit) {
      s.x.set(hit.left, { instant: true });
      s.w.set(hit.width, { instant: true });
    }
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
    let target: T | null = valueRef.current;
    const sl = slots().filter((q) => !row.current?.querySelector<HTMLButtonElement>(`[data-seg="${q.value}"]`)?.disabled);
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
    if (target === null) {
      s.lift.set(0, { preset: SPRINGS.lift });
      return;
    }
    if (target !== valueRef.current) goTo(target);
    if (target !== valueRef.current || reselect) onChange(target);
    // Lifted while it travels, then it settles into a solid selection.
    settleTimer.current = window.setTimeout(() => s.lift.set(0, { preset: SPRINGS.lift }), d.moved ? 60 : 160);
  };
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const onKey = (e: RKeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    if (tabs) {
      // A tool bar: arrows move the focus; Enter or Space opens.
      const items = [...(row.current?.querySelectorAll<HTMLButtonElement>('[data-seg]:not(:disabled)') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + d + items.length) % items.length]?.focus();
      return;
    }
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
    if (valueRef.current === null && lift < 0.01) return null;
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
      alpha: valueRef.current === null ? l01 : 1,
    };
  };

  const face = (s: GlassSegment<T>, sel: boolean) =>
    tabs ? (
      <>
        <span className="grid h-6 place-items-center">{s.icon}</span>
        <span className={cx('max-w-full truncate text-[10.5px] leading-3', sel ? 'font-semibold' : 'font-medium')}>{s.label}</span>
      </>
    ) : (
      s.label
    );
  const labels = () =>
    segments.map((s) => {
      const sl = slotState.find((q) => q.value === s.value);
      return (
        <span key={s.value} className={cx('absolute top-0 inline-flex h-full items-center justify-center whitespace-nowrap text-ink', tabs ? 'flex-col gap-0.5' : 'text-[14px] font-semibold')} style={{ left: sl?.left ?? 0, width: sl?.width ?? 0 }}>
          {face(s, true)}
        </span>
      );
    });
  return (
    <Glass
      ref={box}
      ariaRole={tabs ? 'toolbar' : 'radiogroup'}
      aria-label={label}
      onKeyDown={onKey}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cx('pointer-events-auto relative touch-pan-y items-stretch select-none', tabs ? 'flex' : 'inline-flex', stepAside && 'lg-step-aside', className)}
      style={{ height, padding: pad }}
      inert={aside || undefined}
      data-aside={aside ? '' : undefined}
      data-testid={testId}
    >
      <div ref={row} className={cx('relative flex', tabs && 'flex-1')}>
        {segments.map((s) => (
          <button
            key={s.value}
            type="button"
            role={tabs ? undefined : 'radio'}
            aria-checked={tabs ? undefined : s.value === value}
            aria-label={s.ariaLabel}
            tabIndex={tabs || s.value === value || (value === null && s === segments[0]) ? 0 : -1}
            disabled={s.disabled}
            data-seg={s.value}
            data-value={s.value}
            // Pointer activations are handled on release (lens drag); a click with detail 0 is the keyboard.
            onClick={(e) => e.detail === 0 && (s.value !== valueRef.current || reselect) && onChange(s.value)}
            className={cx(
              'hit lg-focus inline-flex h-full items-center justify-center rounded-full whitespace-nowrap text-ink-2 disabled:opacity-35',
              tabs ? 'min-w-0 flex-1 flex-col gap-0.5 px-1' : cx('text-[14px] font-medium', compact ? 'px-3 max-[339px]:px-2' : 'px-[18px]'),
            )}
            style={tabs ? undefined : { minWidth: compact ? 44 : 60 }}
            {...s.props}
          >
            {face(s, false)}
          </button>
        ))}
      </div>
      <GlassLens ref={lens} shape={lensShape}>
        <span className="lg-lens-face" />
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
/* Anchored surfaces: popover, menu, toolbar panel                     */
/* ------------------------------------------------------------------ */

/** The size of an anchored surface; where it stands is the module's job (`anchor`, `placement`, `attach`). */
type SizeStyle = Pick<CSSProperties, 'width' | 'minWidth' | 'maxWidth' | 'height' | 'minHeight' | 'maxHeight'>;

export interface PopoverProps extends Omit<GlassProps, 'shape' | 'kind' | 'radius' | 'style' | 'layer'> {
  open: boolean;
  /** The control it stands at. */
  anchor: () => HTMLElement | null;
  /** Side of the anchor and alignment along it (flipped or shifted only to stay on screen). Default below-start. */
  placement?: Placement;
  /** `joined`: touches the anchor's glass and merges with it (pass the anchor's `group`); `float`: the module's gap away. Default float. */
  attach?: Attach;
  /** What it grows out of and flows back into, when not the anchor: an element, or the box a control had (a menu row that closed with its menu). */
  from?: () => HTMLElement | Rect | null;
  radius?: number;
  kind?: 'control' | 'text';
  style?: SizeStyle;
  /** Called once it has flowed back and unmounted. */
  onClosed?: () => void;
  /** Reports the box it stands in while open (viewport px), null when closed. */
  onBox?: (b: { left: number; top: number; right: number; bottom: number } | null) => void;
  /** Class of the content wrapper (it fades in with the shape). */
  bodyClassName?: string;
}

/**
 * The one anchored surface (task 025): a glass panel placed at `anchor`
 * (`placement`, `attach`; see anchor.ts) that grows out of it with the
 * module's spring and flows back on close. The glass is a rounded
 * rectangle on every frame; its opacity and its content fade in with the
 * shape. Reduced motion: no scale, a short fade. A floating surface is
 * drawn above the chrome layer (it may lie over other glass, a menu over
 * the conversation it was opened from) and, while open, tells the module
 * what it covers (`coveredBy`). It renders in the glass layer's portal
 * host, so no surface around its anchor clips or transforms it.
 */
export function GlassPopover({ open, anchor, placement = 'below-start', attach = 'float', from, radius = GLASS.radiusPanel, kind = 'text', onClosed, onBox, bodyClassName, className, style, children, ref, ...rest }: PopoverProps) {
  const [mounted, setMounted] = useState(open);
  const el = useRef<HTMLElement | null>(null);
  const merged = useMergedRef(el, ref);
  const inner = useRef<HTMLDivElement>(null);
  const applied = useRef({ dx: 0, dy: 0, sx: 1, sy: 1 });
  const placed = useRef<Rect | null>(null);
  const host = usePortalHost();
  const { backend, tone } = useGlass();
  const backendRef = useRef(backend);
  backendRef.current = backend;
  const openRef = useRef(open);
  openRef.current = open;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const fromRef = useRef<() => HTMLElement | Rect | null>(from ?? anchor);
  fromRef.current = from ?? anchor;
  const onBoxRef = useRef(onBox);
  onBoxRef.current = onBox;
  const cfg = useRef({ placement, attach });
  cfg.current = { placement, attach };
  const cap = useRef('');
  cap.current = style?.maxHeight === undefined ? '' : typeof style.maxHeight === 'number' ? `${style.maxHeight}px` : String(style.maxHeight);

  /** The panel's own box in the viewport, without the morph transform. */
  const natural = (): Rect | null => {
    const e = el.current;
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const a = applied.current;
    return { x: r.left - a.dx, y: r.top - a.dy, width: r.width / a.sx, height: r.height / a.sy };
  };

  /** Places the surface at its anchor (the only place an anchored surface is positioned). */
  const layout = useCallback(() => {
    const e = el.current;
    const a = anchorRef.current();
    if (!e || !a || !a.isConnected) return;
    // The audit reads which control a surface stands at (task 025).
    (e as HTMLElement & { __anchor?: () => HTMLElement | null }).__anchor = () => anchorRef.current();
    const ar = toRect(a.getBoundingClientRect());
    // The glass surface the anchor sits in (a menu stays inside the pinned conversation when it fits).
    const surface = a.closest<HTMLElement>('.lg');
    const within = surface && surface !== e ? toRect(surface.getBoundingClientRect()) : null;
    // Natural size: only the caller's cap while measuring.
    e.style.maxHeight = cap.current;
    const size = { w: e.offsetWidth, h: e.offsetHeight };
    const p = place(ar, size, cfg.current.placement, cfg.current.attach, { w: innerWidth, h: innerHeight }, within);
    e.style.left = `${Math.round(p.x)}px`;
    e.style.top = `${Math.round(p.y)}px`;
    // The room on its side, and the caller's own cap (what it keeps clear of further on).
    e.style.maxHeight = cap.current ? `min(${cap.current}, ${Math.floor(p.maxHeight)}px)` : `${Math.floor(p.maxHeight)}px`;
    const h = Math.min(size.h, p.maxHeight);
    const box = { x: Math.round(p.x), y: Math.round(p.y), width: size.w, height: h };
    const prev = placed.current;
    placed.current = box;
    if (openRef.current && onBoxRef.current && (!prev || prev.x !== box.x || prev.y !== box.y || prev.width !== box.width || prev.height !== box.height)) onBoxRef.current({ left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height });
    floatReg.current?.update();
  }, []);
  const floatReg = useRef<ReturnType<typeof registerFloating> | null>(null);

  const progress = () => {
    const s = springs.current!;
    return s.reduced ? 1 : clamp(Math.max(0, s.px.value), 0, 1);
  };
  /** Glass opacity and content opacity: both follow the shape from the first frame. */
  const glassAlpha = () => (springs.current!.reduced ? springs.current!.fade.value : clamp(progress() / 0.35, 0, 1));
  const contentAlpha = () => (springs.current!.reduced ? 1 : clamp((progress() - 0.05) / 0.45, 0, 1));

  const morphRect = (): { rect: Rect; t: number; a: Rect | null } | null => {
    const n = natural();
    if (!n) return null;
    const s = springs.current!;
    const anc = fromRef.current();
    const a = !anc ? null : anc instanceof HTMLElement ? (anc.isConnected ? toRect(anc.getBoundingClientRect()) : null) : anc;
    if (!a || s.reduced) return { rect: n, t: 1, a };
    const tx = Math.max(0, s.px.value), ty = Math.max(0, s.py.value);
    return { rect: { x: lerp(a.x, n.x, tx), y: lerp(a.y, n.y, ty), width: lerp(a.width, n.width, tx), height: lerp(a.height, n.height, ty) }, t: tx, a };
  };
  const paint = () => {
    const e = el.current;
    if (!e) return;
    const s = springs.current!;
    const p = s.px.value;
    if (inner.current) inner.current.style.opacity = contentAlpha().toFixed(3);
    const css = backendRef.current === 'css';
    // The CSS backend fades the element (its glass and content); WebGL fades the shape it draws.
    e.style.opacity = s.reduced || css ? glassAlpha().toFixed(3) : '';
    e.style.visibility = (s.reduced ? s.fade.value : p) < 0.02 && !openRef.current ? 'hidden' : '';
    if (css && !s.reduced) {
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
        // The corners scale with the box: keep them round (the radius in the box's own units).
        e.style.borderRadius = sx > 0.01 && sy > 0.01 ? `${(radiusAt(m) / sx).toFixed(2)}px / ${(radiusAt(m) / sy).toFixed(2)}px` : '';
      } else e.style.borderRadius = '';
    } else {
      if (e.style.transform) {
        e.style.transform = '';
        e.style.borderRadius = '';
        applied.current = { dx: 0, dy: 0, sx: 1, sy: 1 };
      }
      // WebGL draws the morphing shape; the content stays clipped inside it.
      const m = !s.reduced ? morphRect() : null;
      const n = m && natural();
      if (m && n) {
        const top = Math.max(0, m.rect.y - n.y), left = Math.max(0, m.rect.x - n.x);
        const right = Math.max(0, n.x + n.width - (m.rect.x + m.rect.width)), bottom = Math.max(0, n.y + n.height - (m.rect.y + m.rect.height));
        if (top + left + right + bottom > 0.5) e.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${radiusAt(m)}px)`;
        else if (e.style.clipPath) e.style.clipPath = '';
      } else if (e.style.clipPath) e.style.clipPath = '';
    }
    const done = s.reduced ? s.fade.value <= 0.001 : p <= 0.001 && s.py.value <= 0.001;
    if (!openRef.current && done && !s.px.moving && !s.py.moving && !s.fade.moving) {
      setMounted(false);
      onClosedRef.current?.();
    }
  };
  /** The radius on the way: from the anchor's round ends to the panel's radius, never more than half the short side. */
  const radiusAt = (m: { rect: Rect; t: number; a: Rect | null }) => {
    const aRad = m.a ? Math.min(m.a.width, m.a.height) / 2 : radius;
    return Math.min(lerp(aRad, radius, clamp(m.t, 0, 1)), m.rect.width / 2, m.rect.height / 2);
  };
  const springs = useRef<{ px: Spring; py: Spring; fade: Spring; reduced: boolean } | null>(null);
  if (!springs.current) {
    const p = () => paint();
    springs.current = { px: new Spring(0, SPRINGS.morph, p), py: new Spring(0, { ...SPRINGS.morph, response: SPRINGS.morph.response * 1.12 }, p), fade: new Spring(0, SPRINGS.fade, p), reduced: false };
  }

  useLayoutEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  // Stands at its anchor: placed now, again when it, its anchor or the window changes.
  useLayoutEffect(() => {
    const e = el.current;
    if (!mounted || !e) return;
    layout();
    const ro = new ResizeObserver(() => layout());
    ro.observe(e);
    const a = anchorRef.current();
    if (a) ro.observe(a);
    window.addEventListener('resize', layout);
    window.addEventListener('scroll', layout, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', layout);
      window.removeEventListener('scroll', layout, true);
    };
  }, [mounted, layout, placement, attach]);
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
  // While open: what it covers (the one rule for what lies under a surface), and its box.
  useLayoutEffect(() => {
    if (!open || !mounted) {
      if (!open) onBoxRef.current?.(null);
      return;
    }
    if (attach === 'float') floatReg.current = registerFloating({ rect: () => placed.current, anchor: () => anchorRef.current(), menu: rest.ariaRole === 'menu' });
    const b = placed.current;
    if (b) onBoxRef.current?.({ left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height });
    return () => {
      floatReg.current?.remove();
      floatReg.current = null;
    };
  }, [open, mounted, attach, rest.ariaRole]);

  if (!mounted) return null;
  const shape = (): ShapeOverride | null => {
    const s = springs.current!;
    if (s.reduced) return { radius, alpha: s.fade.value };
    const m = morphRect();
    if (!m) return null;
    const t = clamp(m.t, 0, 1.2);
    if (t <= 0.003 && s.py.value <= 0.003) return null;
    return {
      rect: m.rect,
      radius: radiusAt(m),
      tint: lerp(TONES[tone].tintControl, kind === 'text' ? TONES[tone].tintText : TONES[tone].tintControl, clamp(t, 0, 1)),
      frost: lerp(GLASS.frostControl, GLASS.frostPanel, clamp(t, 0, 1)),
      alpha: glassAlpha(),
    };
  };
  const surface = (
    <Glass
      ref={merged}
      kind={kind}
      radius={radius}
      shape={shape}
      layer={attach === 'float' ? 1 : 0}
      className={cx('pointer-events-auto z-50', className)}
      style={{ position: 'fixed', left: 0, top: 0, ...style, maxHeight: undefined }}
      data-morph=""
      data-anchored=""
      data-attach={attach}
      data-placement={placement}
      data-open={open ? '' : undefined}
      {...rest}
    >
      <div ref={inner} className={bodyClassName} style={{ opacity: 0 }}>
        {children}
      </div>
    </Glass>
  );
  return host ? createPortal(surface, host) : surface;
}

/**
 * Touch scrubbing (2b.3): while a finger is down (also the press that
 * opened the menu), the row under it is highlighted; lifting the finger on
 * a row after moving selects it.
 */
function useMenuScrub(open: boolean, menu: { current: HTMLElement | null }): void {
  useEffect(() => {
    if (!open) return;
    let active: number | null = null;
    let start = { x: 0, y: 0 };
    let moved = false;
    let lit: HTMLElement | null = null;
    const light = (el: HTMLElement | null) => {
      if (lit === el) return;
      lit?.removeAttribute('data-scrub');
      lit = el;
      lit?.setAttribute('data-scrub', '');
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      active = e.pointerId;
      start = { x: e.clientX, y: e.clientY };
      moved = false;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (active === null) {
        // The press that opened the menu is still down: adopt it.
        active = e.pointerId;
        start = { x: e.clientX, y: e.clientY };
      }
      if (e.pointerId !== active) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) moved = true;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const hit = under?.closest<HTMLElement>('[role=menuitem]') ?? null;
      // Over a gap between rows (a separator) the last row stays lit; outside the menu nothing is.
      if (hit && menu.current?.contains(hit)) light(hit);
      else if (!under || !menu.current?.contains(under)) light(null);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = null;
      const hit = lit;
      light(null);
      if (moved && hit) {
        e.preventDefault();
        hit.click();
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      light(null);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, [open, menu]);
}

/** A menu: a popover with menu semantics; rows separated by inset hairlines; touch scrubbing. */
export function GlassMenu({ label, children, ref, ...rest }: PopoverProps & { label: string }) {
  const el = useRef<HTMLElement | null>(null);
  const merged = useMergedRef(el, ref);
  useMenuScrub(rest.open, el);
  return (
    <GlassPopover ref={merged} ariaRole="menu" aria-label={label} kind="text" radius={22} {...rest} className={cx('touch-none', rest.className)}>
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

/**
 * A surface that holds body text (the latest exchange, the pinned
 * conversation): denser tint, radius 26. `stepAside`: it fades out and is
 * inert while a floating surface lies over it (the module's one rule for
 * what is under an open surface, anchor.ts `coveredBy`).
 */
/** True while a floating surface lies over `el` (the module's step-aside rule, anchor.ts `coveredBy`). */
function useStepAside(el: { current: HTMLElement | null }, on: boolean): boolean {
  const [aside, setAside] = useState(false);
  useEffect(() => {
    if (!on) return setAside(false);
    const check = () => setAside(!!el.current && coveredBy(el.current));
    check();
    return subscribeFloating(check);
  }, [on, el]);
  return aside;
}

export function GlassTextSurface({ className, children, stepAside, ref, ...rest }: Omit<GlassProps, 'kind'> & { stepAside?: boolean }) {
  const el = useRef<HTMLElement | null>(null);
  const merged = useMergedRef(el, ref);
  const aside = useStepAside(el, !!stepAside);
  return (
    <Glass ref={merged} kind="text" radius={GLASS.radiusText} className={cx('pointer-events-auto', stepAside && 'lg-step-aside', className)} inert={aside || undefined} data-aside={aside ? '' : undefined} {...rest}>
      {children}
    </Glass>
  );
}

/**
 * When a tooltip may show (task 026): on hover, once the pointer has moved
 * over its control (`data-tip-hover`), and on keyboard focus, when focus
 * arrived by Tab or an arrow key (`data-tip-focus`). Focus the code moves
 * there (a surface closing returns focus to its button) shows nothing, nor
 * does a control that appears under a resting pointer. One set of listeners
 * for every `.lg-tipped`; glass.css reads the two attributes.
 */
function installTipIntent(): void {
  if (typeof document === 'undefined' || (document as Document & { __lgTips?: boolean }).__lgTips) return;
  (document as Document & { __lgTips?: boolean }).__lgTips = true;
  let navKeyAt = -1e9;
  let hovered: Element | null = null;
  const tipped = (t: EventTarget | null) => (t instanceof Element ? t.closest('.lg-tipped') : null);
  const setHover = (el: Element | null) => {
    if (el === hovered) return;
    hovered?.removeAttribute('data-tip-hover');
    hovered = el;
    el?.setAttribute('data-tip-hover', '');
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) navKeyAt = performance.now();
  }, true);
  document.addEventListener('focusin', (e) => {
    const el = tipped(e.target);
    if (el && performance.now() - navKeyAt < 400) el.setAttribute('data-tip-focus', '');
  }, true);
  document.addEventListener('focusout', (e) => tipped(e.target)?.removeAttribute('data-tip-focus'), true);
  document.addEventListener('pointermove', (e) => setHover(e.pointerType === 'mouse' ? tipped(e.target) : null), { capture: true, passive: true });
  document.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget || !hovered?.contains(e.relatedTarget as Node)) setHover(null);
  }, true);
}
installTipIntent();

/**
 * The one tooltip (task 025): the name of a control, below it, after one
 * delay, on its own plate and ink (readable on paper, on glass and inside
 * dark panels: it never takes the panel's ink). Visual only: the control
 * keeps its own accessible name.
 */
export function GlassTip({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cx('lg-tipped relative inline-flex', className)}>
      {children}
      <span className="lg-tip" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}

/**
 * A round icon button inside glass (a header's new conversation, a panel's
 * close): the module's plate, a circle of the row's height.
 */
export function GlassIconButton({ label, size = 32, tip = true, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: number; tip?: boolean }) {
  const btn = (
    <button type="button" aria-label={label} className={cx('hit lg-plate grid shrink-0 place-items-center text-ink-2 hover:text-ink', className)} style={{ width: size, height: size }} {...rest}>
      {children}
    </button>
  );
  return tip ? <GlassTip label={label}>{btn}</GlassTip> : btn;
}

/** The input capsule (Apple's compose field). `working`: the yellow light travels round its edge. */
export function GlassInputBar({ working, radius = 28, className, children, ref, ...rest }: Omit<GlassProps, 'kind' | 'radius'> & { working?: boolean; radius?: number }) {
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
    <Glass ref={merged} kind="control" radius={radius} className={cx('pointer-events-auto', className)} data-working={working ? '' : undefined} {...rest}>
      <span className="lg-halo" aria-hidden="true" />
      <span className="lg-glow" aria-hidden="true">
        <i />
      </span>
      {children}
    </Glass>
  );
}

/**
 * The compose field inside a glass surface (the pinned conversation): a
 * field of that surface, not a second glass (`.lg-field`: a quiet well,
 * no shadow). `radius`: concentric with the surface corner it sits in;
 * with one line it is a capsule. `working`: the same yellow light round
 * its edge as the input capsule.
 */
export function GlassField({ working, radius, plain, className, style, children, ref, ...rest }: Omit<HTMLAttributes<HTMLDivElement>, 'ref'> & { working?: boolean; radius: number; plain?: boolean; ref?: Ref<HTMLDivElement> }) {
  const el = useRef<HTMLDivElement | null>(null);
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
    <div ref={merged} className={cx('lg-field relative', className)} style={{ borderRadius: radius, ...style }} data-working={working ? '' : undefined} data-plain={plain ? '' : undefined} {...rest}>
      <span className="lg-halo" aria-hidden="true" />
      <span className="lg-glow" aria-hidden="true">
        <i />
      </span>
      {children}
    </div>
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
      // At rest the thumb's solid face (DOM) covers it; lifted it is clear glass.
      tint: lerp(TONES[tone].tintControl, 0.06, l01),
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
        <span className="lg-lens-face" />
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

/* ------------------------------------------------------------------ */
/* Phone sheet                                                         */
/* ------------------------------------------------------------------ */

const SHEET_GRAB = 22;

/**
 * An inset glass sheet (radius 34, a small gap from the screen edges) that
 * grows from the bottom (2b.5). Two detents: fit (its content, capped) and
 * large; drag it with velocity, it rubber-bands past large, and a flick
 * down or a drag below half the fit height dismisses it (`onClose`). The
 * sheet spring has no bounce. `onHeight` reports the height every frame
 * (what rides on top of it follows). `fixed`: a fixed fit height instead
 * of the content's (the pinned conversation).
 */
export function GlassSheet({ open, large, fixed, onClose, onClosed, onHeight, className, style, children, testId, ariaLabel, dataKind }: {
  open: boolean;
  large: number;
  fixed?: number;
  onClose: () => void;
  onClosed?: () => void;
  onHeight?: (h: number, target: number) => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  testId?: string;
  ariaLabel?: string;
  /** What the sheet holds (`data-sheet`; not `data-kind`, which is the glass role and picks the tint). */
  dataKind?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const el = useRef<HTMLElement | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const detent = useRef<'fit' | 'large'>('fit');
  const openRef = useRef(open);
  openRef.current = open;
  const cb = useRef({ onHeight, onClosed, onClose });
  cb.current = { onHeight, onClosed, onClose };
  const fitOf = () => Math.min(large, fixed ?? (content.current ? Math.ceil(content.current.offsetHeight) + SHEET_GRAB : 200));
  const target = useRef(0);
  const paint = () => {
    const e = el.current;
    const h = Math.max(0, spring.current!.value);
    if (e) {
      e.style.height = `${h}px`;
      e.style.visibility = h < 1 ? 'hidden' : '';
    }
    if (body.current) {
      const scroll = detent.current === 'large' && !drag.current;
      body.current.style.overflowY = scroll ? 'auto' : 'hidden';
      body.current.style.touchAction = scroll ? 'pan-y' : 'none';
    }
    cb.current.onHeight?.(h, target.current);
    if (!openRef.current && h <= 0.5 && !spring.current!.moving && !drag.current) {
      setMounted(false);
      cb.current.onClosed?.();
    }
  };
  const spring = useRef<Spring | null>(null);
  if (!spring.current) spring.current = new Spring(0, SPRINGS.sheet, () => paint());
  const go = (h: number, velocity?: number) => {
    target.current = h;
    spring.current!.set(h, { preset: SPRINGS.sheet, velocity, always: true });
    if (prefersReducedMotion()) spring.current!.set(h, { instant: true });
  };

  useLayoutEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  useLayoutEffect(() => {
    if (!mounted) return;
    if (open) {
      detent.current = 'fit';
      go(fitOf());
    } else go(0);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted, fixed, large]);
  // New content (another tool): the fit detent follows it.
  useLayoutEffect(() => {
    const c = content.current;
    if (!c || !mounted) return;
    const ro = new ResizeObserver(() => {
      if (openRef.current && !drag.current && detent.current === 'fit') go(fitOf());
    });
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, fixed, large]);

  const drag = useRef<{ id: number; y: number; h0: number; t: number; v: number; lastY: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button > 0) return;
    const t = e.target as Element;
    const top = el.current!.getBoundingClientRect().top;
    // The grabber and the top strip drag (a button there, such as a sheet's close, keeps its tap: capturing
    // the pointer would send the click to the sheet); elsewhere controls keep their gestures and a scrolled list scrolls.
    if (e.clientY - top <= 56 && t.closest('button, a')) return;
    if (e.clientY - top > 56 && (t.closest('button, input, textarea, a, select, [role=slider], [role=radio], [contenteditable]') || (body.current?.scrollTop ?? 0) > 0)) return;
    if (e.clientY - top > 56 && detent.current === 'large') return;
    drag.current = { id: e.pointerId, y: e.clientY, h0: spring.current!.value, t: performance.now(), v: 0, lastY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    el.current?.setAttribute('data-dragging', '');
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.t) / 1000;
    // Velocity of the height (up = positive), smoothed.
    d.v = d.v * 0.6 + (((d.lastY - e.clientY) / dt) * 0.4);
    d.t = now;
    d.lastY = e.clientY;
    let h = d.h0 - (e.clientY - d.y);
    // Rubber band past the large detent.
    if (h > large) h = large + (1 - 1 / (1 + (h - large) / 220)) * 70;
    spring.current!.set(Math.max(0, h), { instant: true });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    el.current?.removeAttribute('data-dragging');
    const h = spring.current!.value;
    const fit = fitOf();
    const projected = h + d.v * 0.18;
    if (Math.abs(h - d.h0) < 3) {
      go(detent.current === 'large' ? large : fit);
      return;
    }
    if (d.v < -900 || projected < fit * 0.5) {
      cb.current.onClose();
      return;
    }
    detent.current = Math.abs(projected - large) < Math.abs(projected - fit) ? 'large' : 'fit';
    go(detent.current === 'large' ? large : fit, d.v);
  };

  if (!mounted) return null;
  return (
    <Glass
      ref={el}
      as="section"
      kind="text"
      radius={34}
      aria-label={ariaLabel}
      className={cx('pointer-events-auto absolute flex flex-col overflow-hidden', className)}
      style={{ height: 0, ...style }}
      data-testid={testId}
      data-sheet={dataKind}
      data-open={open ? '' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="flex h-[22px] shrink-0 cursor-grab touch-none items-start justify-center pt-2" data-testid="sheet-grab" aria-hidden="true">
        <span className="h-[5px] w-9 rounded-full bg-[var(--lg-ink-2)] opacity-50" />
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-hidden overscroll-contain">
        <div ref={content}>{children}</div>
      </div>
    </Glass>
  );
}
