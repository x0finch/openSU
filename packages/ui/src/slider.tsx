// Slider: a rail with a yellow fill and a glass thumb that lifts while dragged,
// on Base UI's Slider (task 031: its value, pointer and keyboard handling and
// the range input screen readers use; the lens is drawn here).
import { Slider as BaseSlider } from '@base-ui/react/slider';
import { type CSSProperties, type ReactNode, useCallback, useLayoutEffect, useRef } from 'react';
import { cx, GlassLens, useGlass } from './surface';
import { TONES } from './material';
import { glassRegistry, type ShapeOverride } from './registry';
import { Spring, SPRINGS } from './spring';
import { lerp, clamp } from './util';

const THUMB_W = 40;
const THUMB_H = 26;
/** A lifted thumb grows by this share (Apple's grows about half again). */
const THUMB_GROW = 0.5;

/**
 * A slider whose thumb is a glass lens: a solid white pill at rest; while
 * dragged it lifts into a clear lens that magnifies the track and settles
 * back on release (2b.4). Base UI's thumb (its range input) is the focus
 * and the keyboard; the visible thumb is the lens.
 */
export function Slider({ min, max, value, onChange, ariaLabel, ariaValueText, idle, className, style, children }: { min: number; max: number; value: number; onChange: (v: number) => void; ariaLabel: string; ariaValueText?: string; idle?: boolean; className?: string; style?: CSSProperties; children?: ReactNode }) {
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
    <BaseSlider.Root
      value={value}
      onValueChange={(v) => onChange(Array.isArray(v) ? v[0]! : v)}
      min={min}
      max={max}
      step={1}
      thumbAlignment="edge"
      className={cx('lg-slider', className)}
      style={style}
      data-slot="slider"
      data-fill={fill}
    >
      <BaseSlider.Control
        ref={wrap}
        className="absolute inset-0"
        onPointerDown={() => {
          lift(true);
          const up = () => {
            lift(false);
            window.removeEventListener('pointerup', up, true);
            window.removeEventListener('pointercancel', up, true);
          };
          window.addEventListener('pointerup', up, true);
          window.addEventListener('pointercancel', up, true);
        }}
      >
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
        <BaseSlider.Thumb className="lg-slider-thumb" aria-label={ariaLabel} getAriaValueText={ariaValueText === undefined ? undefined : () => ariaValueText} onBlur={() => lift(false)} />
      </BaseSlider.Control>
      {children}
    </BaseSlider.Root>
  );
}
