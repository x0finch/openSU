import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { LangToggle } from '../components/ui';
import { useT } from '../lib/i18n';
import { useChat } from '../chat/chat-store';
import { useAutosave } from '../lib/autosave';
import { restoreLang, useStudio } from '../lib/store';
import { applyParams, useUrlState } from '../lib/url-state';
import { ChatRail, LevelRail, MobileChat, MobileHeader, MobileSheet, ModeSwitch, SceneDock, TitleBlock, useSunPlayer, ViewRail, ZoomCluster } from './chrome';
import { Loading } from './Loading';
import { PlanView } from './PlanView';
import { useDerived } from './useDerived';
import { Viewer3D } from './Viewer3D';
import { LandscapeWalkHUD, MobileWalkHUD, useEscapeExitsWalk, WalkHUD } from './WalkHUD';

// The gallery pulls in @opensu/sheet (and with it three.js): its own lazy chunk.
const SheetGallery = lazy(() => (import.meta.env.SSR ? new Promise<never>(() => {}) : import('./SheetGallery')));

/** Height of the phone header (logo row + title + facts), CSS px. */
const PHONE_HEADER = 'calc(max(4px, env(safe-area-inset-top)) + 84px)';
/** Sideways the header is one row (title inline). */
const PHONE_HEADER_LANDSCAPE = 'calc(max(4px, env(safe-area-inset-top)) + 44px)';

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

/**
 * Space the floating desktop chrome takes over the drawing (CSS px): mode
 * switch on top, view rail on the right, scene dock at the bottom, the
 * assistant rail or its open panel on the left.
 */
const DESKTOP_INSETS = { top: 76, right: 92, bottom: 100, left: 92 };
const CHAT_PANEL_RIGHT = 400;
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The 3D framing on desktop. The title block sits in the top-left corner:
 * the house keeps clear of it either from below or from its side, whichever
 * shows the house larger. With the assistant panel open the panel (which
 * starts below the title block) takes the whole left side.
 */
function desktopInsets(chatOpen: boolean, info: { right: number; bottom: number } | null, dockTop: number | null) {
  // The dock may wrap to two rows on narrow windows: keep clear of its real top.
  const base = { ...DESKTOP_INSETS, bottom: dockTop === null ? DESKTOP_INSETS.bottom : Math.max(DESKTOP_INSETS.bottom, window.innerHeight - dockTop + 12) };
  if (chatOpen) return [{ ...base, left: CHAT_PANEL_RIGHT }];
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
    if (q.get('panel') === 'open') useStudio.getState().setSheetOpen(true);
    const lang = q.get('lang');
    if (lang === 'en' || lang === 'zh') useStudio.getState().setLang(lang);
  }, []);
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
  const chatOpen = useStudio((s) => s.chatOpen);
  // `?frame=full` frames on the whole canvas (comparison with the renderer's shots).
  const [fullFrame] = useState(() => typeof location !== 'undefined' && new URLSearchParams(location.search).get('frame') === 'full');
  const [info, setInfo] = useState<{ right: number; bottom: number } | null>(null);
  const onInfoRect = useCallback((r: { right: number; bottom: number }) => setInfo((c) => (c && c.right === r.right && c.bottom === r.bottom ? c : r)), []);
  const [dockTop, setDockTop] = useState<number | null>(null);
  const onDockRect = useCallback((r: { top: number }) => setDockTop(r.top), []);
  const insets = useMemo(
    () => (desktop && !fullFrame ? desktopInsets(chatOpen, info, mode === '3d' ? dockTop : null) : [NO_INSETS]),
    [desktop, chatOpen, fullFrame, info, dockTop, mode],
  );
  // A phone held sideways while walking: the room fills the screen, with its own HUD.
  const walkLandscape = walk && landscape;
  const [sheetH, setSheetH] = useState(0);
  const onSheetHeight = useCallback((h: number) => setSheetH(h), []);
  // The 3D viewer is created the first time 3D is shown and kept afterwards.
  const [want3d, setWant3d] = useState(mode === '3d');
  useEffect(() => {
    if (mode === '3d') setWant3d(true);
  }, [mode]);

  const levelId = derived && level && derived.levels.some((l) => l.id === level) ? level : derived?.levels[0]?.id;

  return (
    <div className="fixed inset-0 overflow-hidden bg-page text-ink">
      <main
        className="absolute inset-x-0 transition-[bottom] duration-300 ease-out-soft"
        // Phones: the drawing sits between the header and the bottom sheet.
        style={{ top: !desktop && mode === '3d' && !walkLandscape ? (landscape ? PHONE_HEADER_LANDSCAPE : PHONE_HEADER) : 0, bottom: desktop || walkLandscape ? 0 : sheetH }}
        aria-label={mode === '3d' ? t('mode.3d') : t('mode.plan')}
      >
        {!derived && <Loading label={t('loading')} />}
        {derived && want3d && (
          <div className={mode === '3d' ? 'contents' : 'invisible'}>
            <Viewer3D resolved={derived.resolved} active={mode === '3d'} insets={insets} compact={!desktop} />
          </div>
        )}
        {derived && levelId && mode === 'plan' && <PlanView resolved={derived.resolved} levelId={levelId} active />}
        {derived && mode === 'sheet' && (
          <Suspense fallback={<Loading label={t('loading')} />}>
            <SheetGallery derived={derived} desktop={desktop} />
          </Suspense>
        )}
      </main>

      {desktop ? (
        <div className="pointer-events-none absolute inset-0">
          <TitleBlock derived={derived} onRect={onInfoRect} />
          <div className="absolute top-5 left-1/2 -translate-x-1/2">
            <ModeSwitch className="glass pointer-events-auto" />
          </div>
          <div className="glass pointer-events-auto absolute top-5 right-6 rounded-ui p-1">
            <LangToggle size="sm" />
          </div>
          <div className="absolute top-1/2 right-6 -translate-y-1/2">{mode === '3d' ? <ViewRail /> : mode === 'plan' && derived && <LevelRail levels={derived.levels} />}</div>
          <ChatRail />
          {mode === '3d' && (
            <div className="absolute inset-x-0 bottom-6 flex justify-center">
              <SceneDock levels={derived?.levels ?? null} onRect={onDockRect} />
            </div>
          )}
          {mode !== 'sheet' && !walk && (
            <div className="glass pointer-events-auto absolute right-6 bottom-6 rounded-ui p-1">
              <ZoomCluster />
            </div>
          )}
          {walk && <WalkHUD derived={derived} />}
        </div>
      ) : walkLandscape ? (
        <LandscapeWalkHUD derived={derived} />
      ) : (
        <>
          <MobileHeader derived={derived} />
          {mode === 'plan' && (
            <div className="glass absolute right-3 rounded-ui p-0.5 transition-[bottom] duration-300 ease-out-soft" style={{ bottom: sheetH + 12 }}>
              <ZoomCluster size="lg" />
            </div>
          )}
          {walk && <MobileWalkHUD derived={derived} top={PHONE_HEADER} bottom={sheetH} />}
          <MobileSheet derived={derived} onHeight={onSheetHeight} />
          <MobileChat />
        </>
      )}
    </div>
  );
}
