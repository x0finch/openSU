import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { LangToggle } from '../components/ui';
import { useT } from '../lib/i18n';
import { restoreLang, SUN_DATES, type SunDateId, useStudio } from '../lib/store';
import { isViewId } from '../lib/views';
import { ChatRail, LevelRail, MobileChat, MobileHeader, MobileSheet, ModeSwitch, SceneDock, TitleBlock, useSunPlayer, ViewRail, ZoomCluster } from './chrome';
import { Loading } from './Loading';
import { PlanView } from './PlanView';
import { useDerived } from './useDerived';
import { Viewer3D } from './Viewer3D';
import { MobileWalkHUD, WalkHUD } from './WalkHUD';

// The gallery pulls in @opensu/sheet (and with it three.js): its own lazy chunk.
const SheetGallery = lazy(() => (import.meta.env.SSR ? new Promise<never>(() => {}) : import('./SheetGallery')));

/** Height of the phone header (logo row + title + facts), CSS px. */
const PHONE_HEADER = 'calc(max(4px, env(safe-area-inset-top)) + 84px)';

function useIsDesktop(): boolean {
  const [desk, setDesk] = useState(() => typeof matchMedia === 'function' && matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = matchMedia('(min-width: 768px)');
    const on = () => setDesk(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desk;
}

/**
 * Deep-link state from the query string: ?mode=plan&level=L2&view=axo-ne,
 * sun study ?sun=winter&time=10:00, cutaway ?cut=L1, ?mode=sheet.
 */
function useInitialParams(): void {
  useEffect(() => {
    restoreLang();
    const q = new URLSearchParams(location.search);
    const s = useStudio.getState();
    const mode = q.get('mode');
    if (mode === 'plan' || mode === '3d' || mode === 'sheet') s.setMode(mode);
    const view = q.get('view');
    if (isViewId(view)) useStudio.setState({ view });
    const level = q.get('level');
    if (level) s.setLevel(level);
    const sun = q.get('sun');
    const time = /^(\d{1,2}):(\d{2})$/.exec(q.get('time') ?? '');
    if (sun && SUN_DATES.includes(sun as SunDateId)) s.setSun({ on: true, dateId: sun as SunDateId });
    if (time) s.setSun({ on: true, minutes: Number(time[1]) * 60 + Number(time[2]) });
    const cut = q.get('cut');
    if (cut) s.setCut(cut);
    if (q.get('panel') === 'open') s.setSheetOpen(true);
    if (q.get('walk') === '1') s.setWalk(true);
    const lang = q.get('lang');
    if (lang === 'en' || lang === 'zh') s.setLang(lang);
  }, []);
}

export function Studio() {
  useInitialParams();
  useSunPlayer();
  const t = useT();
  const derived = useDerived();
  const mode = useStudio((s) => s.mode);
  const level = useStudio((s) => s.level);
  const walk = useStudio((s) => s.walk) && mode === '3d';
  const desktop = useIsDesktop();
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
        style={{ top: !desktop && mode === '3d' ? PHONE_HEADER : 0, bottom: desktop ? 0 : sheetH }}
        aria-label={mode === '3d' ? t('mode.3d') : t('mode.plan')}
      >
        {!derived && <Loading label={t('loading')} />}
        {derived && want3d && (
          <div className={mode === '3d' ? 'contents' : 'invisible'}>
            <Viewer3D resolved={derived.resolved} active={mode === '3d'} />
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
          <TitleBlock derived={derived} />
          <div className="absolute top-5 left-1/2 -translate-x-1/2">
            <ModeSwitch className="glass pointer-events-auto" />
          </div>
          <div className="glass pointer-events-auto absolute top-5 right-6 rounded-ui p-1">
            <LangToggle size="sm" />
          </div>
          <div className="absolute top-1/2 right-6 -translate-y-1/2">{mode === '3d' ? <ViewRail /> : mode === 'plan' && derived && <LevelRail levels={derived.levels} />}</div>
          <div className="absolute top-1/2 left-6 -translate-y-1/2">
            <ChatRail />
          </div>
          {mode === '3d' && (
            <div className="absolute inset-x-0 bottom-6 flex justify-center">
              <SceneDock levels={derived?.levels ?? null} />
            </div>
          )}
          {mode !== 'sheet' && !walk && (
            <div className="glass pointer-events-auto absolute right-6 bottom-6 rounded-ui p-1">
              <ZoomCluster />
            </div>
          )}
          {walk && <WalkHUD derived={derived} />}
        </div>
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
