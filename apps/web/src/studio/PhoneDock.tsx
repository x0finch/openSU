// Phone bottom (task 015). From the bottom up: toolbar, input, house.
// Operating a tool opens a bottom sheet that slides up from the bottom edge;
// the toolbar rides on its top edge (outside it), so another tool can be
// picked while it is open; tapping the active tool or dragging the sheet
// down closes it. While a sheet is open the input is hidden (owner's
// decision) and returns when it closes. Pinned, the conversation is a
// half-height sheet with the input inside it. Held sideways the toolbar and
// the input share one row and the sheet stands above the toolbar on the left.
import { type PointerEvent as RPointerEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../components/ui';
import { ChatInput, PinnedChat, RecentStrip } from '../chat/ChatPanel';
import { useStudio } from '../lib/store';
import { Hints } from './chrome';
import type { Derived } from './house-data';
import { PanelBody, Toolbar, useFocusOnOpen, useOpenPanel } from './tools';

/** Slide of the sheet (and of the toolbar riding on it), ms; the house re-frames in step. */
export const SHEET_MS = 320;
const EASE = 'cubic-bezier(0.22, 0.8, 0.24, 1)';
/** Gap between the sheet's top edge and the toolbar riding on it, px. */
const RIDE_GAP = 8;
/** A drag down this far (px), or a quick flick, closes the sheet. */
const CLOSE_DRAG = 70;
/** Width of the sheet when the phone is held sideways, px. */
export const LAND_SHEET = 360;

type SheetKind = 'tool' | 'chat';

/** What the bottom takes from the drawing (CSS px from the bottom / left), in its settled state. */
export interface DockExtent {
  bottom: number;
  left: number;
}

export function PhoneDock({ derived, landscape, onExtent }: { derived: Derived | null; landscape: boolean; onExtent: (e: DockExtent) => void }) {
  const walk = useStudio((s) => s.walk);
  const pinned = useStudio((s) => s.pinned);
  const recent = useStudio((s) => s.recent);
  const panel = useOpenPanel();
  const panelKey = useStudio((s) => (s.sitePanel ? `site-${s.sitePanel.kind}` : `tray-${s.tray}`));
  const want: SheetKind | null = panel ? 'tool' : pinned && !walk ? 'chat' : null;

  const root = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const ride = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);

  /** The kind rendered (kept while the sheet slides away). */
  const [shown, setShown] = useState<SheetKind | null>(want);
  /** The sheet is up (translateY 0). */
  const [up, setUp] = useState(false);
  /** Height of the sheet, px (content fitted, capped). */
  const [height, setHeight] = useState(0);
  /** Frozen markup of the content while it slides away (the store has already moved on). */
  const [ghost, setGhost] = useState<string | null>(null);
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 844 : window.innerHeight));

  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // Open / swap / close.
  useLayoutEffect(() => {
    if (want) {
      setGhost(null);
      setShown(want);
      return;
    }
    if (!shown) return;
    setGhost(content.current?.innerHTML ?? null);
    setUp(false);
    const id = window.setTimeout(() => {
      setShown(null);
      setGhost(null);
    }, SHEET_MS + 40);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  // Fit the sheet to its content (capped at ~45% of the screen; the pinned conversation takes half).
  const cap = landscape ? Math.max(160, vh - 58 - 54 - 12 - RIDE_GAP - 8) : Math.round(vh * (shown === 'chat' ? 0.5 : 0.45));
  useLayoutEffect(() => {
    if (!shown) return;
    if (shown === 'chat') {
      setHeight(cap);
    } else {
      const el = content.current;
      if (!el) return;
      const fit = () => {
        const grab = landscape ? 6 : 20;
        setHeight(Math.min(cap, Math.ceil(el.offsetHeight) + grab));
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [shown, cap, landscape, panelKey]);

  // Slide up on the frame after the height is known.
  useEffect(() => {
    if (!shown || !want || up || !height) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setUp(true)));
    return () => cancelAnimationFrame(id);
  }, [shown, want, up, height]);

  useFocusOnOpen(content, want === 'tool' ? panelKey : null);

  // How far the toolbar rides up: the sheet's height plus the gap, less its own bottom margin.
  const [base, setBase] = useState(12);
  useLayoutEffect(() => {
    const r = root.current, g = ride.current;
    if (!r || !g) return;
    const m = () => setBase(r.clientHeight - (g.offsetTop + g.offsetHeight));
    m();
    const ro = new ResizeObserver(m);
    ro.observe(r);
    return () => ro.disconnect();
  }, [landscape]);
  const open = !!want && up;
  const shift = !landscape && open ? height + RIDE_GAP - base : 0;
  // The input steps aside while a sheet is open and comes back as it slides away.
  const hideInput = !!want;

  // The settled extent at the bottom (what the house must keep clear of).
  const report = useCallback(() => {
    const r = root.current, g = ride.current, tb = toolbar.current;
    if (!r || !g || !tb) return;
    const h = r.clientHeight;
    if (landscape) {
      const row = h - g.offsetTop;
      onExtent(want ? { bottom: row, left: 12 + LAND_SHEET } : { bottom: row, left: 0 });
      return;
    }
    if (want) {
      // Toolbar on the sheet; the input is hidden.
      const sheetH = want === 'chat' ? Math.round(vh * 0.5) : height;
      onExtent({ bottom: sheetH + RIDE_GAP + tb.offsetHeight, left: 0 });
    } else onExtent({ bottom: h - g.offsetTop, left: 0 });
  }, [landscape, want, height, vh, onExtent]);
  useLayoutEffect(() => {
    report();
    const g = ride.current;
    if (!g) return;
    const ro = new ResizeObserver(report);
    ro.observe(g);
    return () => ro.disconnect();
  }, [report]);

  // Drag the sheet down to close it.
  const drag = useRef<{ y: number; t: number; dy: number; id: number } | null>(null);
  const setDrag = (dy: number) => root.current?.style.setProperty('--drag', `${dy}px`);
  const onDown = (e: RPointerEvent<HTMLElement>) => {
    if (e.button > 0 || landscape) return;
    // The handle and the panel's heading area drag; controls keep their own gestures.
    const top = sheet.current?.getBoundingClientRect().top ?? 0;
    if (e.clientY - top > 64 || (e.target as Element).closest('button, input, textarea, a, [role=slider], [role=radio]')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    root.current?.setAttribute('data-dragging', '');
  };
  const onMove = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Upwards it resists (a little give), downwards it follows the finger.
    const raw = e.clientY - d.y;
    d.dy = raw > 0 ? raw : raw / 6;
    setDrag(d.dy);
  };
  const onUp = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    root.current?.removeAttribute('data-dragging');
    const speed = d.dy / Math.max(1, performance.now() - d.t);
    setDrag(0);
    if (d.dy > CLOSE_DRAG || (d.dy > 24 && speed > 0.6)) {
      const s = useStudio.getState();
      if (s.sitePanel || s.tray) s.setTray(null);
      else if (s.pinned) s.setPinned(false);
    }
  };
  const grab = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  const transition = `transform ${SHEET_MS}ms ${EASE}, height ${SHEET_MS}ms ${EASE}`;
  const sheetEl = shown && (
    <section
      ref={sheet}
      aria-label={shown === 'chat' ? undefined : panel ?? undefined}
      className={cx(
        'pointer-events-auto absolute z-30 flex flex-col overflow-hidden bg-white [[data-dragging]_&]:transition-none!',
        landscape ? 'left-3 rounded-[16px] shadow-[0_8px_30px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.05)]' : 'inset-x-0 bottom-0 rounded-t-[18px] shadow-[0_-4px_24px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.05)]',
      )}
      style={{
        height: height || undefined,
        maxHeight: cap,
        width: landscape ? LAND_SHEET : undefined,
        bottom: landscape ? base + (toolbar.current?.offsetHeight ?? 54) + RIDE_GAP : undefined,
        transform: open ? 'translateY(var(--drag, 0px))' : landscape ? `translateY(calc(100% + ${base + 80}px))` : 'translateY(100%)',
        transition,
        visibility: height ? undefined : 'hidden',
      }}
      data-testid="phone-sheet"
      {...grab}
      data-kind={shown}
      data-open={open ? '' : undefined}
    >
      {!landscape && (
        <div className="flex h-5 shrink-0 cursor-grab touch-none items-start justify-center pt-2" data-testid="sheet-grab" aria-hidden="true">
          <span className="h-1 w-9 rounded-full bg-[#d8d8d8]" />
        </div>
      )}
      {shown === 'chat' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {ghost !== null ? <div className="min-h-0 flex-1 overflow-hidden" aria-hidden="true" inert dangerouslySetInnerHTML={{ __html: ghost }} /> : <PinnedChat />}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {ghost !== null ? (
            <div aria-hidden="true" inert dangerouslySetInnerHTML={{ __html: ghost }} />
          ) : (
            <div ref={content} className={cx('flex flex-col gap-3 px-4 pb-[max(16px,env(safe-area-inset-bottom))]', landscape ? 'pt-3.5' : 'pt-1.5')} data-panel="">
              <PanelBody derived={derived} phone />
            </div>
          )}
        </div>
      )}
    </section>
  );

  const above: ReactNode = (
    <>
      {recent && !want && <RecentStrip phone className="absolute inset-x-0 bottom-full mb-2" />}
    </>
  );

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-20" data-testid="phone-dock" style={{ ['--drag' as string]: '0px' }}>
      {sheetEl}
      <div
        ref={ride}
        className={cx('absolute flex gap-2 [[data-dragging]_&]:transition-none!', landscape ? 'items-end' : 'flex-col')}
        style={{
          left: landscape ? 'max(12px, env(safe-area-inset-left))' : 12,
          right: landscape ? 'max(12px, env(safe-area-inset-right))' : 12,
          bottom: 'max(12px, env(safe-area-inset-bottom))',
          transform: shift ? `translateY(calc(var(--drag, 0px) - ${shift}px))` : undefined,
          transition: `transform ${SHEET_MS}ms ${EASE}`,
        }}
        data-testid="dock"
      >
        {landscape ? (
          <>
            <div ref={toolbar} className="w-[360px] shrink-0">
              <Toolbar derived={derived} phone />
            </div>
            <div className={cx('relative flex min-w-0 flex-1 flex-col gap-2 transition-opacity duration-200', hideInput && 'pointer-events-none opacity-0')} inert={hideInput || undefined}>
              {!want && !shown && !walk && <Hints className="max-w-full" />}
              {above}
              {!(pinned && want === 'chat') && <ChatInput phone pinned={pinned} />}
            </div>
          </>
        ) : (
          <>
            {!want && !shown && !walk && (
              <div className="flex justify-center">
                <Hints className="max-w-full" />
              </div>
            )}
            <div className={cx('relative transition-opacity duration-200', hideInput && 'pointer-events-none opacity-0')} inert={hideInput || undefined} data-testid="input-wrap">
              {above}
              {!pinned || walk ? <ChatInput phone pinned={pinned} /> : <div className="h-[50px]" aria-hidden="true" />}
            </div>
            <div ref={toolbar}>
              <Toolbar derived={derived} phone />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
