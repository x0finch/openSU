// Phone bottom (task 015, restyled in task 017 as iOS 26). From the bottom
// up: the tools as a tab-bar glass capsule, the input capsule directly
// above it (like Music's mini player above its tab bar), the house.
// Operating a tool opens an inset glass sheet that grows from the bottom;
// the tool bar rides on top of it, so another tool can be picked while it
// is open; tapping the open tool or dragging the sheet down (or flicking
// it) closes it; it has a fit and a large detent. While a sheet is open the
// input is hidden (owner's decision) and returns when it closes. Pinned,
// the conversation is a half-height sheet with the input inside it. Held
// sideways the tool bar and the input share one row and the sheet stands
// above the tool bar on the left.
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../components/ui';
import { ChatInput, PinnedChat, RecentStrip } from '../chat/ChatPanel';
import { useKeys } from '../chat/keys';
import { useAccount } from '../chat/account';
import { GlassSheet } from '../glass';
import { useStudio } from '../lib/store';
import { Hints } from './chrome';
import { AccountToast } from '../chat/AccountEntry';
import type { Derived } from './house-data';
import { PanelBody, PhoneTools, useFocusOnOpen, useOpenPanel } from './tools';

/** About how long the sheet takes to settle, ms; the house re-frames in step. */
export const SHEET_MS = 420;
/** Gap between the sheet's top edge and the tool bar riding on it, px. */
const RIDE_GAP = 8;
/** Gap of the inset sheet from the screen edges, px. */
const SHEET_GAP = 8;
/**
 * The pinned conversation's sheet: about half the screen (task 015), a
 * little less so the house above keeps the third of the height the
 * renderer needs to frame into the free area.
 */
const CHAT_SHARE = 0.47;
/** Width of the sheet when the phone is held sideways, px. */
export const LAND_SHEET = 360;

type SheetKind = 'tool' | 'chat';

/**
 * What the bottom takes from the drawing (CSS px from the bottom / left), in
 * its settled state: with the open sheet (`bottom`, `left`), and the
 * persistent part alone (`restBottom`, `restLeft`: the tool bar and the
 * input, and the pinned conversation's sheet, which stays; tool sheets and
 * the first-visit hints lie over the drawing, task 021).
 */
export interface DockExtent {
  bottom: number;
  left: number;
  restBottom: number;
  restLeft: number;
}

export function PhoneDock({ derived, landscape, onExtent }: { derived: Derived | null; landscape: boolean; onExtent: (e: DockExtent) => void }) {
  // The sign-in sheet (task 019) or the key sheet (task 022) takes the bottom: the dock steps aside.
  const signInOpen = useAccount((s) => s.open);
  const keySheetOpen = useKeys((s) => !!s.sheet);
  const signing = signInOpen || keySheetOpen;
  const walk = useStudio((s) => s.walk);
  const pinned = useStudio((s) => s.pinned);
  const recent = useStudio((s) => s.recent);
  const panel = useOpenPanel();
  const panelKey = useStudio((s) => (s.sitePanel ? `site-${s.sitePanel.kind}` : `tray-${s.tray}`));
  const want: SheetKind | null = panel ? 'tool' : pinned && !walk ? 'chat' : null;
  /** The kind rendered (kept while the sheet flows away). */
  const [shown, setShown] = useState<SheetKind | null>(want);
  useLayoutEffect(() => {
    if (want) setShown(want);
  }, [want]);

  const root = useRef<HTMLDivElement>(null);
  const ride = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 844 : window.innerHeight));
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  useFocusOnOpen(content, want === 'tool' ? panelKey : null);

  const toolbarH = () => toolbar.current?.offsetHeight ?? 60;
  const inputWrap = useRef<HTMLDivElement>(null);
  /** The input's height, remembered while it is not shown (a pinned conversation holds it). */
  const inputH = useRef(0);
  /** The large detent: up to the header (portrait), or the space above the row (landscape). */
  const large = landscape ? Math.max(160, vh - 58 - 60 - 24 - RIDE_GAP) : Math.max(240, vh - 120 - 60 - RIDE_GAP);

  // The settled extent at the bottom (what the house must keep clear of).
  const settled = useRef(0);
  const report = useCallback(() => {
    const r = root.current, g = ride.current;
    if (!r || !g) return;
    const h = r.clientHeight;
    const foot = h - g.offsetTop - g.offsetHeight;
    inputH.current = inputWrap.current?.offsetHeight || inputH.current;
    if (landscape) {
      const row = h - g.offsetTop;
      const restBottom = foot + Math.max(toolbarH(), inputH.current);
      const restLeft = pinned && !walk ? 12 + LAND_SHEET : 0;
      onExtent(want ? { bottom: row, left: 12 + LAND_SHEET, restBottom, restLeft } : { bottom: row, left: 0, restBottom, restLeft });
      return;
    }
    // The column: hints (gone while a sheet is open), the input, the tool bar; flex gap 8.
    // The pinned conversation's sheet stays, so it is persistent layout too (a tool sheet over it is not).
    const restBottom = pinned && !walk ? SHEET_GAP + Math.round(vh * CHAT_SHARE) + RIDE_GAP + toolbarH() : foot + toolbarH() + 8 + inputH.current;
    if (want) onExtent({ bottom: SHEET_GAP + settled.current + RIDE_GAP + toolbarH(), left: 0, restBottom, restLeft: 0 });
    else onExtent({ bottom: h - g.offsetTop, left: 0, restBottom, restLeft: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landscape, want, onExtent, pinned, walk, vh]);
  useLayoutEffect(() => {
    report();
    const g = ride.current;
    if (!g) return;
    const ro = new ResizeObserver(report);
    ro.observe(g);
    return () => ro.disconnect();
  }, [report]);

  /** The tool bar rides on the sheet, frame by frame. */
  const onHeight = useCallback(
    (h: number, target: number) => {
      const g = ride.current;
      if (g && !landscape) g.style.transform = h > 0.5 ? `translateY(${-(SHEET_GAP + h + RIDE_GAP - 12)}px)` : '';
      if (Math.abs(target - settled.current) > 0.5) {
        settled.current = target;
        report();
      }
    },
    [landscape, report],
  );
  const close = () => {
    const s = useStudio.getState();
    if (s.sitePanel || s.tray) s.setTray(null);
    else if (s.pinned) s.setPinned(false);
  };

  const hideInput = !!want;
  const sheet = shown && (
    <GlassSheet
      open={!!want}
      large={large}
      fixed={shown === 'chat' ? Math.round(vh * CHAT_SHARE) : undefined}
      onClose={close}
      onClosed={() => setShown(null)}
      onHeight={onHeight}
      ariaLabel={shown === 'chat' ? undefined : (panel ?? undefined)}
      testId="phone-sheet"
      dataKind={shown}
      className={landscape ? 'z-30' : 'z-10'}
      style={
        landscape
          ? { left: 'max(12px, env(safe-area-inset-left))', width: LAND_SHEET, bottom: `calc(max(12px, env(safe-area-inset-bottom)) + ${toolbarH() + RIDE_GAP}px)` }
          : { left: SHEET_GAP, right: SHEET_GAP, bottom: `max(${SHEET_GAP}px, env(safe-area-inset-bottom))` }
      }
    >
      {shown === 'chat' ? (
        <div className="flex flex-col" style={{ height: Math.round(vh * CHAT_SHARE) - 22 }}>
          <PinnedChat />
        </div>
      ) : (
        <div ref={content} className="flex flex-col gap-3 px-5 pt-1 pb-5" data-panel="">
          <PanelBody derived={derived} phone />
        </div>
      )}
    </GlassSheet>
  );

  const above: ReactNode = recent && !want ? <RecentStrip phone className="absolute inset-x-0 bottom-full mb-2" /> : null;

  return (
    // The sign-in sheet (task 019) takes the bottom: the dock steps aside, as the input does for a tool sheet.
    <div ref={root} className={cx('pointer-events-none absolute inset-0 z-20 transition-opacity duration-200', signing && 'opacity-0')} inert={signing || undefined} data-testid="phone-dock">
      {sheet}
      <div
        ref={ride}
        className={cx('absolute z-20 flex gap-2', landscape ? 'items-end' : 'flex-col')}
        style={{
          left: landscape ? 'max(12px, env(safe-area-inset-left))' : 12,
          right: landscape ? 'max(12px, env(safe-area-inset-right))' : 12,
          bottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
        data-testid="dock"
      >
        {landscape ? (
          <>
            <div ref={toolbar} className="w-[360px] shrink-0">
              <PhoneTools derived={derived} />
            </div>
            <div className={cx('relative flex min-w-0 flex-1 flex-col gap-2 transition-opacity duration-200', hideInput && 'pointer-events-none opacity-0')} inert={hideInput || undefined}>
              {!want && !shown && !walk && <Hints className="max-w-full" />}
              {above ?? <AccountToast className="absolute inset-x-0 bottom-full mb-2" />}
              {!(pinned && want === 'chat') && (
                <div ref={inputWrap}>
                  <ChatInput phone pinned={pinned} />
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {!want && !shown && !walk && (
              <div className="flex justify-center">
                <Hints className="max-w-full" />
              </div>
            )}
            <div ref={inputWrap} className={cx('relative transition-opacity duration-200', hideInput && 'pointer-events-none opacity-0')} inert={hideInput || undefined} data-testid="input-wrap">
              {above ?? <AccountToast className="absolute inset-x-0 bottom-full mb-2" />}
              {!pinned || walk ? <ChatInput phone pinned={pinned} /> : <div className="h-12" aria-hidden="true" />}
            </div>
            <div ref={toolbar}>
              <PhoneTools derived={derived} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
