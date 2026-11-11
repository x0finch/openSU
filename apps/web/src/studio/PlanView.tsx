import type { ResolvedHouse } from '@opensu/model';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { Loading } from './Loading';
import type { PlanDrawing } from './plan-data';

/** Space kept free for floating chrome when fitting (px). */
const INSETS = {
  desktop: { top: 84, right: 104, bottom: 88, left: 104 },
  mobile: { top: 76, right: 12, bottom: 12, left: 12 },
};

interface Xf {
  s: number;
  x: number;
  y: number;
}

/** Imperative handle for the zoom buttons that live outside this component. */
export const planCommands: { zoom: (factor: number) => void; fit: () => void } = { zoom: () => {}, fit: () => {} };

let planMod: Promise<typeof import('./plan-data')> | null = null;

export function PlanView({ resolved, levelId, active }: { resolved: ResolvedHouse; levelId: string; active: boolean }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<PlanDrawing | null>(null);
  const xf = useRef<Xf>({ s: 1, x: 0, y: 0 });
  const fitScale = useRef(1);

  useEffect(() => {
    let alive = true;
    void (planMod ??= import('./plan-data')).then((m) => {
      if (!alive) return;
      setPlan(m.planDrawing(resolved, levelId));
      window.__studio = { ...window.__studio, planReady: true };
    });
    return () => {
      alive = false;
    };
  }, [resolved, levelId]);

  const apply = useCallback(() => {
    const el = sheet.current;
    if (!el) return;
    const { s, x, y } = xf.current;
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }, []);

  const fit = useCallback(() => {
    const b = box.current;
    if (!b || !plan) return;
    const W = b.clientWidth;
    const H = b.clientHeight;
    const ins = W >= 768 ? INSETS.desktop : INSETS.mobile;
    const aw = Math.max(80, W - ins.left - ins.right);
    const ah = Math.max(80, H - ins.top - ins.bottom);
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

  useEffect(() => {
    const b = box.current;
    if (!b) return;
    let last = { w: b.clientWidth, h: b.clientHeight };
    const ro = new ResizeObserver(() => {
      if (b.clientWidth !== last.w || b.clientHeight !== last.h) {
        last = { w: b.clientWidth, h: b.clientHeight };
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
