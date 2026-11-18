// Sheet: the phone form of a surface, an inset glass sheet with a grabber and detents.
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { cx, Glass } from './surface';
import { prefersReducedMotion, Spring, SPRINGS } from './spring';

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
export function Sheet({ open, large, fixed, onClose, onClosed, onHeight, className, style, children, testId, ariaLabel, dataKind }: {
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
