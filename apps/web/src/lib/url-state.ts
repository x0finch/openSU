// The studio's view state in the URL: mode, level, view, cutaway, sun study
// and walk are reflected in the query string, so reload restores them and
// back / forward step through them. Other parameters (lang, sample, dpr,
// panel) are kept as they are.
import { useEffect } from 'react';
import { type StudioState, SUN_DATES, type SunDateId, useStudio } from './store';
import { DEFAULT_VIEW, isViewId } from './views';

const OWN = ['mode', 'level', 'view', 'cut', 'sun', 'time', 'walk'] as const;

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m) % 60)}`;

/** The query parameters that describe the studio state (defaults omitted). */
export function stateParams(s: StudioState): Record<string, string> {
  const p: Record<string, string> = {};
  if (s.mode !== '3d') p.mode = s.mode;
  if (s.mode === 'plan' && s.level) p.level = s.level;
  if (s.mode === '3d') {
    if (s.view !== DEFAULT_VIEW) p.view = s.view;
    if (s.cut) p.cut = s.cut;
    if (s.walk) p.walk = '1';
  }
  if (s.sun.on) {
    p.sun = s.sun.dateId;
    p.time = hhmm(Math.round(s.sun.minutes));
  }
  return p;
}

/** Applies query parameters to the store (initial load and back / forward). */
export function applyParams(q: URLSearchParams, initial: boolean): void {
  const s = useStudio.getState();
  const mode = q.get('mode');
  s.setMode(mode === 'plan' || mode === 'sheet' ? mode : '3d');
  const view = q.get('view');
  if (isViewId(view)) useStudio.setState({ view, viewNonce: s.viewNonce + 1, viewMoved: false });
  else if (!initial) useStudio.setState({ view: DEFAULT_VIEW, viewNonce: s.viewNonce + 1, viewMoved: false });
  const level = q.get('level');
  if (level) s.setLevel(level);
  const cut = q.get('cut');
  if (cut || !initial) useStudio.getState().setCut(cut || null);
  const sun = q.get('sun');
  const time = /^(\d{1,2}):(\d{2})$/.exec(q.get('time') ?? '');
  if (sun && SUN_DATES.includes(sun as SunDateId)) s.setSun({ on: true, dateId: sun as SunDateId, playing: false });
  else if (!initial) s.setSun({ on: false, playing: false });
  if (time) s.setSun({ on: true, minutes: Number(time[1]) * 60 + Number(time[2]) });
  const walk = q.get('walk') === '1';
  if (walk || !initial) useStudio.getState().setWalk(walk);
}

function sameParams(a: Record<string, string>, b: Record<string, string>, keys: readonly string[]): boolean {
  return keys.every((k) => a[k] === b[k]);
}

/**
 * Keeps the URL in step with the store: a new history entry for a new mode,
 * view, level, cutaway, sun date or walk; the time of day only replaces the
 * current entry (and not at all while the day is playing).
 */
export function useUrlState(): void {
  useEffect(() => {
    let applying = false;
    let last = stateParams(useStudio.getState());
    const write = (s: StudioState) => {
      if (applying) return;
      const next = stateParams(s);
      if (sameParams(next, last, OWN)) return;
      if (s.sun.playing && sameParams(next, last, ['mode', 'level', 'view', 'cut', 'sun', 'walk'])) return;
      const q = new URLSearchParams(location.search);
      for (const k of OWN) q.delete(k);
      for (const [k, v] of Object.entries(next)) q.set(k, v);
      const qs = q.toString();
      const url = `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`;
      const onlyTime = sameParams(next, last, ['mode', 'level', 'view', 'cut', 'sun', 'walk']);
      if (onlyTime) history.replaceState(history.state, '', url);
      else history.pushState(history.state, '', url);
      last = next;
    };
    const unsub = useStudio.subscribe(write);
    // The URL may already be behind the store (initial params were applied before).
    write(useStudio.getState());
    const onPop = () => {
      applying = true;
      try {
        applyParams(new URLSearchParams(location.search), false);
      } finally {
        applying = false;
        last = stateParams(useStudio.getState());
      }
    };
    window.addEventListener('popstate', onPop);
    return () => {
      unsub();
      window.removeEventListener('popstate', onPop);
    };
  }, []);
}
