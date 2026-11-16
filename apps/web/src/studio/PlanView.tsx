import type { ResolvedHouse } from '@opensu/model';
import type { FrameInsets } from '@opensu/render';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { Loading } from './Loading';
import type { HousePlan, LevelSheet } from './plan-data';
import { framing } from './Viewer3D';

/** Smallest room-name size on screen at the fitted zoom (CSS px). */
const MIN_LABEL_PX = { desktop: 12, mobile: 10 };
/** White kept round the drawn plan inside the free area, CSS px (each side; the free area already keeps clear of the controls). */
const PLAN_MARGIN = { desktop: 16, mobile: 6 };

/** The free area of the plan's box (CSS px from each edge): the same insets the 3D view frames into. */
export type Free = FrameInsets;

interface Xf {
  s: number;
  x: number;
  y: number;
}
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Imperative handle for the zoom buttons that live outside this component. */
export const planCommands: { zoom: (factor: number) => void; fit: () => void } = { zoom: () => {}, fit: () => {} };

let planMod: Promise<typeof import('./plan-data')> | null = null;

/** The plan's re-fit for a persistent layout change (pin / unpin): the 3D view's duration and curve (engine.ts). */
const REFIT_MS = 420;
const REFIT_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';

/**
 * What a level's SVG draws (drawing px): the union of its elements' boxes,
 * the white paper aside. Measured in the page, off screen, once per drawing.
 */
const drawn = new WeakMap<LevelSheet, Box>();
function drawnBox(d: LevelSheet): Box {
  let b = drawn.get(d);
  if (b) return b;
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${d.width}px;height:${d.height}px;visibility:hidden;pointer-events:none`;
  host.innerHTML = d.svg;
  document.body.appendChild(host);
  const svg = host.querySelector('svg');
  b = { x0: 0, y0: 0, x1: d.width, y1: d.height };
  if (svg) {
    const sr = svg.getBoundingClientRect();
    const u = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const ch of svg.children) {
      if (['title', 'defs', 'style'].includes(ch.tagName)) continue;
      const q = ch.getBoundingClientRect();
      if (q.width < 1 && q.height < 1) continue;
      if (q.width >= sr.width - 1 && q.height >= sr.height - 1) continue; // the paper
      u.x0 = Math.min(u.x0, q.left - sr.left);
      u.y0 = Math.min(u.y0, q.top - sr.top);
      u.x1 = Math.max(u.x1, q.right - sr.left);
      u.y1 = Math.max(u.y1, q.bottom - sr.top);
    }
    if (Number.isFinite(u.x0)) b = u;
  }
  host.remove();
  drawn.set(d, b);
  return b;
}

/** The candidate free areas as width, height and offsets for a box of W x H. */
function areaOf(W: number, H: number, i: FrameInsets) {
  return { left: i.left, top: i.top, aw: Math.max(80, W - i.left - i.right), ah: Math.max(80, H - i.top - i.bottom) };
}

/**
 * A house's floor plans, one level shown (task 023). All levels are
 * registered: a model point is on the same pixels on every level, so a
 * level switch only swaps the drawing and never moves, zooms or re-frames
 * it. A fit frames the union of every level's drawing (with its dimension
 * chains and title) in the free area the 3D view uses (`insets`: what is
 * open now; the alternative the 3D view chose when it is one of them, so
 * the plan and the house share one centre point), on a new house, the fit
 * button and a resize. A floating panel opening or closing does not move
 * the plan (task 021); a change of `layoutKey` (the pinned conversation)
 * fits it again, animated.
 */
export function PlanView({ resolved, levelId, active, insets, layoutKey }: { resolved: ResolvedHouse; levelId: string; active: boolean; insets: readonly FrameInsets[]; layoutKey: string }) {
  const free = useRef<readonly FrameInsets[]>(insets);
  free.current = insets;
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<HousePlan | null>(null);
  const xf = useRef<Xf>({ s: 1, x: 0, y: 0 });
  const fitScale = useRef(1);
  // Viewport size, rounded: the plan's text size follows it.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let alive = true;
    if (import.meta.env.SSR || !size) return;
    void (planMod ??= import('./plan-data')).then((m) => {
      if (!alive) return;
      const areas = free.current.map((i) => areaOf(size.w, size.h, i));
      const minPx = size.w >= 768 ? MIN_LABEL_PX.desktop : MIN_LABEL_PX.mobile;
      // Phones: no dimension chains or title (unreadable at that size; the level is named in the UI).
      setPlan(m.housePlan(resolved, (w, h) => Math.max(...areas.map((a) => Math.min(a.aw / w, a.ah / h))), minPx, size.w < 768));
      window.__studio = { ...window.__studio, planReady: true };
    });
    return () => {
      alive = false;
    };
  }, [resolved, size]);

  /** What the levels draw together, in the house frame (drawing px). */
  const union = useMemo<Box | null>(() => {
    if (!plan || typeof document === 'undefined') return null;
    const u = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const d of Object.values(plan.levels)) {
      const b = drawnBox(d);
      u.x0 = Math.min(u.x0, b.x0 + d.ox);
      u.y0 = Math.min(u.y0, b.y0 + d.oy);
      u.x1 = Math.max(u.x1, b.x1 + d.ox);
      u.y1 = Math.max(u.y1, b.y1 + d.oy);
    }
    return Number.isFinite(u.x0) ? u : null;
  }, [plan]);
  const level = plan?.levels[levelId] ?? null;

  const apply = useCallback((animate = false) => {
    const el = sheet.current;
    if (!el) return;
    const { s, x, y } = xf.current;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.style.transition = animate && !reduce ? `transform ${REFIT_MS}ms ${REFIT_EASE}` : '';
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }, []);

  const fit = useCallback(
    (animate = false) => {
      const b = box.current;
      if (!b || !union) return;
      const W = b.clientWidth, H = b.clientHeight;
      const m = W >= 768 ? PLAN_MARGIN.desktop : PLAN_MARGIN.mobile;
      const uw = union.x1 - union.x0, uh = union.y1 - union.y0;
      const list = free.current.length ? free.current : [{ top: 0, right: 0, bottom: 0, left: 0 }];
      // The 3D view's choice when it is one of these (one centre point for both); else the one showing the plan largest.
      const chosen = framing.chosen();
      const same = chosen && list.find((i) => i.top === chosen.top && i.right === chosen.right && i.bottom === chosen.bottom && i.left === chosen.left);
      let best = same ?? list[0]!;
      if (!same) {
        let top = -1;
        for (const i of list) {
          const a = areaOf(W, H, i);
          const k = Math.min((a.aw - 2 * m) / uw, (a.ah - 2 * m) / uh);
          if (k > top + 1e-9) {
            top = k;
            best = i;
          }
        }
      }
      const a = areaOf(W, H, best);
      const s = Math.min(Math.max(20, a.aw - 2 * m) / uw, Math.max(20, a.ah - 2 * m) / uh);
      fitScale.current = s;
      // The union's centre on the free area's centre.
      xf.current = { s, x: a.left + a.aw / 2 - ((union.x0 + union.x1) / 2) * s, y: a.top + a.ah / 2 - ((union.y0 + union.y1) / 2) * s };
      apply(animate);
    },
    [union, apply],
  );

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      const cur = xf.current;
      const s = Math.min(fitScale.current * 8, Math.max(fitScale.current * 0.6, cur.s * factor));
      const k = s / cur.s;
      xf.current = { s, x: px - (px - cur.x) * k, y: py - (py - cur.y) * k };
      apply();
    },
    [apply],
  );

  // A new house (or text size): fit. A level switch keeps the transform.
  useLayoutEffect(() => fit(), [fit]);
  // The transform survives the drawing's swap (the sheet element stays).
  useLayoutEffect(() => apply(), [level, apply]);
  // The persistent layout changed (pin / unpin): fit again, animated. A
  // floating panel opening or closing leaves the plan where it is.
  const fittedLayout = useRef(layoutKey);
  useEffect(() => {
    if (fittedLayout.current === layoutKey) return;
    fittedLayout.current = layoutKey;
    fit(true);
  }, [layoutKey, fit]);

  useEffect(() => {
    const b = box.current;
    if (!b) return;
    let last = { w: b.clientWidth, h: b.clientHeight };
    setSize((cur) => cur ?? { w: last.w, h: last.h });
    const ro = new ResizeObserver(() => {
      if (b.clientWidth !== last.w || b.clientHeight !== last.h) {
        last = { w: b.clientWidth, h: b.clientHeight };
        setSize({ w: last.w, h: last.h });
        fit();
      }
    });
    ro.observe(b);
    planCommands.fit = () => fit();
    planCommands.zoom = (f) => zoomAt(f, b.clientWidth / 2, b.clientHeight / 2);
    return () => ro.disconnect();
  }, [fit, zoomAt]);

  // Pointer pan + pinch, wheel zoom around the cursor.
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; cx: number; cy: number } | null = null;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = b.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const metrics = () => {
      const [a, c] = [...pts.values()];
      return { d: Math.hypot(a!.x - c!.x, a!.y - c!.y), cx: (a!.x + c!.x) / 2, cy: (a!.y + c!.y) / 2 };
    };
    const down = (e: PointerEvent) => {
      b.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (pts.size === 2) pinch = metrics();
      b.dataset.dragging = 'true';
    };
    const move = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 2 && pinch) {
        const m = metrics();
        xf.current.x += m.cx - pinch.cx;
        xf.current.y += m.cy - pinch.cy;
        zoomAt(m.d / pinch.d, m.cx, m.cy);
        pinch = m;
      } else if (pts.size === 1) {
        xf.current.x += p.x - prev.x;
        xf.current.y += p.y - prev.y;
        apply();
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) delete b.dataset.dragging;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
    };
    const dbl = (e: MouseEvent) => {
      const r = b.getBoundingClientRect();
      zoomAt(1.6, e.clientX - r.left, e.clientY - r.top);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('wheel', wheel, { passive: false });
    b.addEventListener('dblclick', dbl);
    return () => {
      b.removeEventListener('pointerdown', down);
      b.removeEventListener('pointermove', move);
      b.removeEventListener('pointerup', up);
      b.removeEventListener('pointercancel', up);
      b.removeEventListener('wheel', wheel);
      b.removeEventListener('dblclick', dbl);
    };
  }, [apply, zoomAt]);

  return (
    <div
      ref={box}
      className="absolute inset-0 touch-none overflow-hidden select-none data-[dragging]:cursor-grabbing cursor-grab"
      aria-hidden={!active}
      data-testid="plan"
    >
      {plan && level ? (
        // The house frame: one transform for every level; the level's drawing sits at its registered offset.
        <div ref={sheet} className="absolute top-0 left-0 size-0 origin-top-left" data-text-scale={plan.textScale}>
          <div
            key={levelId}
            className="absolute animate-[fade-in_220ms_ease-out] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            style={{ left: level.ox, top: level.oy, width: level.width, height: level.height }}
            data-level={levelId}
            data-origin={`${-level.ox},${-level.oy}`}
            dangerouslySetInnerHTML={{ __html: level.svg }}
          />
        </div>
      ) : (
        <Loading label={t('loading')} />
      )}
    </div>
  );
}
