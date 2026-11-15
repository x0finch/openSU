// The studio layout the owner chose (task 015). The house is never covered
// or squeezed by controls (only the translucent recent strip, opened on
// purpose, may lie over it). Desktop: house name top-left, 3D / 平面 / 图册
// top centre, the toolbar top-right with its panel hanging under it, one
// input bottom centre. Phone: name and mode on one row; at the bottom the
// toolbar, the input, and the sheets (PhoneDock). The 3D canvas keeps its
// size. Floating panels lie over the drawing and never move the house
// (task 021); a framing the user asks for (a view, fit, a level, a new
// house) uses what they leave free, and only the pinned conversation, which
// stays, moves the house once.
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FrameInsets } from '@opensu/render';
import { cx } from '../components/ui';
import { useT } from '../lib/i18n';
import { ChatInput, PinnedColumn, RecentStrip, SettingsHost } from '../chat/ChatPanel';
import { closeSignIn, restoreDraftAfterRedirect, useAccount } from '../chat/account';
import { SignInHost } from '../chat/SignIn';
import { KeySheetHost } from '../chat/KeyPicker';
import { closeKeySheet, useKeys } from '../chat/keys';
import { useChat } from '../chat/chat-store';
import { useAutosave } from '../lib/autosave';
import { restoreLang, useStudio } from '../lib/store';
import { applyParams, useUrlState } from '../lib/url-state';
import { Hints, ModeSwitch, TitleMenu, useSunPlayer } from './chrome';
import type { Derived } from './house-data';
import { Loading } from './Loading';
import { type DockExtent, PhoneDock, SHEET_MS } from './PhoneDock';
import { PlanView } from './PlanView';
import { DesktopTools, PanelCard, TRAY_ID } from './tools';
import { GlassLayer, type GlassTone } from '../glass';
import { useDerived } from './useDerived';
import { Viewer3D } from './Viewer3D';
import { LandscapeWalkHUD, MobileWalkHUD, useEscapeExitsWalk, WalkHUD } from './WalkHUD';

// The gallery pulls in @opensu/sheet (and with it three.js): its own lazy chunk.
const SheetGallery = lazy(() => (import.meta.env.SSR ? new Promise<never>(() => {}) : import('./SheetGallery')));

/** Desktop chrome needs room in both directions; a phone held sideways keeps the phone layout. */
const DESKTOP_QUERY = '(min-width: 768px) and (min-height: 520px)';
// Same condition as the `land` CSS variant (styles.css).
const LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 519px)';

/**
 * The pinned conversation (desktop): a floating, inset glass sidebar that
 * hangs under the house name the way a tool panel hangs under the toolbar
 * (tools.tsx: the panel's top 72 under the 18 + 48 toolbar, 18 from the
 * screen edge), down to 12 from the bottom. CSS px.
 */
const PIN_COLUMN = 360;
const PIN_LEFT = 18;
const PIN_RIGHT = PIN_LEFT + PIN_COLUMN;
const PIN_HANG = 72 - (18 + 48);
const PIN_BOTTOM = 12;
/** Space kept between a control and the framed house, CSS px (the renderer adds its own white margin). */
const GAP_DESKTOP = 12;
const GAP_PHONE = 6;
/** The renderer's white margin, scaled: the insets already keep the house clear of the controls. */
const FRAME_MARGIN = { desktop: 0.55, phone: 0.35 };

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const fn = () => setOn(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return on;
}

/** Reports an element's settled box (offset geometry: transforms of entry animations ignored). */
function useBox(ref: React.RefObject<HTMLElement | null>, on: (r: { top: number; bottom: number; left: number; right: number } | null) => void, deps: unknown[] = []): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      on(null);
      return;
    }
    const report = () => {
      let top = 0, left = 0;
      for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) {
        top += e.offsetTop;
        left += e.offsetLeft;
      }
      on({ top, left, bottom: top + el.offsetHeight, right: left + el.offsetWidth });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

type Box = { top: number; bottom: number; left: number; right: number };
const sameBox = (a: Box | null, b: Box | null) => (a && b ? a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right : a === b);
function useBoxState(): [Box | null, (b: Box | null) => void] {
  const [box, setBox] = useState<Box | null>(null);
  const set = useCallback((b: Box | null) => setBox((c) => (sameBox(c, b) ? c : b)), []);
  return [box, set];
}

/**
 * Desktop framing: clear of the top row (mode switch, toolbar), the input
 * (and the hints above it) and the open panel card. The title sits in the
 * top-left corner and the card in the top-right: the house keeps clear of
 * each from below or from the side, whichever shows it larger.
 */
function desktopInsets(W: number, H: number, left: number, o: { title: Box | null; top: number; dock: Box | null; panel: { left: number; bottom: number } | null; sidebar: number }): FrameInsets[] {
  const g = GAP_DESKTOP;
  const base = { top: o.top + g, right: 24, left: Math.max(24, o.sidebar ? o.sidebar + g : 0), bottom: o.dock ? H - o.dock.top + g : 24 };
  const tops = [base];
  // Kept clear of the title from the side, the free area stays symmetric, so
  // the house stands centred over the input (task 016).
  const side = o.title ? Math.max(base.left, o.title.right - left + 16) : 0;
  if (o.title) tops.push({ ...base, top: Math.max(base.top, o.title.bottom + g) }, { ...base, left: side, right: Math.max(base.right, side) });
  const out = o.title ? tops.slice(1) : tops;
  if (!o.panel) return out;
  const all = out.flatMap((i) => [
    { ...i, right: Math.max(i.right, W - (o.panel!.left - left) + g) },
    { ...i, top: Math.max(i.top, o.panel!.bottom + g) },
  ]);
  // The renderer ignores insets that leave less than a third free (and then
  // frames on the whole canvas): such a candidate must not compete.
  const fits = all.filter((i) => W - i.left - i.right >= W / 3 && H - i.top - i.bottom >= H / 3);
  return fits.length ? fits : [base];
}

/**
 * Deep-link state from the query string: ?mode=plan&level=L2&view=axo-ne,
 * sun study ?sun=winter&time=10:00, cutaway ?cut=L1, ?mode=sheet; the
 * conversation: ?panel=open (the recent strip), ?panel=pin (pinned).
 */
function useInitialParams(): void {
  useEffect(() => {
    // Test hooks (screenshot scripts): the stores.
    window.__studio = { ...window.__studio, store: useStudio, chat: useChat, account: useAccount, keys: useKeys };
    restoreLang();
    const q = new URLSearchParams(location.search);
    applyParams(q, true);
    if (q.get('panel') === 'open') useStudio.getState().setRecent(true);
    if (q.get('panel') === 'pin') useStudio.setState({ pinned: true, recent: false });
    const lang = q.get('lang');
    if (lang === 'en' || lang === 'zh') useStudio.getState().setLang(lang);
  }, []);
}

/**
 * Escape closes one thing at a time: a site panel (back to the sun panel
 * when it came from there), the open tool panel (focus back to its tool),
 * the recent strip; walking is left by the walk HUD's own handler after.
 */
function useEscapeCloses(): void {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const s = useStudio.getState();
      if (useAccount.getState().open) {
        closeSignIn();
      } else if (useKeys.getState().sheet) {
        closeKeySheet();
      } else if (useChat.getState().settingsOpen) {
        useChat.getState().setSettingsOpen(false);
      } else if (s.sitePanel) {
        s.setSitePanel(null);
      } else if (s.tray) {
        const trig = document.querySelector<HTMLElement>(`[aria-controls="${TRAY_ID[s.tray]}"]`);
        s.setTray(null);
        trig?.focus({ preventScroll: true });
      } else if (s.recent) {
        s.setRecent(false);
        document.querySelector<HTMLElement>('[data-testid=chat-history]')?.focus({ preventScroll: true });
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}

/** A click (not a drag) on the drawing closes the open tool panel and the recent strip. */
function useClickAwayFromDrawing(ref: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let at: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => (at = { x: e.clientX, y: e.clientY });
    const up = (e: PointerEvent) => {
      if (!at || Math.hypot(e.clientX - at.x, e.clientY - at.y) > 6) return;
      at = null;
      const s = useStudio.getState();
      if (s.tray || s.sitePanel) s.setTray(null);
      if (s.recent) s.setRecent(false);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
    };
  }, [ref]);
}

/**
 * Desktop bottom centre: the input, the recent strip and the after-turn note
 * above it, the first-visit hints. Reports the whole dock (what is open now)
 * and the input alone (the persistent layout; the hints come and go).
 */
function DesktopDock({ onBox, onInput }: { onBox: (b: Box | null) => void; onInput: (b: Box | null) => void }) {
  const recent = useStudio((s) => s.recent);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLDivElement>(null);
  useBox(ref, onBox);
  useBox(input, onInput);
  return (
    <div ref={ref} className="pointer-events-none absolute bottom-[22px] left-1/2 flex w-[min(580px,calc(100%-48px))] -translate-x-1/2 flex-col items-center gap-3" data-testid="dock">
      <Hints />
      <div ref={input} className="relative w-full">
        {recent && <RecentStrip className="absolute inset-x-0 bottom-full mb-3" />}
        <ChatInput />
      </div>
    </div>
  );
}

/** Phones in the sheets view: no tools apply, the conversation input stays (with its recent strip). */
function SheetInput() {
  const recent = useStudio((s) => s.recent);
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-20" data-testid="dock">
      <div className="relative">
        {recent && <RecentStrip phone className="absolute inset-x-0 bottom-full mb-2" />}
        <ChatInput phone />
      </div>
    </div>
  );
}

/** A loading line that only appears if the wait is noticeable (no flash for a quick lazy chunk). */
function QuietLoading({ label }: { label: string }) {
  return (
    <div className="contents [&>div]:animate-[fade-in_200ms_ease-out_400ms_both]">
      <Loading label={label} />
    </div>
  );
}

export function Studio() {
  useInitialParams();
  useEffect(restoreDraftAfterRedirect, []);
  useUrlState();
  useAutosave();
  useSunPlayer();
  useEscapeCloses();
  useEscapeExitsWalk();
  const t = useT();
  const derived = useDerived();
  const mode = useStudio((s) => s.mode);
  const level = useStudio((s) => s.level);
  const walk = useStudio((s) => s.walk) && mode === '3d';
  const pinnedState = useStudio((s) => s.pinned);
  const panelOpen = useStudio((s) => mode !== 'sheet' && (!!s.sitePanel || (!!s.tray && (mode === '3d' || s.tray === 'levels'))));
  const desktop = useMedia(DESKTOP_QUERY);
  const landscape = useMedia(LANDSCAPE_QUERY) && !desktop;
  // `?frame=full` frames on the whole canvas (comparison with the renderer's shots).
  const [fullFrame] = useState(() => typeof location !== 'undefined' && new URLSearchParams(location.search).get('frame') === 'full');
  // Desktop: the pinned conversation is a floating glass sidebar over the
  // drawing (task 017); the canvas runs edge to edge and the house frames
  // beside it.
  const column = desktop && pinnedState && mode !== 'sheet';
  const canvasLeft = 0;
  const sideRight = column ? PIN_RIGHT : 0;
  const walkLandscape = walk && landscape;
  // Smoky (dark) glass is the studio's material; ?glass=light shows light glass for comparison.
  const [glassTone] = useState<GlassTone>(() => (typeof location !== 'undefined' && new URLSearchParams(location.search).get('glass') === 'light' ? 'light' : 'dark'));

  const main = useRef<HTMLElement>(null);
  useClickAwayFromDrawing(main);

  // Boxes of the controls the house keeps clear of.
  const [title, setTitle] = useBoxState();
  const [modeBox, setModeBox] = useBoxState();
  const [dockBox, setDockBox] = useBoxState();
  const [inputBox, setInputBox] = useBoxState();
  const [header, setHeader] = useBoxState();
  const [panel, setPanel] = useState<{ left: number; bottom: number } | null>(null);
  const onPanel = useCallback((r: { left: number; bottom: number } | null) => setPanel((c) => (c && r && c.left === r.left && c.bottom === r.bottom ? c : r)), []);
  const [extent, setExtent] = useState<DockExtent | null>(null);
  const onExtent = useCallback((e: DockExtent) => setExtent((c) => (c && c.bottom === e.bottom && c.left === e.left && c.restBottom === e.restBottom && c.restLeft === e.restLeft ? c : e)), []);
  const titleRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useBox(titleRef, setTitle, [desktop]);
  useBox(modeRef, setModeBox, [column, desktop]);
  useBox(headerRef, setHeader, [desktop, landscape, walkLandscape]);
  const [vp, setVp] = useState(() => (typeof window === 'undefined' ? { w: 1440, h: 900 } : { w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // Two sets of insets: what everything open now covers (`insets`: a framing
  // the user asks for keeps clear of it), and what the persistent layout
  // alone covers (`layout`: when it changes, the house moves). Floating
  // panels, the phone sheets, the recent strip and the first-visit hints
  // are only in the first.
  const frameInsets = useCallback(
    (persistent: boolean): FrameInsets[] => {
      if (fullFrame) return [{ top: 0, right: 0, bottom: 0, left: 0 }];
      if (desktop) {
        const top = Math.max(modeBox?.bottom ?? 56, 60);
        const dock = mode === '3d' && !column ? (persistent ? inputBox : dockBox) : null;
        return desktopInsets(vp.w - canvasLeft, vp.h, canvasLeft, { title, top, dock, panel: !persistent && panelOpen ? panel : null, sidebar: sideRight });
      }
      const g = GAP_PHONE;
      const top = (header?.bottom ?? 58) + g;
      // What is open now includes the persistent part (a sheet still growing has not reached it yet).
      const bottom = (extent ? (persistent ? extent.restBottom : Math.max(extent.bottom, extent.restBottom)) : 130) + g;
      const left = extent ? (persistent ? extent.restLeft : Math.max(extent.left, extent.restLeft)) : 0;
      // A small even margin at the sides: the house, its shadow and trees never touch the screen edge.
      return [{ top, bottom, left: left ? left + 12 : 10, right: 10 }];
    },
    [fullFrame, desktop, modeBox, vp, canvasLeft, sideRight, column, title, mode, dockBox, inputBox, panelOpen, panel, header, extent],
  );
  const insets = useMemo(() => frameInsets(false), [frameInsets]);
  const layoutKey = useMemo(() => JSON.stringify([vp, frameInsets(true)]), [vp, frameInsets]);

  // The 3D viewer is created the first time 3D is shown and kept afterwards.
  const [want3d, setWant3d] = useState(mode === '3d');
  useEffect(() => {
    if (mode === '3d') setWant3d(true);
  }, [mode]);

  const levelId = derived && level && derived.levels.some((l) => l.id === level) ? level : derived?.levels[0]?.id;
  // Plan fitting: the same obstacles, as plain insets of the plan's box
  // (again what is open now, and the persistent layout alone).
  const planFree = (persistent: boolean) => {
    const dock = persistent ? inputBox : dockBox;
    const sheetLeft = extent ? (persistent ? extent.restLeft : Math.max(extent.left, extent.restLeft)) : 0;
    const sheetBottom = extent ? (persistent ? extent.restBottom : Math.max(extent.bottom, extent.restBottom)) : 130;
    return desktop
      ? { top: 84, bottom: dock ? vp.h - dock.top + GAP_DESKTOP : 120, right: !persistent && panelOpen && panel ? vp.w - panel.left + GAP_DESKTOP : 40, left: sideRight ? sideRight + 24 : 40 }
      : { top: (header?.bottom ?? 58) + 8, bottom: sheetBottom + 8, right: 12, left: sheetLeft ? sheetLeft + 24 : 12 };
  };
  const planInsets = planFree(false);
  const planLayoutKey = JSON.stringify([vp, planFree(true)]);
  // The project menu (and the sign-in it opens) lies where the pinned
  // sidebar is: the sidebar steps aside meanwhile, as the phone dock does
  // for the sign-in sheet (glass never sits on glass).
  const [menuOpen, setMenuOpen] = useState(false);
  const signInFromMenu = useAccount((s) => s.open && s.origin === 'menu');

  return (
    <GlassLayer tone={glassTone}>
    <div className="fixed inset-0 overflow-hidden bg-page text-ink">
      <main
        ref={main}
        className="absolute inset-y-0 right-0"
        style={{ left: canvasLeft }}
        aria-label={mode === '3d' ? t('mode.3d') : mode === 'plan' ? t('mode.plan') : t('mode.sheet')}
      >
        {!derived && <Loading label={t('loading')} />}
        {derived && want3d && (
          <div className={mode === '3d' ? 'contents' : 'invisible'}>
            <Viewer3D resolved={derived.resolved} active={mode === '3d'} insets={insets} layoutKey={layoutKey} insetMs={desktop ? undefined : SHEET_MS} compact={!desktop} wide={!fullFrame} margin={fullFrame ? 1 : desktop ? FRAME_MARGIN.desktop : FRAME_MARGIN.phone} />
          </div>
        )}
        {derived && levelId && mode === 'plan' && <PlanView resolved={derived.resolved} levelId={levelId} active insets={planInsets} layoutKey={planLayoutKey} />}
        {derived && mode === 'sheet' && (
          <Suspense fallback={<QuietLoading label={t('loading.sheets')} />}>
            <SheetGallery derived={derived} desktop={desktop} />
          </Suspense>
        )}
      </main>

      {desktop ? (
        <div className="pointer-events-none absolute inset-0">
          {/* A zoomed plan fades out under the top row instead of sliding beneath it. */}
          {mode === 'plan' && <div className="absolute top-0 right-0 h-24 bg-gradient-to-b from-white via-white/90 to-transparent" style={{ left: canvasLeft }} aria-hidden="true" />}
          {column && <PinnedColumn style={{ top: (title?.bottom ?? 72) + PIN_HANG, left: PIN_LEFT, bottom: PIN_BOTTOM, width: PIN_COLUMN }} aside={menuOpen || signInFromMenu} />}
          {/* The name stays put, plain ink on the drawing, pinned or not; the sidebar hangs under it. */}
          <div ref={titleRef} className="absolute top-[18px] left-6 w-max max-w-[min(360px,calc(50vw-200px))]" data-testid="title-block">
            <TitleMenu derived={derived} onOpenChange={setMenuOpen} />
          </div>
          <div
            ref={modeRef}
            className="absolute top-[18px] -translate-x-1/2"
            // Centred over the drawing; beside a pinned column on a narrow screen it moves left of the toolbar.
            style={{ left: column && vp.w < 1180 ? sideRight + 24 + 98 : sideRight + (vp.w - sideRight) / 2 }}
          >
            <ModeSwitch />
          </div>
          {mode !== 'sheet' && <DesktopTools derived={derived} className="absolute top-[18px] right-[18px]" />}
          {mode !== 'sheet' && <PanelCard derived={derived} onRect={onPanel} />}
          {walk && <WalkHUD derived={derived} left={sideRight} />}
          {/* The input stays in the sheets view too (the column is not shown there). */}
          {!column && <DesktopDock onBox={setDockBox} onInput={setInputBox} />}
          <SettingsHost />
          <SignInHost />
          <KeySheetHost />
        </div>
      ) : walkLandscape ? (
        <LandscapeWalkHUD derived={derived} />
      ) : (
        <>
          <header
            ref={headerRef}
            className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2.5 pt-[max(10px,env(safe-area-inset-top))] pr-3 pl-4 land:items-center land:pt-[max(6px,env(safe-area-inset-top))]"
            style={landscape ? { paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(12px, env(safe-area-inset-right))' } : undefined}
          >
            <div className="min-w-0 pt-0.5">
              <TitleMenu derived={derived} compact />
            </div>
            <ModeSwitch size="sm" className="shrink-0" />
          </header>
          {walk && <MobileWalkHUD derived={derived} top={`${header?.bottom ?? 58}px`} bottom={extent?.bottom ?? 130} />}
          {mode !== 'sheet' ? <PhoneDock derived={derived} landscape={landscape} onExtent={onExtent} /> : <SheetInput />}
          <SettingsHost phone />
          <SignInHost phone />
          <KeySheetHost phone />
        </>
      )}
    </div>
    </GlassLayer>
  );
}
