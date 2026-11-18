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
import { AccountButton, AccountMenuHost, StudioToast, useSignInParam } from '../chat/AccountEntry';
import { KeySheetHost } from '../chat/KeyPicker';
import { closeKeySheet, useKeys } from '../chat/keys';
import { useChat } from '../chat/chat-store';
import { useAutosave } from '../lib/autosave';
import { useProjectSync } from '../lib/projects';
import { restoreLang, useStudio } from '../lib/store';
import { applyParams, useUrlState } from '../lib/url-state';
import { Hints, ModeSwitch, TitleMenu, useSunPlayer } from './chrome';
import type { Derived } from './house-data';
import { Loading } from './Loading';
import { type DockExtent, PhoneDock, SHEET_MS } from './PhoneDock';
import { PlanView } from './PlanView';
import { ProjectsHost } from './Projects';
import { DesktopTools, PanelCard, TRAY_ID } from './tools';
import { GLASS, GlassLayer, type GlassTone } from '../glass';
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
type PanelBox = { left: number; right: number; bottom: number };
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
function desktopInsets(W: number, H: number, left: number, o: { title: Box | null; top: number; dock: Box | null; panel: PanelBox | null; sidebar: number }): FrameInsets[] {
  const g = GAP_DESKTOP;
  const base = { top: o.top + g, right: 24, left: Math.max(24, o.sidebar ? o.sidebar + g : 0), bottom: o.dock ? H - o.dock.top + g : 24 };
  const tops = [base];
  // Kept clear of the title from the side, the free area stays symmetric, so
  // the house stands centred over the input (task 016).
  const side = o.title ? Math.max(base.left, o.title.right - left + 16) : 0;
  if (o.title) tops.push({ ...base, top: Math.max(base.top, o.title.bottom + g) }, { ...base, left: side, right: Math.max(base.right, side) });
  const out = o.title ? tops.slice(1) : tops;
  if (!o.panel) return out;
  // A panel hangs under the toolbar (top right) or under the house name (a site panel from its menu, top left).
  const p = o.panel;
  const leading = p.left + p.right < 2 * left + W;
  const all = out.flatMap((i) => [
    leading ? { ...i, left: Math.max(i.left, p.right - left + g) } : { ...i, right: Math.max(i.right, W - (p.left - left) + g) },
    { ...i, top: Math.max(i.top, p.bottom + g) },
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
      <StudioToast />
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
        {recent ? <RecentStrip phone className="absolute inset-x-0 bottom-full mb-2" /> : <StudioToast className="absolute inset-x-0 bottom-full mb-2" />}
        <ChatInput phone />
      </div>
    </div>
  );
}

/**
 * Walking, the scene behind the house name is a room, not the white
 * drawing: paper fades in under the name block alone (UI_STYLE rule 11:
 * the name is ink on paper). Opaque behind the text, it fades out softly on
 * every side and stops short of any glass (the mode switch, the walk pill
 * and panel keep the scene behind them).
 */
const EDGE_FADE = 16;
function WalkEdge({ box }: { box: Box | null }) {
  const [area, setArea] = useState<{ l: number; t: number; r: number; b: number } | null>(null);
  useLayoutEffect(() => {
    if (!box) return;
    const measure = () => {
      const a = { l: box.left - EDGE_FADE, t: box.top - EDGE_FADE, r: box.right + EDGE_FADE, b: box.bottom + EDGE_FADE };
      for (const el of document.querySelectorAll<HTMLElement>('.lg')) {
        const g = el.getBoundingClientRect();
        if (!g.width || g.right <= a.l || g.left >= a.r || g.bottom <= a.t || g.top >= a.b) continue;
        if (g.left >= box.right - 1) a.r = Math.min(a.r, g.left - 2);
        else if (g.top >= box.bottom - 1) a.b = Math.min(a.b, g.top - 2);
      }
      setArea((c) => (c && c.l === a.l && c.t === a.t && c.r === a.r && c.b === a.b ? c : a));
    };
    measure();
    // The walk pill and panel arrive after the name: measure again for a moment, and on resize.
    const timer = window.setInterval(measure, 400);
    const stop = window.setTimeout(() => clearInterval(timer), 4000);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
      window.removeEventListener('resize', measure);
    };
  }, [box]);
  if (!box || !area) return null;
  // Opaque over the name block, fading to nothing over whatever room each side has.
  const [pl, pr, pt, pb] = [box.left - area.l, area.r - box.right, box.top - area.t, area.b - box.bottom].map((v) => Math.max(0, v));
  const fade = `linear-gradient(to right, transparent, #000 ${pl}px, #000 calc(100% - ${pr}px), transparent), linear-gradient(to bottom, transparent, #000 ${pt}px, #000 calc(100% - ${pb}px), transparent)`;
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: area.l, top: area.t, width: area.r - area.l, height: area.b - area.t, background: 'var(--color-page)', maskImage: fade, WebkitMaskImage: fade, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }}
      aria-hidden="true"
      data-testid="walk-edge"
    />
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
  useSignInParam();
  useEffect(restoreDraftAfterRedirect, []);
  useUrlState();
  useAutosave();
  useProjectSync();
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
  // While the status is unknown the layout expects the button (the public site offers sign-in); a server without sign-in gets the old header.
  const accountShown = useChat((s) => !s.server || !!(s.server.auth?.email || s.server.auth?.google));
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
  const [panel, setPanel] = useState<PanelBox | null>(null);
  const onPanel = useCallback((r: PanelBox | null) => setPanel((c) => (c && r && c.left === r.left && c.right === r.right && c.bottom === r.bottom ? c : r)), []);
  const [extent, setExtent] = useState<DockExtent | null>(null);
  const onExtent = useCallback((e: DockExtent) => setExtent((c) => (c && c.bottom === e.bottom && c.left === e.left && c.restBottom === e.restBottom && c.restLeft === e.restLeft ? c : e)), []);
  const titleRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useBox(titleRef, setTitle, [desktop]);
  useBox(modeRef, setModeBox, [column, desktop]);
  useBox(headerRef, setHeader, [desktop, landscape, walkLandscape]);
  const phoneTitleRef = useRef<HTMLDivElement>(null);
  const [phoneTitle, setPhoneTitle] = useBoxState();
  useBox(phoneTitleRef, setPhoneTitle, [desktop, landscape, walkLandscape]);
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
        // 3D and plan share one framing area (task 023): both keep clear of the input.
        const dock = mode !== 'sheet' && !column ? (persistent ? inputBox : dockBox) : null;
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
        {derived && levelId && mode === 'plan' && <PlanView resolved={derived.resolved} levelId={levelId} active insets={insets} layoutKey={layoutKey} />}
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
          {/* Walking, the scene behind the name is a room, not the white drawing: the paper fades in under the top row (a scroll-edge effect) so the name stays plain ink on paper. */}
          {walk && <WalkEdge box={title} />}
          {/* A menu or panel opened over it makes it step aside (the glass module's rule, `stepAside`). */}
          {column && <PinnedColumn style={{ top: (title?.bottom ?? 72) + PIN_HANG, left: PIN_LEFT, bottom: PIN_BOTTOM, width: PIN_COLUMN }} />}
          {/* The name stays put, plain ink on the drawing, pinned or not; the sidebar hangs under it. */}
          <div ref={titleRef} className="absolute top-[18px] left-6 w-max max-w-[min(360px,calc(50vw-200px))]" data-testid="title-block">
            <TitleMenu derived={derived} />
          </div>
          <div
            ref={modeRef}
            className="absolute top-[18px] -translate-x-1/2"
            // At the screen's centre, pinned or not (task 023, audit item 19; reverses task 021's
            // "centred over the drawing"). Only where the pinned column would reach under it
            // (narrow windows) does it stand beside the column instead.
            style={{ left: column && vp.w / 2 - 110 < sideRight + 24 ? sideRight + 24 + 110 : vp.w / 2 }}
          >
            <ModeSwitch />
          </div>
          {/* The toolbar and, right of it, the account button (task 026): one row, one height, the module's gap. */}
          <div className="absolute top-[18px] right-[18px] flex items-center" style={{ gap: GLASS.anchorGap }} data-testid="top-trailing">
            {mode !== 'sheet' && <DesktopTools derived={derived} />}
            <AccountButton />
          </div>
          {mode !== 'sheet' && <PanelCard derived={derived} onRect={onPanel} />}
          {walk && <WalkHUD derived={derived} left={sideRight} />}
          {/* The input stays in the sheets view too (the column is not shown there). */}
          {!column && <DesktopDock onBox={setDockBox} onInput={setInputBox} />}
          {column && (
            <div className="absolute right-0 bottom-[22px]" style={{ left: sideRight }}>
              <StudioToast />
            </div>
          )}
          <SettingsHost />
          <SignInHost />
          <AccountMenuHost />
          <ProjectsHost />
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
            {!accountShown ? (
              // No sign-in on this server: the header as before task 026.
              <>
                <div ref={phoneTitleRef} className="min-w-0 pt-0.5">
                  <TitleMenu derived={derived} compact />
                </div>
                <ModeSwitch size="sm" className="shrink-0" />
              </>
            ) : landscape ? (
                // Sideways: one row has the width: the name, the switch centred, the account button at the end.
                <>
                  <div ref={phoneTitleRef} className="min-w-0 flex-1 pt-0.5">
                    <TitleMenu derived={derived} compact />
                  </div>
                  <ModeSwitch size="sm" className="shrink-0" />
                  <div className="flex flex-1 justify-end">
                    <AccountButton size={44} round />
                  </div>
                </>
              ) : (
                // Upright (task 026): the name and the account button on the top row; the switch centred on a row of its own.
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-2.5" data-account-row="">
                    <div ref={phoneTitleRef} className="min-w-0 pt-0.5">
                      <TitleMenu derived={derived} compact />
                    </div>
                    {/* 36 px (44 px to touch): its centre on the house name's line. */}
                    <AccountButton size={36} round className="shrink-0" />
                  </div>
                  <div className="flex justify-center">
                    {/* On its own row it lies under the menus that open from the top row: it steps aside while one is open. */}
                    <ModeSwitch size="sm" className="shrink-0" stepAside />
                  </div>
                </div>
              )}
          </header>
          {walk && <WalkEdge box={phoneTitle} />}
          {walk && <MobileWalkHUD derived={derived} top={`${header?.bottom ?? 58}px`} bottom={extent?.bottom ?? 130} />}
          {mode !== 'sheet' ? <PhoneDock derived={derived} landscape={landscape} onExtent={onExtent} /> : <SheetInput />}
          <SettingsHost phone />
          <SignInHost phone />
          <AccountMenuHost />
          <ProjectsHost phone />
          <KeySheetHost phone />
        </>
      )}
    </div>
    </GlassLayer>
  );
}
