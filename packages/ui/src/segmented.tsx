// Segmented: a radio group in a capsule with a sliding glass lens (the view
// switch; the phone tab bar). The segments are Base UI's RadioGroup and Radio
// (task 031: arrow keys, one tab stop); the tab bar is Base UI's Toolbar
// (task 033: buttons, one tab stop, arrows move along). The lens and its drag
// are ours.
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Toolbar } from '@base-ui/react/toolbar';
import { type ReactNode, type Ref, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx, Glass, GlassLens } from './surface';
import { GLASS } from './material';
import { Spring, SPRINGS } from './spring';
import { clamp } from './util';

export interface Segment<T extends string> {
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
export function Segmented<T extends string>({ value, onChange, segments, label, className, height = 48, compact, testId, variant = 'segments', reselect }: { value: T | null; onChange: (v: T) => void; segments: Segment<T>[]; label: string; className?: string; height?: number; compact?: boolean; testId?: string; variant?: 'segments' | 'tabs'; reselect?: boolean }) {
  const tabs = variant === 'tabs';
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

  const face = (s: Segment<T>, sel: boolean) =>
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
  const items = segments.map((s) => {
    const common = {
      'aria-label': s.ariaLabel,
      disabled: s.disabled,
      'data-seg': s.value,
      'data-value': s.value,
      className: cx(
        'hit lg-focus inline-flex h-full items-center justify-center rounded-full whitespace-nowrap text-ink-2 disabled:opacity-35',
        tabs ? 'min-w-0 flex-1 flex-col gap-0.5 px-1' : cx('text-[14px] font-medium', compact ? 'px-3 max-[339px]:px-2' : 'px-[18px]'),
      ),
      style: tabs ? undefined : { minWidth: compact ? 44 : 60 },
      ...s.props,
    };
    return tabs ? (
      // Pointer activations are handled on release (lens drag); a click with detail 0 is the keyboard.
      <Toolbar.Button key={s.value} type="button" onClick={(e) => e.detail === 0 && (s.value !== valueRef.current || reselect) && onChange(s.value)} {...common}>
        {face(s, false)}
      </Toolbar.Button>
    ) : (
      <Radio.Root key={s.value} value={s.value} disabled={s.disabled} nativeButton render={<button type="button" {...common} />}>
        {face(s, false)}
      </Radio.Root>
    );
  });
  const inner = (
    <>
      <div ref={row} className={cx('relative flex', tabs && 'flex-1')}>
        {items}
      </div>
      <GlassLens ref={lens}>
        <span className="lg-lens-face" />
        <div ref={copy} className="lg-lens-copy" style={{ width: 1, height: 1 }}>
          <div className="absolute left-0" style={{ top: pad, height: height - 2 * pad }}>
            {labels()}
          </div>
        </div>
      </GlassLens>
    </>
  );
  const shell = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    className: cx('pointer-events-auto relative touch-pan-y items-stretch select-none', tabs ? 'flex' : 'inline-flex', className),
    style: { height, padding: pad },
    'data-testid': testId,
  };
  if (tabs) {
    return (
      <Toolbar.Root
        aria-label={label}
        loopFocus
        render={(props) => {
          const { role: _role, ref: r, ...rest } = props as typeof props & { role?: string; ref?: Ref<HTMLElement> };
          return (
            <Glass
              {...rest}
              ref={(el: HTMLElement | null) => {
                box.current = el;
                if (typeof r === 'function') r(el);
                else if (r) (r as { current: HTMLElement | null }).current = el;
              }}
              ariaRole="toolbar"
              {...shell}
            />
          );
        }}
      >
        {inner}
      </Toolbar.Root>
    );
  }
  return (
    <RadioGroup
      value={value}
      // Pointer choices are made on release (the lens drag, above); Base UI's own change is the keyboard's.
      onValueChange={(v, details) => {
        const ev = details.event as Event & { detail?: number };
        if (ev?.type === 'click' && (ev.detail ?? 0) > 0) return;
        if (v !== valueRef.current) onChange(v as T);
      }}
      aria-label={label}
      render={(props) => {
        const { role: _role, ...rest } = props as typeof props & { role?: string };
        return (
          <Glass {...rest} ref={(el: HTMLElement | null) => {
            box.current = el;
            const r = (props as { ref?: Ref<HTMLElement> }).ref;
            if (typeof r === 'function') r(el);
            else if (r) (r as { current: HTMLElement | null }).current = el;
          }} ariaRole="radiogroup" {...shell} />
        );
      }}
    >
      {inner}
    </RadioGroup>
  );
}
