import type { ResolvedHouse } from '@opensu/model';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { Loading } from './Loading';
import type { PlanDrawing } from './plan-data';

/** Smallest room-name size on screen at the fitted zoom (CSS px). */
const MIN_LABEL_PX = { desktop: 12, mobile: 10 };

/** Space kept free for floating chrome when fitting (px from each edge of the plan's box): the top row, the input or the phone's toolbar, an open panel. */
export interface Free {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function fitArea(W: number, H: number, ins: Free) {
  return { ins, aw: Math.max(80, W - ins.left - ins.right), ah: Math.max(80, H - ins.top - ins.bottom) };
}

interface Xf {
  s: number;
  x: number;
  y: number;
}

/** Imperative handle for the zoom buttons that live outside this component. */
export const planCommands: { zoom: (factor: number) => void; fit: () => void } = { zoom: () => {}, fit: () => {} };

let planMod: Promise<typeof import('./plan-data')> | null = null;

export function PlanView({ resolved, levelId, active, insets }: { resolved: ResolvedHouse; levelId: string; active: boolean; insets: Free }) {
  const free = useRef<Free>(insets);
  free.current = insets;
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<PlanDrawing | null>(null);
  const xf = useRef<Xf>({ s: 1, x: 0, y: 0 });
  const fitScale = useRef(1);
  // Viewport size, rounded: the plan's text size follows it.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let alive = true;
    if (import.meta.env.SSR || !size) return;
    void (planMod ??= import('./plan-data')).then((m) => {
      if (!alive) return;
      const { aw, ah } = fitArea(size.w, size.h, free.current);
      const minPx = size.w >= 768 ? MIN_LABEL_PX.desktop : MIN_LABEL_PX.mobile;
      // Phones: no dimension chains or title (unreadable at that size; the level is named in the UI).
      setPlan(m.planForViewport(resolved, levelId, (w, h) => Math.min(aw / w, ah / h), minPx, size.w < 768));
      window.__studio = { ...window.__studio, planReady: true };
    });
    return () => {
      alive = false;
    };
  }, [resolved, levelId, size]);

  const apply = useCallback(() => {
    const el = sheet.current;
    if (!el) return;
    const { s, x, y } = xf.current;
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }, []);

  const fit = useCallback(() => {
    const b = box.current;
    if (!b || !plan) return;
    const { ins, aw, ah } = fitArea(b.clientWidth, b.clientHeight, free.current);
    const s = Math.min(aw / plan.width, ah / plan.height);
    fitScale.current = s;
    xf.current = { s, x: ins.left + (aw - plan.width * s) / 2, y: ins.top + (ah - plan.height * s) / 2 };
    apply();
  }, [plan, apply]);

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

  useLayoutEffect(fit, [fit]);
  // The free area changed (a panel opened, a sheet rose): fit again.
  const key = `${insets.top},${insets.right},${insets.bottom},${insets.left}`;
  useEffect(() => {
    fit();
  }, [key, fit]);

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
    planCommands.fit = fit;
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
      {plan ? (
        <div
          key={levelId}
          ref={sheet}
          data-text-scale={plan.textScale}
          className="absolute top-0 left-0 origin-top-left animate-[fade-in_220ms_ease-out] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          style={{ width: plan.width, height: plan.height }}
          dangerouslySetInnerHTML={{ __html: plan.svg }}
        />
      ) : (
        <Loading label={t('loading')} />
      )}
    </div>
  );
}
