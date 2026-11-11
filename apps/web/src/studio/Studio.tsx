import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cx } from '../components/ui';
import { useT } from '../lib/i18n';
import { DesktopChat, MobileChat, PromptBar } from '../chat/ChatPanel';
import { useChat } from '../chat/chat-store';
import { useAutosave } from '../lib/autosave';
import { restoreLang, useStudio } from '../lib/store';
import { applyParams, useUrlState } from '../lib/url-state';
import { ActionRow, Hints, ModeSwitch, TitleMenu, TrayHost, useSunPlayer } from './chrome';
import type { Derived } from './house-data';
import { Loading } from './Loading';
import { PlanView } from './PlanView';
import { SitePanelHost } from './SitePanels';
import { useDerived } from './useDerived';
import { Viewer3D } from './Viewer3D';
import { LandscapeWalkHUD, MobileWalkHUD, useEscapeExitsWalk, WalkHUD } from './WalkHUD';

// The gallery pulls in @opensu/sheet (and with it three.js): its own lazy chunk.
const SheetGallery = lazy(() => (import.meta.env.SSR ? new Promise<never>(() => {}) : import('./SheetGallery')));

/** Height of the phone header (title + facts, mode switch), CSS px. */
const PHONE_HEADER = 'calc(max(6px, env(safe-area-inset-top)) + 58px)';
/** Sideways the header is one row. */
const PHONE_HEADER_LANDSCAPE = 'calc(max(4px, env(safe-area-inset-top)) + 46px)';

/** Desktop chrome needs room in both directions; a phone held sideways keeps the phone layout. */
const DESKTOP_QUERY = '(min-width: 768px) and (min-height: 520px)';
// Same condition as the `land` CSS variant (styles.css).
const LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 519px)';

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

/** Width of the left column (assistant or site panel) including its margin, CSS px. */
const LEFT_COLUMN = 404;
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The 3D framing on desktop: clear of the mode switch on top, the dock at
 * the bottom (its real top, tray included) and the left column when open.
 * The title sits in the top-left corner: the house keeps clear of it from
 * below or from its side, whichever shows the house larger.
 */
function desktopInsets(column: boolean, info: { right: number; bottom: number } | null, dockTop: number | null) {
  const base = { top: 72, right: 32, left: 32, bottom: dockTop === null ? 140 : Math.max(96, window.innerHeight - dockTop + 28) };
  if (column) return [{ ...base, left: LEFT_COLUMN + 16 }];
  if (!info) return [base];
  return [
    { ...base, top: Math.max(base.top, info.bottom + 12) },
    { ...base, left: Math.max(base.left, info.right + 16) },
  ];
}

/**
 * Deep-link state from the query string: ?mode=plan&level=L2&view=axo-ne,
 * sun study ?sun=winter&time=10:00, cutaway ?cut=L1, ?mode=sheet.
 */
function useInitialParams(): void {
  useEffect(() => {
    // Test hooks (screenshot scripts): the stores.
    window.__studio = { ...window.__studio, store: useStudio, chat: useChat };
    restoreLang();
    const q = new URLSearchParams(location.search);
    applyParams(q, true);
    if (q.get('panel') === 'open') useStudio.getState().setChatOpen(true);
    const lang = q.get('lang');
    if (lang === 'en' || lang === 'zh') useStudio.getState().setLang(lang);
  }, []);
}

/** The bottom of the 3D / plan chrome: open tray, first-visit hints, the secondary row and the prompt bar. */
function Dock({ derived, desktop, landscape, onRect }: { derived: Derived | null; desktop: boolean; landscape: boolean; onRect: (r: { top: number; barTop: number }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const chatOpen = useStudio((s) => s.chatOpen);
  const walk = useStudio((s) => s.walk);
  const column = useStudio((s) => s.chatOpen || !!s.sitePanel);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onRect({ top: Math.round(el.getBoundingClientRect().top), barTop: Math.round((bar.current ?? el).getBoundingClientRect().top) });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [onRect]);
  const levels = derived?.levels ?? null;
  if (desktop) {
    return (
      <div
        ref={ref}
        className="pointer-events-none absolute bottom-6 flex -translate-x-1/2 flex-col items-center gap-2.5 transition-[left] duration-300 ease-out-soft"
        // Centred in the drawing that is left beside the open column.
        style={{ left: column ? `calc(${LEFT_COLUMN}px + (100% - ${LEFT_COLUMN}px) / 2)` : '50%' }}
        data-testid="dock"
      >
        <TrayHost levels={levels} />
        <Hints />
        <ActionRow levels={levels} />
        {!chatOpen && (
          <div ref={bar} className={cx(walk ? 'w-[min(420px,calc(100vw-620px))]' : 'w-[min(600px,calc(100vw-64px))]', 'min-w-[340px]')}>
            <PromptBar />
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className={cx('pointer-events-none absolute inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] flex flex-col items-stretch gap-2', chatOpen ? 'z-40' : 'z-20')}
      style={landscape ? { left: 'max(12px, env(safe-area-inset-left))', right: 'max(12px, env(safe-area-inset-right))' } : undefined}
      data-testid="dock"
    >
      {!chatOpen && <TrayHost levels={levels} compact />}
      {!chatOpen && (
        <div className="flex justify-center">
          <Hints compact />
        </div>
      )}
      {landscape ? (
        <div className="flex items-end gap-2">
          {!chatOpen && (
            <div className="w-[340px] shrink-0">
              <ActionRow levels={levels} compact />
            </div>
          )}
          <div ref={bar} className="min-w-0 flex-1">
            <PromptBar compact />
          </div>
        </div>
      ) : (
        <>
          {!chatOpen && <ActionRow levels={levels} compact />}
          <div ref={bar}>
            <PromptBar compact />
          </div>
        </>
      )}
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
  useUrlState();
  useAutosave();
  useSunPlayer();
  useEscapeExitsWalk();
  const t = useT();
  const derived = useDerived();
  const mode = useStudio((s) => s.mode);
  const level = useStudio((s) => s.level);
  const walk = useStudio((s) => s.walk) && mode === '3d';
  const desktop = useMedia(DESKTOP_QUERY);
  const landscape = useMedia(LANDSCAPE_QUERY) && !desktop;
  const column = useStudio((s) => s.chatOpen || !!s.sitePanel);
  // `?frame=full` frames on the whole canvas (comparison with the renderer's shots).
  const [fullFrame] = useState(() => typeof location !== 'undefined' && new URLSearchParams(location.search).get('frame') === 'full');
  const [info, setInfo] = useState<{ right: number; bottom: number } | null>(null);
  const onInfoRect = useCallback((r: { right: number; bottom: number }) => setInfo((c) => (c && c.right === r.right && c.bottom === r.bottom ? c : r)), []);
  const [dock, setDock] = useState<{ top: number; barTop: number } | null>(null);
  const onDockRect = useCallback((r: { top: number; barTop: number }) => setDock((c) => (c && c.top === r.top && c.barTop === r.barTop ? c : r)), []);
  const insets = useMemo(
    () => (desktop && !fullFrame ? desktopInsets(column && mode !== 'sheet', info, mode === '3d' ? dock?.top ?? null : null) : [NO_INSETS]),
    [desktop, column, fullFrame, info, dock, mode],
  );
  // A phone held sideways while walking: the room fills the screen, with its own HUD.
  const walkLandscape = walk && landscape;
  // The 3D viewer is created the first time 3D is shown and kept afterwards.
  const [want3d, setWant3d] = useState(mode === '3d');
  useEffect(() => {
    if (mode === '3d') setWant3d(true);
  }, [mode]);

  const levelId = derived && level && derived.levels.some((l) => l.id === level) ? level : derived?.levels[0]?.id;
  const header = landscape ? PHONE_HEADER_LANDSCAPE : PHONE_HEADER;
  // Phones: the drawing sits between the header and the dock.
  const vh = typeof window === 'undefined' ? 0 : window.innerHeight;
  const phoneBottom = dock && mode !== 'sheet' ? Math.max(0, vh - dock.top + 8) : 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-page text-ink">
      <main
        className="absolute inset-x-0 transition-[bottom] duration-300 ease-out-soft"
        style={{ top: !desktop && mode !== 'sheet' && !walkLandscape ? header : 0, bottom: desktop || walkLandscape ? 0 : phoneBottom }}
        aria-label={mode === '3d' ? t('mode.3d') : mode === 'plan' ? t('mode.plan') : t('mode.sheet')}
      >
        {!derived && <Loading label={t('loading')} />}
        {derived && want3d && (
          <div className={mode === '3d' ? 'contents' : 'invisible'}>
            <Viewer3D resolved={derived.resolved} active={mode === '3d'} insets={insets} compact={!desktop} />
          </div>
        )}
        {derived && levelId && mode === 'plan' && <PlanView resolved={derived.resolved} levelId={levelId} active insetLeft={desktop && column ? LEFT_COLUMN : 0} insetBottom={desktop ? 136 : 0} />}
        {derived && mode === 'sheet' && (
          <Suspense fallback={<QuietLoading label={t('loading.sheets')} />}>
            <SheetGallery derived={derived} desktop={desktop} />
          </Suspense>
        )}
      </main>

      {desktop ? (
        <div className="pointer-events-none absolute inset-0">
          {/* A zoomed plan fades out under the title instead of sliding beneath it. */}
          {mode === 'plan' && <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white via-white/90 to-transparent" aria-hidden="true" />}
          {mode === 'plan' && <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-white via-white/85 to-transparent" aria-hidden="true" />}
          {/* Over a walk-through room the title needs a backdrop to stay readable. */}
          <div className={cx('absolute top-4 left-6 max-w-[min(340px,calc(50vw-180px))]', walk && 'glass -mt-1 -ml-2 rounded-ui py-1 pr-3 pl-2')}>
            <TitleMenu derived={derived} onRect={onInfoRect} />
          </div>
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <ModeSwitch className="glass pointer-events-auto" />
          </div>
          {mode !== 'sheet' && <DesktopChat />}
          {mode !== 'sheet' && <SitePanelHost desktop />}
          {walk && <WalkHUD derived={derived} />}
          {mode !== 'sheet' && <Dock derived={derived} desktop landscape={false} onRect={onDockRect} />}
        </div>
      ) : walkLandscape ? (
        <LandscapeWalkHUD derived={derived} />
      ) : (
        <>
          <header
            className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-white via-white/90 to-transparent px-3 pt-[max(6px,env(safe-area-inset-top))] pb-3 land:items-center land:pt-[max(4px,env(safe-area-inset-top))] land:pb-1"
            style={landscape ? { paddingLeft: 'max(12px, env(safe-area-inset-left))', paddingRight: 'max(12px, env(safe-area-inset-right))' } : undefined}
          >
            <div className="min-w-0 pl-1">
              <TitleMenu derived={derived} compact />
            </div>
            <ModeSwitch size="sm" className="glass pointer-events-auto mt-0.5 shrink-0 rounded-[11px] p-0.5! land:mt-0" />
          </header>
          {walk && <MobileWalkHUD derived={derived} top={header} bottom={phoneBottom} />}
          {mode !== 'sheet' && <Dock derived={derived} desktop={false} landscape={landscape} onRect={onDockRect} />}
          {mode !== 'sheet' && <MobileChat top={`calc(${header} + 4px)`} bottom={dock ? vh - dock.barTop + 8 : 80} />}
          <SitePanelHost desktop={false} />
        </>
      )}
    </div>
  );
}
