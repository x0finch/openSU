import { useCallback, useEffect, useState } from 'react';
import { LangToggle } from '../components/ui';
import { useT } from '../lib/i18n';
import { restoreLang, useStudio } from '../lib/store';
import { isViewId } from '../lib/views';
import { ChatRail, LevelRail, MobileChat, MobileHeader, MobileSheet, ModeSwitch, SunBar, TitleBlock, ViewRail, ZoomCluster } from './chrome';
import { Loading } from './Loading';
import { PlanView } from './PlanView';
import { useDerived } from './useDerived';
import { Viewer3D } from './Viewer3D';

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

/** Deep-link state from the query string: ?mode=plan&level=L2&view=axo-ne */
function useInitialParams(): void {
  useEffect(() => {
    restoreLang();
    const q = new URLSearchParams(location.search);
    const s = useStudio.getState();
    const mode = q.get('mode');
    if (mode === 'plan' || mode === '3d') s.setMode(mode);
    const view = q.get('view');
    if (isViewId(view)) useStudio.setState({ view });
    const level = q.get('level');
    if (level) s.setLevel(level);
    const lang = q.get('lang');
    if (lang === 'en' || lang === 'zh') s.setLang(lang);
  }, []);
}

export function Studio() {
  useInitialParams();
  const t = useT();
  const derived = useDerived();
  const mode = useStudio((s) => s.mode);
  const level = useStudio((s) => s.level);
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
        className="absolute inset-x-0 top-0 transition-[bottom] duration-300 ease-out-soft"
        style={{ bottom: desktop ? 0 : sheetH }}
        aria-label={mode === '3d' ? t('mode.3d') : t('mode.plan')}
      >
        {!derived && <Loading label={t('loading')} />}
        {derived && want3d && (
          <div className={mode === '3d' ? 'contents' : 'invisible'}>
            <Viewer3D resolved={derived.resolved} active={mode === '3d'} />
          </div>
        )}
        {derived && levelId && mode === 'plan' && <PlanView resolved={derived.resolved} levelId={levelId} active />}
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
          <div className="absolute top-1/2 right-6 -translate-y-1/2">{mode === '3d' ? <ViewRail /> : derived && <LevelRail levels={derived.levels} />}</div>
          <div className="absolute top-1/2 left-6 -translate-y-1/2">
            <ChatRail />
          </div>
          {mode === '3d' && (
            <div className="glass pointer-events-auto absolute bottom-6 left-1/2 w-[440px] -translate-x-1/2 rounded-ui px-4 py-2.5">
              <SunBar />
            </div>
          )}
          <div className="glass pointer-events-auto absolute right-6 bottom-6 rounded-ui p-1">
            <ZoomCluster />
          </div>
        </div>
      ) : (
        <>
          <MobileHeader derived={derived} />
          {mode === 'plan' && (
            <div className="glass absolute right-3 rounded-ui p-0.5 transition-[bottom] duration-300 ease-out-soft" style={{ bottom: sheetH + 12 }}>
              <ZoomCluster size="lg" />
            </div>
          )}
          <MobileSheet derived={derived} onHeight={onSheetHeight} />
          <MobileChat />
        </>
      )}
    </div>
  );
}
