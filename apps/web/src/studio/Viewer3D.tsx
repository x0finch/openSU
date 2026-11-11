import type { ResolvedHouse } from '@opensu/model';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { useStudio } from '../lib/store';
import { presetById } from '../lib/views';
import type { Engine } from './engine';
import { Loading } from './Loading';

declare global {
  interface Window {
    /** Test hooks for the smoke test / screenshot script. */
    __studio?: { ready3d?: boolean; engine?: Engine; planReady?: boolean };
  }
}

function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export function Viewer3D({ resolved, active }: { resolved: ResolvedHouse; active: boolean }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const view = useStudio((s) => s.view);
  const nonce = useStudio((s) => s.viewNonce);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!hasWebGL2()) {
      setStatus('error');
      return;
    }
    let alive = true;
    void import('./engine').then((m) => {
      if (!alive || !ref.current) return;
      try {
        const dpr = new URLSearchParams(location.search).get('dpr');
        const e = m.createEngine(ref.current, resolved, { pixelRatio: dpr ? Number(dpr) : undefined });
        e.setView(presetById(useStudio.getState().view), true);
        engine.current = e;
        window.__studio = { ...window.__studio, engine: e, ready3d: true };
        setStatus('ready');
      } catch (err) {
        console.error(err);
        setStatus('error');
      }
    });
    return () => {
      alive = false;
      engine.current?.dispose();
      engine.current = null;
      if (window.__studio) window.__studio.ready3d = false;
    };
  }, [resolved]);

  useEffect(() => {
    engine.current?.setView(presetById(view));
  }, [view, nonce]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => engine.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="absolute inset-0" aria-hidden={!active} data-active={active}>
      <div ref={ref} className="absolute inset-0 [&>canvas]:h-full! [&>canvas]:w-full!" data-testid="viewer" />
      {status === 'loading' && <Loading label={t('loading3d')} />}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-ink-2">{t('error.webgl')}</div>
      )}
    </div>
  );
}
