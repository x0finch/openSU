import type { ResolvedHouse } from '@opensu/model';
import type { FrameInsets } from '@opensu/render';
import { cameras as camTokens } from '@opensu/render/tokens';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { type StudioState, useStudio } from '../lib/store';
import { sunDate } from '../lib/sun';
import { cutawayPreset, presetById, shownCut } from '../lib/views';
import type { Engine } from './engine';
import { Loading } from './Loading';
import { walkBridge } from './walk-bridge';

declare global {
  interface Window {
    /** Test hooks for the smoke test / screenshot script. */
    __studio?: { ready3d?: boolean; engine?: Engine; planReady?: boolean; growing?: boolean; store?: unknown; chat?: unknown };
  }
}

function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** Framed on the house with its trees and entourage (wide frame), not the architecture alone. */
let wideFraming = false;
/**
 * The studio's controls already keep the house clear of them (framing
 * insets), so the white margin inside the free area is a fraction of the
 * renderer's (task 015: the approved layout shows the house that large).
 * `?frame=full` keeps the renderer's own margin (comparison with its shots).
 */
let marginScale = 1;

function scenePreset(s: StudioState) {
  const p0 = presetById(s.view);
  const p = shownCut(s) ? cutawayPreset(p0) : p0;
  return marginScale !== 1 ? { ...p, margin: (p.margin ?? camTokens.margin) * marginScale } : p;
}

/** Applies the store's sun study to the engine and reports the sun back (for the time bar). */
function applySun(e: Engine, s: StudioState): void {
  // Seasons of the site: the winter solstice is in June south of the equator.
  const date = sunDate(s.sun.dateId, s.house?.site.latitude);
  e.setSun(s.sun.on ? { date, minutes: s.sun.minutes } : null);
  const sun = e.sunAt(date, s.sun.minutes);
  const info = {
    date,
    sunrise: sun.times.sunrise ?? 0,
    sunset: sun.times.sunset ?? 1439,
    minutes: sun.minutes,
    azimuth: sun.trueAzimuthDeg,
    elevation: sun.trueElevationDeg,
    solarNoon: sun.times.solarNoon,
    utcOffsetHours: sun.utcOffsetHours,
  };
  const cur = s.sunInfo;
  if (!cur || (Object.keys(info) as (keyof typeof info)[]).some((k) => info[k] !== cur[k])) s.setSunInfo(info);
  // A new place, time zone or date can move sunrise / sunset: the same clock
  // time is kept while it is daylight there, otherwise it is clamped (the
  // store then calls this again with a time inside the day).
  const clamped = Math.min(Math.floor(info.sunset), Math.max(Math.ceil(info.sunrise), s.sun.minutes));
  if (!s.sun.playing && clamped !== s.sun.minutes && info.sunset > info.sunrise) s.setSun({ minutes: clamped });
}

/**
 * The 3D view. `insets` are the screen areas taken by floating controls
 * (alternatives: the one showing the house largest wins); a change re-frames
 * the house in `insetMs` (the phone sheet passes its own slide duration).
 */
export function Viewer3D({ resolved, active, insets, insetMs, compact = false, wide = compact, margin = 1 }: { resolved: ResolvedHouse; active: boolean; insets: readonly FrameInsets[]; insetMs?: number; compact?: boolean; wide?: boolean; margin?: number }) {
  wideFraming = wide;
  marginScale = margin;
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const needle = useRef<SVGSVGElement | null>(null);
  const northDeg = useRef(0);
  const setNeedle = (el: SVGSVGElement | null) => {
    needle.current = el;
    if (el) el.style.transform = `rotate(${northDeg.current.toFixed(1)}deg)`;
  };
  const view = useStudio((s) => s.view);
  const nonce = useStudio((s) => s.viewNonce);
  const cut = useStudio((s) => s.cut);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // The engine is created once; later houses are swapped in (see below).
  const latest = useRef(resolved);
  latest.current = resolved;
  const shown = useRef<ResolvedHouse | null>(null);
  const grown = useRef(useStudio.getState().grow?.nonce ?? 0);
  const insetsRef = useRef(insets);
  insetsRef.current = insets;

  useEffect(() => {
    if (!hasWebGL2()) {
      setStatus('error');
      return;
    }
    let alive = true;
    // Never on the server: keeps three.js out of the Worker bundle.
    if (import.meta.env.SSR) return;
    void import('./engine').then((m) => {
      if (!alive || !ref.current) return;
      try {
        const dpr = new URLSearchParams(location.search).get('dpr');
        const e = m.createEngine(ref.current, latest.current, {
          pixelRatio: dpr ? Number(dpr) : undefined,
          wideFrame: wideFraming,
          onNorth: (deg) => {
            northDeg.current = deg;
            if (needle.current) needle.current.style.transform = `rotate(${deg.toFixed(1)}deg)`;
          },
        });
        const st = useStudio.getState();
        e.setInsets(insetsRef.current, true);
        e.onMoved((m) => useStudio.getState().setViewMoved(m));
        e.setView(scenePreset(st), shownCut(st), true);
        applySun(e, st);
        engine.current = e;
        shown.current = latest.current;
        walkBridge.attach(e);
        if (st.walk) e.enterWalk();
        window.__studio = { ...window.__studio, engine: e, ready3d: true };
        setStatus('ready');
      } catch (err) {
        console.error(err);
        setStatus('error');
      }
    });
    return () => {
      alive = false;
      walkBridge.attach(null);
      engine.current?.dispose();
      engine.current = null;
      if (window.__studio) window.__studio.ready3d = false;
    };
  }, []);

  // A changed house: swap it in and play the grow transition when asked.
  useEffect(() => {
    const e = engine.current;
    if (!e || shown.current === resolved) return;
    e.setHouse(resolved);
    shown.current = resolved;
    // The store's house changed before the engine had the new site (the
    // subscription below ran too early): place, time zone and orientation
    // reach the sun strip, the slider range and the shadows now.
    applySun(e, useStudio.getState());
    const g = useStudio.getState().grow;
    if (g && g.nonce !== grown.current) {
      grown.current = g.nonce;
      if (window.__studio) window.__studio.growing = true;
      void e.playGrow(g.fromLevel).then(() => {
        if (window.__studio) window.__studio.growing = false;
      });
    }
  }, [resolved]);

  // Phones frame the house with its trees, so the whole picture is centred.
  useEffect(() => {
    engine.current?.setWideFrame(wide);
  }, [wide]);

  useEffect(() => {
    const st = useStudio.getState();
    engine.current?.setView(scenePreset(st), shownCut(st));
  }, [view, nonce, cut, wide, margin]);

  // Floating UI changed (chat panel opened / closed, resize): re-frame around it.
  const insetKey = JSON.stringify(insets);
  const insetMsRef = useRef(insetMs);
  insetMsRef.current = insetMs;
  useEffect(() => {
    engine.current?.setInsets(insetsRef.current, false, insetMsRef.current);
  }, [insetKey]);

  // Walk mode on / off.
  const walk = useStudio((s) => s.walk);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    if (walk && !e.walking) e.enterWalk();
    else if (!walk && e.walking) e.exitWalk();
  }, [walk]);

  // Sun study: straight from the store to the engine (no React render per slider step).
  useEffect(
    () =>
      useStudio.subscribe((s, prev) => {
        if (engine.current && (s.sun !== prev.sun || s.house !== prev.house)) applySun(engine.current, s);
      }),
    [],
  );

  // Double-click / double-tap on the drawing goes back to the preset framing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastUp = 0;
    let downAt = { x: 0, y: 0, t: 0 };
    const reset = () => {
      const s = useStudio.getState();
      if (!s.walk) s.resetView();
    };
    const down = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const now = performance.now();
      // A tap: short and still. Two taps within 320 ms reset.
      if (now - downAt.t > 250 || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 10) return;
      if (now - lastUp < 320) {
        lastUp = 0;
        reset();
      } else lastUp = now;
    };
    el.addEventListener('dblclick', reset);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('dblclick', reset);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
    };
  }, []);

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
      {/* North, bottom-right on desktop; phones have no free corner for it (the toolbar is there). */}
      {status === 'ready' && active && !walk && !compact && (
        <div
          className="glass pointer-events-none absolute right-6 bottom-6 grid size-12 place-items-center rounded-full"
          role="img"
          aria-label={t('north')}
        >
          <svg ref={setNeedle} viewBox="0 0 32 32" className="size-9" aria-hidden="true">
            <text x="16" y="8.5" textAnchor="middle" fontSize="8" fontWeight="600" fill="currentColor">
              N
            </text>
            <path d="M16 10.5 19.6 21 16 19.4 12.4 21Z" fill="currentColor" />
            <path d="M16 10.5 16 19.4 12.4 21Z" fill="var(--color-accent)" />
            <circle cx="16" cy="16" r="13.5" fill="none" stroke="var(--color-hairline)" strokeWidth="1" />
          </svg>
        </div>
      )}
      {status === 'loading' && <Loading label={t('loading3d')} />}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-ink-2">{t('error.webgl')}</div>
      )}
    </div>
  );
}
