// The anchored glass surface (internal): placed by anchor.ts at the module gap from its control, it grows away from the control and flows back. Popover and Menu are built on it.
import { type CSSProperties, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { coveredBy, type Placement, place, registerFloating } from './anchor';
import { cx, Glass, type GlassProps, useGlass, useMergedRef, usePortalHost } from './surface';
import { GLASS, TONES } from './material';
import { glassRegistry, type Rect, type ShapeOverride } from './registry';
import { prefersReducedMotion, Spring, SPRINGS } from './spring';
import { lerp, clamp, toRect } from './util';

/** The size of an anchored surface; where it stands is the module's job (`anchor`, `placement`). */
type SizeStyle = Pick<CSSProperties, 'width' | 'minWidth' | 'maxWidth' | 'height' | 'minHeight' | 'maxHeight'>;

export interface AnchoredProps extends Omit<GlassProps, 'shape' | 'kind' | 'radius' | 'style' | 'layer'> {
  open: boolean;
  /** The control it stands at. */
  anchor: () => HTMLElement | null;
  /** Side of the anchor and alignment along it (flipped or shifted only to stay on screen). Default below-start. */
  placement?: Placement;
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
 * (`placement`; see anchor.ts; always the module's gap away) that grows out of it with the
 * module's spring and flows back on close. The glass is a rounded
 * rectangle on every frame; its opacity and its content fade in with the
 * shape. Reduced motion: no scale, a short fade. A floating surface is
 * drawn above the chrome layer (it may lie over other glass, a menu over
 * the conversation it was opened from) and, while open, tells the module
 * what it covers (`coveredBy`). It renders in the glass layer's portal
 * host, so no surface around its anchor clips or transforms it.
 */
export function AnchoredSurface({ open, anchor, placement = 'below-start', from, radius = GLASS.radiusPanel, kind = 'text', onClosed, onBox, bodyClassName, className, style, children, ref, ...rest }: AnchoredProps) {
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
  const cfg = useRef({ placement });
  cfg.current = { placement };
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

  /** The side of its anchor the surface stands on (from `place`). */
  const sideRef = useRef<'below' | 'above' | 'left' | 'right'>('below');
  /** Places the surface at its anchor (the only place an anchored surface is positioned). */
  const layout = useCallback(() => {
    const e = el.current;
    const a = anchorRef.current();
    if (!e || !a || !a.isConnected) return;
    // The audit reads which control a surface stands at (task 025).
    (e as HTMLElement & { __anchor?: () => HTMLElement | null }).__anchor = () => anchorRef.current();
    let ar = toRect(a.getBoundingClientRect());
    // The glass surface the anchor sits in (a menu stays inside the pinned conversation when it fits).
    const surface = a.closest<HTMLElement>('.lg');
    const within = surface && surface !== e ? toRect(surface.getBoundingClientRect()) : null;
    // A control inside a bar (a tool of the toolbar, the key picker in the input): the gap is measured from the
    // bar's edge, the alignment from the control (task 029: every surface floats at the gap from its control).
    if (within && surface !== a && surface!.matches('[data-kind=control]') && within.height <= 64) ar = { ...ar, y: within.y, height: within.height };
    // Natural size: only the caller's cap while measuring.
    e.style.maxHeight = cap.current;
    const size = { w: e.offsetWidth, h: e.offsetHeight };
    const p = place(ar, size, cfg.current.placement, { w: innerWidth, h: innerHeight }, within);
    sideRef.current = p.side;
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

  /**
   * The shape on the way (task 029): it opens away from its anchor. It starts as a line on its own edge that faces
   * the anchor (for a surface below: the anchor's lower edge plus the gap), as wide as the control it grows out of,
   * and grows away from the anchor; the close is the reverse. It never crosses the anchor or the bar it sits in.
   */
  const morphRect = (): { rect: Rect; t: number; a: Rect | null } | null => {
    const n = natural();
    if (!n) return null;
    const s = springs.current!;
    const anc = fromRef.current();
    const a = !anc ? null : anc instanceof HTMLElement ? (anc.isConnected ? toRect(anc.getBoundingClientRect()) : null) : anc;
    if (!a || s.reduced) return { rect: n, t: 1, a };
    const side = sideRef.current;
    // The span of the control, kept inside the surface's own span (it grows out of the part that faces the control).
    const sx = clamp(a.x, n.x, n.x + n.width), sw = clamp(a.x + a.width, n.x, n.x + n.width) - sx;
    const sy = clamp(a.y, n.y, n.y + n.height), sh = clamp(a.y + a.height, n.y, n.y + n.height) - sy;
    const start: Rect =
      side === 'below' ? { x: sx, y: n.y, width: sw, height: 0 }
      : side === 'above' ? { x: sx, y: n.y + n.height, width: sw, height: 0 }
      : side === 'right' ? { x: n.x, y: sy, width: 0, height: sh }
      : { x: n.x + n.width, y: sy, width: 0, height: sh };
    const tx = Math.max(0, s.px.value), ty = Math.max(0, s.py.value);
    return { rect: { x: lerp(start.x, n.x, tx), y: lerp(start.y, n.y, ty), width: lerp(start.width, n.width, tx), height: lerp(start.height, n.height, ty) }, t: tx, a };
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
  }, [mounted, layout, placement]);
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
    floatReg.current = registerFloating({ rect: () => placed.current, anchor: () => anchorRef.current(), menu: rest.ariaRole === 'menu' });
    const b = placed.current;
    if (b) onBoxRef.current?.({ left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height });
    return () => {
      floatReg.current?.remove();
      floatReg.current = null;
    };
  }, [open, mounted, rest.ariaRole]);

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
      layer={1}
      className={cx('pointer-events-auto z-50', className)}
      style={{ position: 'fixed', left: 0, top: 0, ...style, maxHeight: undefined }}
      data-morph=""
      data-anchored=""
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
