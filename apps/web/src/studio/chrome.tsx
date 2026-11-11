// Studio chrome: floating controls over the drawing (desktop) and their
// bottom-sheet counterparts (phone).
import { Link } from '@tanstack/react-router';
import { type PointerEvent as RPointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CloseIcon, FitIcon, LayersIcon, Mark, MinusIcon, PauseIcon, PlayIcon, PlusIcon, ResetViewIcon, SparkIcon, SunIcon, ViewIcon,
} from '../components/icons';
import { Caption, cx, IconButton, LangToggle, Segmented, Tip } from '../components/ui';
import { levelName, type MessageKey, useT } from '../lib/i18n';
import { type Mode, SUN_DATES, type SunDateId, useStudio } from '../lib/store';
import { resetToTemplate } from '../lib/autosave';
import { compass, hhmm, hourTicks } from '../lib/sun';
import { presetById, VIEW_GROUPS } from '../lib/views';
import type { Derived, LevelInfo } from './house-data';
import { planCommands } from './PlanView';
import { WalkButton } from './WalkHUD';

const fmtArea = (a: number) => (Math.round(a * 10) / 10).toFixed(1);
const fmtLen = (m: number) => String(Math.round(m * 10) / 10);

function useFacts(d: Derived | null) {
  const t = useT();
  if (!d) return null;
  return {
    plot: `${fmtLen(d.plot.width)} × ${fmtLen(d.plot.depth)} m`,
    area: `${fmtArea(d.area)} m²`,
    storeys: d.attic ? t('facts.storeysAttic', { n: d.storeys }) : t('facts.storeysValue', { n: d.storeys }),
  };
}

/** The house's own name; the internal golden benchmark shows its style title instead. */
function projectTitle(t: ReturnType<typeof useT>, house: { name: string; style: string } | null | undefined): string {
  if (house?.name && !house.name.startsWith('Golden sample')) return house.name;
  const key = `project.title.${house?.style ?? 'modern-pitched'}` as MessageKey;
  return t(key) || house?.style || '';
}

/**
 * Starts over from the template house (two steps: the first click asks).
 * Edits and the chat are autosaved in this browser until then.
 */
export function ResetHouse({ className }: { className?: string }) {
  const t = useT();
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!ask) return;
    const id = window.setTimeout(() => setAsk(false), 4000);
    return () => clearTimeout(id);
  }, [ask]);
  return (
    <div className={cx('flex items-center gap-2 text-xs', className)}>
      <button
        type="button"
        onClick={() => {
          if (!ask) setAsk(true);
          else {
            setAsk(false);
            void resetToTemplate();
          }
        }}
        className={cx(
          'inline-flex h-8 items-center gap-1.5 rounded-[7px] px-2 font-medium transition-colors',
          ask ? 'bg-ink text-white' : '-ml-2 text-ink-2 hover:bg-wash hover:text-ink',
        )}
        data-testid="reset-house"
        title={ask ? undefined : t('house.autosaved')}
      >
        <ResetViewIcon width={14} height={14} />
        {ask ? t('house.resetConfirm') : t('house.reset')}
      </button>

    </div>
  );
}

function Skeleton({ w }: { w: number }) {
  return <span className="inline-block h-3 rounded-sm bg-wash align-middle" style={{ width: w }} />;
}

/* ------------------------------------------------------------------ */
/* Desktop                                                             */
/* ------------------------------------------------------------------ */

export function TitleBlock({ derived, onRect }: { derived: Derived | null; onRect?: (r: { right: number; bottom: number }) => void }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  // Reports the block's extent (the 3D view frames the house clear of it).
  useEffect(() => {
    const el = box.current;
    if (!el || !onRect) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      onRect({ right: Math.round(r.right), bottom: Math.round(r.bottom) });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onRect]);
  const facts = useFacts(derived);
  const house = useStudio((s) => s.house);
  const chatOpen = useStudio((s) => s.chatOpen);
  const rows: [MessageKey, string | undefined][] = [
    ['facts.plot', facts?.plot],
    ['facts.area', facts?.area],
    ['facts.storeys', facts?.storeys],
  ];
  return (
    <div ref={box} className="pointer-events-auto absolute top-5 left-6 max-w-[300px]">
      <Link to="/" className="inline-flex items-center gap-1.5 text-ink transition-opacity hover:opacity-70" aria-label="openSU">
        <Mark width={18} height={18} />
        <span className="text-[13px] font-semibold tracking-tight">openSU</span>
      </Link>
      <h1 className="mt-5 text-[20px] leading-7 font-semibold tracking-[-0.01em] text-balance">
        {projectTitle(t, house)}
        <span className="ml-2 inline-block translate-y-[-2px] rounded-[5px] border border-hairline px-1.5 align-middle text-2xs font-normal tracking-normal text-ink-2">
          {t('project.sample')}
        </span>
      </h1>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-2">{t(k)}</dt>
            <dd className="tnum text-ink">{v ?? <Skeleton w={72} />}</dd>
          </div>
        ))}
      </dl>
      {/* The assistant panel opens below the facts: the reset row makes way. */}
      {!chatOpen && <ResetHouse className="mt-2" />}
    </div>
  );
}

export function ModeSwitch({ size = 'md', className }: { size?: 'md' | 'lg'; className?: string }) {
  const t = useT();
  const mode = useStudio((s) => s.mode);
  const setMode = useStudio((s) => s.setMode);
  return (
    <Segmented<Mode>
      label={t('mode.label')}
      size={size}
      value={mode}
      onChange={setMode}
      className={className}
      segments={[
        { value: '3d', label: t('mode.3d') },
        { value: 'plan', label: t('mode.plan') },
        { value: 'sheet', label: t('mode.sheet') },
      ]}
    />
  );
}

export function ViewRail() {
  const t = useT();
  const walk = useStudio((s) => s.walk);
  // A preset shows as pressed only while the camera is still on it.
  const view = useStudio((s) => (walk || s.viewMoved ? null : s.view));
  const setView = useStudio((s) => s.setView);
  return (
    <nav aria-label={t('views.label')} className="glass pointer-events-auto flex w-[52px] flex-col items-center rounded-ui py-2">
      {VIEW_GROUPS.map((g, gi) => (
        <div key={g.key} className={cx('flex flex-col items-center gap-0.5', gi > 0 && 'mt-2 border-t border-hairline pt-2')}>
          <Caption className="mb-1 text-center tracking-normal normal-case">{t(g.key)}</Caption>
          {g.ids.map((id) => (
            <IconButton key={id} label={t(`view.${id}`)} active={view === id} aria-pressed={view === id} onClick={() => setView(id)}>
              <ViewIcon id={id} width={22} height={22} />
            </IconButton>
          ))}
        </div>
      ))}
      <div className="mt-2 flex flex-col items-center gap-0.5 border-t border-hairline pt-2">
        <Caption className="mb-1 text-center tracking-normal normal-case">{t('walk.enter')}</Caption>
        <WalkButton />
      </div>
    </nav>
  );
}

function levelShort(lang: 'zh' | 'en', l: LevelInfo): string {
  if (lang === 'zh') return l.name;
  return l.isAttic ? 'Attic' : `L${l.index + 1}`;
}

export function LevelRail({ levels }: { levels: LevelInfo[] }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const level = useStudio((s) => s.level);
  const setLevel = useStudio((s) => s.setLevel);
  return (
    <nav aria-label={t('levels.label')} className="glass pointer-events-auto flex w-[52px] flex-col items-center rounded-ui py-2">
      <Caption className="mb-1 text-center tracking-normal normal-case">{t('levels.label')}</Caption>
      <div className="flex flex-col gap-0.5">
        {[...levels].reverse().map((l) => (
          <Tip key={l.id} label={levelName(lang, l.name, l.index, l.isAttic)} side="left">
            <button
              type="button"
              aria-pressed={level === l.id}
              onClick={() => setLevel(l.id)}
              className={cx(
                'grid h-10 w-10 place-items-center rounded-sm text-[13px] font-medium transition-colors',
                level === l.id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-wash hover:text-ink',
              )}
            >
              {levelShort(lang, l)}
            </button>
          </Tip>
        ))}
      </div>
    </nav>
  );
}

/** Time of day on a sunrise..sunset track, with a play button (the sun study). */
export function SunTime({ className }: { className?: string }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const sun = useStudio((s) => s.sun);
  const info = useStudio((s) => s.sunInfo);
  const setSun = useStudio((s) => s.setSun);
  const lo = Math.ceil(info?.sunrise ?? 360);
  const hi = Math.floor(info?.sunset ?? 1080);
  const value = Math.min(hi, Math.max(lo, sun.minutes));
  const fill = ((value - lo) / Math.max(1, hi - lo)) * 100;
  const play = () => {
    if (sun.playing) setSun({ playing: false });
    else setSun({ on: true, playing: true, minutes: value >= hi - 5 ? lo : value });
  };
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <button
        type="button"
        onClick={play}
        aria-label={sun.playing ? t('sun.pause') : t('sun.play')}
        aria-pressed={sun.playing}
        className={cx(
          'grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-150',
          sun.on ? 'bg-accent text-ink hover:brightness-95' : 'bg-wash text-ink hover:bg-accent',
        )}
      >
        {sun.playing ? <PauseIcon width={16} height={16} /> : <PlayIcon width={16} height={16} className="translate-x-px" />}
      </button>
      <div className="relative min-w-0 flex-1 pb-3.5">
        <input
          type="range"
          className={cx('range block w-full', !sun.on && 'range-idle')}
          min={lo}
          max={hi}
          step={1}
          value={value}
          onChange={(e) => setSun({ on: true, playing: false, minutes: Number(e.target.value) })}
          aria-label={t('sun.time')}
          aria-valuetext={hhmm(value)}
          style={{ ['--fill' as string]: `${fill}%` }}
        />
        <div className="tnum pointer-events-none absolute inset-x-[8px] bottom-0 h-2.5 text-[10px] leading-none text-ink-3" aria-hidden="true">
          <span className="absolute top-0 left-[-8px] text-ink-2">{hhmm(lo)}</span>
          {hourTicks(lo, hi)
            .filter((h) => h * 60 - lo > 70 && hi - h * 60 > 70)
            .map((h) => (
              <span key={h} className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: `${((h * 60 - lo) / (hi - lo)) * 100}%` }}>
                {h}
              </span>
            ))}
          <span className="absolute top-0 right-[-8px] text-ink-2">{hhmm(hi)}</span>
        </div>
      </div>
      <div className="w-[46px] shrink-0 text-right">
        <p className={cx('tnum text-[15px] leading-5 font-medium tracking-tight', sun.on ? 'text-ink' : 'text-ink-2')}>{hhmm(value)}</p>
        <p className="tnum truncate text-2xs text-ink-2" aria-live="off">{info && sun.on ? `${compass(info.azimuth, lang)} ${Math.max(0, Math.round(info.elevation))}°` : t('sun.offShort')}</p>
      </div>
    </div>
  );
}

/** Date presets of the sun study. Picking one turns the sun study on; while off, none is marked. */
export function SunDates({ className, size = 'sm' }: { className?: string; size?: 'sm' | 'lg' }) {
  const t = useT();
  const sun = useStudio((s) => s.sun);
  const setSun = useStudio((s) => s.setSun);
  return (
    <Segmented<SunDateId | ''>
      label={t('sun.dates')}
      size={size}
      value={sun.on ? sun.dateId : ''}
      onChange={(dateId) => dateId && setSun({ dateId, on: true })}
      className={className}
      segments={SUN_DATES.map((id) => ({ value: id, label: t(`sun.date.${id}`) }))}
    />
  );
}

/** Level cutaway of the 3D view: whole house or cut above a level. */
export function CutControl({ levels, size = 'sm', className }: { levels: LevelInfo[]; size?: 'sm' | 'lg'; className?: string }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const cut = useStudio((s) => s.cut);
  const setCut = useStudio((s) => s.setCut);
  // Eye level and elevations show the whole house: the kept cut is marked softly.
  const paused = useStudio((s) => !!s.cut && presetById(s.view).kind !== 'axo');
  return (
    <Segmented<string>
      label={paused ? `${t('cut.label')} · ${t('cut.paused')}` : t('cut.label')}
      size={size}
      soft={paused}
      value={cut ?? 'all'}
      onChange={(v) => setCut(v === 'all' ? null : v)}
      className={className}
      segments={[{ value: 'all', label: t('cut.all') }, ...levels.map((l) => ({ value: l.id, label: levelName(lang, l.name, l.index, l.isAttic) }))]}
    />
  );
}

/** The sun study switch: "日照" with the sun icon, pressed while the physical sun is on. */
export function SunToggle({ className, size = 'md', iconOnly }: { className?: string; size?: 'md' | 'lg'; iconOnly?: boolean }) {
  const t = useT();
  const on = useStudio((s) => s.sun.on);
  const setSun = useStudio((s) => s.setSun);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={iconOnly ? t('sun.study') : undefined}
      title={iconOnly ? t('sun.study') : undefined}
      onClick={() => setSun(on ? { on: false, playing: false } : { on: true })}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors duration-150',
        size === 'lg' ? 'h-11 rounded-sm text-sm' : 'h-8 rounded-[7px] text-[13px]',
        iconOnly ? (size === 'lg' ? 'w-11' : 'w-8') : size === 'lg' ? 'px-4' : 'pr-3 pl-2.5',
        on ? 'bg-accent text-ink hover:brightness-95' : 'bg-wash text-ink hover:bg-hairline',
        className,
      )}
    >
      <SunIcon width={size === 'lg' ? 20 : 17} height={size === 'lg' ? 20 : 17} />
      {!iconOnly && t('sun.label')}
    </button>
  );
}

function ExitSun({ className, iconOnly }: { className?: string; iconOnly?: boolean }) {
  const t = useT();
  const on = useStudio((s) => s.sun.on);
  const setSun = useStudio((s) => s.setSun);
  const exit = () => setSun({ on: false, playing: false });
  if (!on) return null;
  if (iconOnly) {
    return (
      <IconButton label={t('sun.exit')} tipSide="top" onClick={exit} className={cx('size-8', className)}>
        <CloseIcon width={16} height={16} />
      </IconButton>
    );
  }
  return (
    <button
      type="button"
      onClick={exit}
      className={cx('inline-flex h-7 items-center gap-1 rounded-[6px] pr-2 pl-1.5 text-xs whitespace-nowrap text-ink-2 transition-colors hover:bg-wash hover:text-ink', className)}
    >
      <CloseIcon width={14} height={14} />
      {t('sun.exit')}
    </button>
  );
}

/** One-line sun facts under the controls: date span or the hint. */
function SunNote() {
  const t = useT();
  const on = useStudio((s) => s.sun.on);
  const info = useStudio((s) => s.sunInfo);
  return (
    <p className="tnum truncate text-2xs text-ink-3">
      {on && info ? t('sun.span', { rise: hhmm(info.sunrise), set: hhmm(info.sunset) }) : t('sun.hint')}
    </p>
  );
}

/**
 * The 3D scene dock (desktop, bottom centre), one row: level cutaway, the
 * sun study switch, then (sun study on) its dates; the time of day with
 * play, the sun's direction and height, and exit. Wraps on narrow screens.
 */
export function SceneDock({ levels, onRect }: { levels: LevelInfo[] | null; onRect?: (r: { top: number }) => void }) {
  const t = useT();
  // No cutaway while walking: the dock keeps the sun study only.
  const walk = useStudio((s) => s.walk);
  const sunOn = useStudio((s) => s.sun.on);
  const dock = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLDivElement>(null);
  // Narrow windows: the time of day wraps to its own row (no dangling divider).
  const [wrapped, setWrapped] = useState(false);
  useLayoutEffect(() => {
    const el = dock.current;
    const tm = time.current;
    if (!el || !tm) return;
    const check = () => {
      const first = el.firstElementChild as HTMLElement | null;
      setWrapped(!!first && tm.offsetTop > first.offsetTop + 4);
      onRect?.({ top: Math.round(el.getBoundingClientRect().top) });
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener('resize', check);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [onRect, sunOn, walk]);
  return (
    <div ref={dock} className="glass pointer-events-auto flex max-w-[calc(100vw-200px)] flex-wrap items-center justify-center gap-x-1 gap-y-2 rounded-ui py-2 pr-2 pl-2.5">
      {!walk && (
        <>
          <div className="flex items-center gap-1">
            <Tip label={t('cut.label')} side="top">
              <span className="grid size-8 place-items-center text-ink-2" aria-hidden="true">
                <LayersIcon width={18} height={18} />
              </span>
            </Tip>
            {levels ? <CutControl levels={levels} /> : <Skeleton w={160} />}
          </div>
          <span className="mx-2 h-5 w-px bg-hairline" aria-hidden="true" />
        </>
      )}
      <div className="flex items-center gap-1.5" role="group" aria-label={t('sun.study')}>
        <SunToggle />
        {sunOn && <SunDates />}
      </div>
      <span className={cx('mx-2 h-5 w-px bg-hairline', wrapped && 'invisible w-0 mx-0')} aria-hidden="true" />
      <div ref={time} className={cx('flex items-center gap-1', sunOn ? 'w-[400px]' : 'w-[320px]')}>
        <SunTime className="min-w-0 flex-1" />
        <ExitSun iconOnly />
      </div>
    </div>
  );
}

/** Sweeps the day in ~8 s while `sun.playing` (one loop for the whole studio). */
export function useSunPlayer(): void {
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const s = useStudio.getState();
      if (!s.sun.playing) {
        raf = 0;
        return;
      }
      const info = s.sunInfo;
      if (info) {
        const dt = last ? Math.min(100, now - last) : 0;
        const m = Math.max(s.sun.minutes, info.sunrise) + ((info.sunset - info.sunrise) * dt) / PLAY_MS;
        if (m >= info.sunset) {
          s.setSun({ minutes: info.sunset, playing: false });
          raf = 0;
          return;
        }
        s.setSun({ minutes: m });
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    const unsub = useStudio.subscribe((s, p) => {
      if (s.sun.playing && !p.sun.playing && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    });
    return () => {
      unsub();
      cancelAnimationFrame(raf);
    };
  }, []);
}

/** Duration of one sunrise..sunset sweep. */
const PLAY_MS = 8000;

export function ZoomCluster({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  const t = useT();
  const mode = useStudio((s) => s.mode);
  const resetView = useStudio((s) => s.resetView);
  const btn = size === 'lg' ? 'size-11' : '';
  if (mode === '3d') {
    return (
      <div className={cx('flex gap-0.5', className)}>
        <IconButton className={btn} label={t('view.reset')} tipSide="top" onClick={resetView}>
          <ResetViewIcon />
        </IconButton>
      </div>
    );
  }
  return (
    <div className={cx('flex gap-0.5', className)}>
      <IconButton className={btn} label={t('plan.zoomOut')} tipSide="top" onClick={() => planCommands.zoom(1 / 1.4)}>
        <MinusIcon />
      </IconButton>
      <IconButton className={btn} label={t('plan.fit')} tipSide="top" onClick={() => planCommands.fit()}>
        <FitIcon />
      </IconButton>
      <IconButton className={btn} label={t('plan.zoomIn')} tipSide="top" onClick={() => planCommands.zoom(1.4)}>
        <PlusIcon />
      </IconButton>
    </div>
  );
}

// The assistant (left rail on desktop, sheet on phones) lives in src/chat.
export { ChatRail, MobileChat } from '../chat/ChatPanel';

/* ------------------------------------------------------------------ */
/* Phone                                                               */
/* ------------------------------------------------------------------ */

export function MobileHeader({ derived }: { derived: Derived | null }) {
  const t = useT();
  const facts = useFacts(derived);
  const house = useStudio((s) => s.house);
  const setChat = useStudio((s) => s.setChatOpen);
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-white via-white/85 to-transparent px-4 pt-[max(4px,env(safe-area-inset-top))] pb-6 land:pb-2">
      <div className="flex h-11 items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="pointer-events-auto -ml-1 inline-flex h-11 shrink-0 items-center gap-1.5 px-1" aria-label="openSU">
            <Mark width={16} height={16} />
            <span className="text-xs font-semibold tracking-tight">openSU</span>
          </Link>
          <p className="hidden min-w-0 truncate text-sm land:block">
            <span className="font-semibold">{projectTitle(t, house)}</span>
            <span className="tnum ml-2 text-xs text-ink-2">{facts ? `${facts.plot} · ${facts.area}` : ''}</span>
          </p>
        </div>
        <div className="pointer-events-auto -mr-1.5 flex items-center">
          <LangToggle size="lg" />
          <button type="button" onClick={() => setChat(true)} aria-label={t('chat.open')} className="grid size-11 place-items-center">
            <span className="glass grid size-9 place-items-center rounded-full">
              <SparkIcon accent width={19} height={19} />
            </span>
          </button>
        </div>
      </div>
      <div className="min-w-0 land:hidden">
        <h1 className="truncate text-[17px] leading-6 font-semibold">{projectTitle(t, house)}</h1>
        <p className="tnum mt-0.5 truncate text-xs text-ink-2">
          {facts ? `${facts.plot} · ${facts.area} · ${facts.storeys}` : <Skeleton w={180} />}
        </p>
      </div>
    </header>
  );
}

/** Bottom sheet with the controls; reports its height so the canvas sits above it. */
export function MobileSheet({ derived, onHeight }: { derived: Derived | null; onHeight: (h: number) => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const mode = useStudio((s) => s.mode);
  const open = useStudio((s) => s.sheetOpen);
  const setOpen = useStudio((s) => s.setSheetOpen);
  const view = useStudio((s) => (s.viewMoved ? null : s.view));
  const setView = useStudio((s) => s.setView);
  const lang = useStudio((s) => s.lang);
  const level = useStudio((s) => s.level);
  const setLevel = useStudio((s) => s.setLevel);
  const resetView = useStudio((s) => s.resetView);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  // Drag the handle down to collapse, up to expand.
  const start = useRef<number | null>(null);
  const onDown = (e: RPointerEvent) => {
    start.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    if (start.current !== null) setDragY(e.clientY - start.current);
  };
  const dragged = useRef(false);
  const onUp = () => {
    if (start.current === null) return;
    dragged.current = Math.abs(dragY) >= 6;
    if (dragY > 30) setOpen(false);
    else if (dragY < -30) setOpen(true);
    start.current = null;
    setDragY(0);
  };
  // Tap and keyboard toggle; a drag already decided in onUp.
  const onClick = () => {
    if (dragged.current) dragged.current = false;
    else setOpen(!open);
  };

  const views = VIEW_GROUPS.flatMap((g) => g.ids);
  return (
    <div
      ref={ref}
      className="absolute inset-x-0 bottom-0 z-20 rounded-t-[14px] border-t border-hairline bg-white pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(0,0,0,0.06)]"
    >
      <button
        type="button"
        aria-label={open ? t('sheet.collapse') : t('sheet.expand')}
        aria-expanded={open}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={onClick}
        className="flex h-6 w-full touch-none items-start justify-center pt-2"
      >
        <span className="h-1 w-9 rounded-full bg-hairline" />
      </button>
      <div className="px-4">
        {/* Sideways: mode and time share one row. */}
        <div className="land:flex land:items-center land:gap-4">
          <ModeSwitch size="lg" className="bg-wash land:w-[300px] land:shrink-0" />
          {mode === '3d' && (
            <div className="mt-3 flex h-11 items-center gap-2 land:mt-0 land:min-w-0 land:flex-1">
              <SunToggle size="lg" iconOnly />
              <SunTime className="min-w-0 flex-1" />
            </div>
          )}
        </div>
        {/* Plan: the level switch stays reachable with the sheet folded. */}
        {mode === 'plan' && derived && level && (
          <Segmented
            label={t('levels.label')}
            size="lg"
            value={level}
            onChange={setLevel}
            className="mt-2 bg-wash"
            segments={derived.levels.map((l) => ({ value: l.id, label: levelName(lang, l.name, l.index, l.isAttic) }))}
          />
        )}
        <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out-soft', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="min-h-0 overflow-hidden" inert={!open}>
            {mode === '3d' && (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <SunDates size="lg" className="flex-1" />
                </div>
                <div className="mt-1.5 flex h-7 items-center justify-between gap-2">
                  <SunNote />
                  <ExitSun className="-mr-2 shrink-0" />
                </div>
                <Caption className="mt-3 tracking-normal normal-case">{t('cut.label')}</Caption>
                <div className="mt-2">{derived ? <CutControl levels={derived.levels} size="lg" className="bg-wash p-1" /> : <Skeleton w={200} />}</div>
                <Caption className="mt-4 tracking-normal normal-case">{t('views.label')}</Caption>
                <div className="mt-2 mb-1 grid grid-cols-6 gap-1.5" role="group" aria-label={t('views.label')}>
                  {views.map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={view === id}
                      aria-label={t(`view.${id}`)}
                      onClick={() => setView(id)}
                      className={cx(
                        'flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-sm transition-colors',
                        view === id ? 'bg-ink text-white' : 'bg-wash text-ink',
                      )}
                    >
                      <ViewIcon id={id} width={18} height={18} />
                      <span className={cx('text-2xs', view === id ? 'text-white/80' : 'text-ink-2')}>{t(`viewShort.${id}`)}</span>
                    </button>
                  ))}
                  <WalkButton variant="tile" />
                  <button
                    type="button"
                    onClick={resetView}
                    aria-label={t('view.reset')}
                    className="flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-sm border border-hairline text-ink"
                  >
                    <ResetViewIcon width={18} height={18} />
                    <span className="text-2xs text-ink-2">{t('view.resetShort')}</span>
                  </button>
                </div>
              </>
            )}
            {mode === 'plan' && <p className="mt-3 mb-1 text-xs leading-5 text-ink-3">{t('plan.gesture')}</p>}
            {mode === 'sheet' && <p className="mt-3 mb-1 text-xs leading-5 text-ink-3">{t('sheets.hint')}</p>}
            <ResetHouse className="mt-3 mb-1 border-t border-hairline pt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
