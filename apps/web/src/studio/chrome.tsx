// Studio chrome: floating controls over the drawing (desktop) and their
// bottom-sheet counterparts (phone).
import { Link } from '@tanstack/react-router';
import { type PointerEvent as RPointerEvent, useEffect, useRef, useState } from 'react';
import {
  ChevronRightIcon, CloseIcon, FitIcon, LayersIcon, Mark, MinusIcon, PauseIcon, PlayIcon, PlusIcon, ResetViewIcon, SendIcon, SparkIcon, SunIcon, ViewIcon,
} from '../components/icons';
import { Caption, cx, IconButton, LangToggle, Segmented, Tip } from '../components/ui';
import { levelName, type MessageKey, useT } from '../lib/i18n';
import { type Mode, SUN_DATES, type SunDateId, useStudio } from '../lib/store';
import { compass, hhmm, hourTicks } from '../lib/sun';
import { VIEW_GROUPS } from '../lib/views';
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

function projectTitle(t: ReturnType<typeof useT>, style: string | undefined): string {
  const key = `project.title.${style ?? 'modern-pitched'}` as MessageKey;
  return t(key) || style || '';
}

function Skeleton({ w }: { w: number }) {
  return <span className="inline-block h-3 rounded-sm bg-wash align-middle" style={{ width: w }} />;
}

/* ------------------------------------------------------------------ */
/* Desktop                                                             */
/* ------------------------------------------------------------------ */

export function TitleBlock({ derived }: { derived: Derived | null }) {
  const t = useT();
  const facts = useFacts(derived);
  const style = useStudio((s) => s.house?.style);
  const rows: [MessageKey, string | undefined][] = [
    ['facts.plot', facts?.plot],
    ['facts.area', facts?.area],
    ['facts.storeys', facts?.storeys],
  ];
  return (
    <div className="pointer-events-auto absolute top-5 left-6 w-[300px]">
      <Link to="/" className="inline-flex items-center gap-1.5 text-ink transition-opacity hover:opacity-70" aria-label="openSU">
        <Mark width={18} height={18} />
        <span className="text-[13px] font-semibold tracking-tight">openSU</span>
      </Link>
      <h1 className="mt-5 text-[20px] leading-7 font-semibold tracking-[-0.01em] text-balance">
        {projectTitle(t, style)}
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
  const view = useStudio((s) => (walk ? null : s.view));
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
        <p className="tnum truncate text-2xs text-ink-3">{info && sun.on ? `${compass(info.azimuth, lang)} ${Math.max(0, Math.round(info.elevation))}°` : t('sun.label')}</p>
      </div>
    </div>
  );
}

/** Date presets of the sun study. Picking one turns the sun study on. */
export function SunDates({ className }: { className?: string }) {
  const t = useT();
  const sun = useStudio((s) => s.sun);
  const setSun = useStudio((s) => s.setSun);
  return (
    <Segmented<SunDateId>
      label={t('sun.dates')}
      size="sm"
      soft={!sun.on}
      value={sun.dateId}
      onChange={(dateId) => setSun({ dateId, on: true })}
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
  return (
    <Segmented<string>
      label={t('cut.label')}
      size={size}
      value={cut ?? 'all'}
      onChange={(v) => setCut(v === 'all' ? null : v)}
      className={className}
      segments={[{ value: 'all', label: t('cut.all') }, ...levels.map((l) => ({ value: l.id, label: levelName(lang, l.name, l.index, l.isAttic) }))]}
    />
  );
}

function ExitSun({ className, iconOnly }: { className?: string; iconOnly?: boolean }) {
  const t = useT();
  const on = useStudio((s) => s.sun.on);
  const setSun = useStudio((s) => s.setSun);
  const exit = () => setSun({ on: false, playing: false });
  if (iconOnly) {
    // Keeps its place when off, so the dock does not jump.
    return (
      <IconButton label={t('sun.exit')} tipSide="top" onClick={exit} disabled={!on} className={cx('size-8', !on && 'invisible', className)}>
        <CloseIcon width={16} height={16} />
      </IconButton>
    );
  }
  if (!on) return null;
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
 * The 3D scene dock (desktop, bottom centre), one row: level cutaway, sun
 * study date, then the time of day. Wraps to two rows on narrow screens.
 */
export function SceneDock({ levels }: { levels: LevelInfo[] | null }) {
  const t = useT();
  // No cutaway while walking: the dock keeps the sun study only.
  const walk = useStudio((s) => s.walk);
  return (
    <div className="glass pointer-events-auto flex max-w-[calc(100vw-200px)] flex-wrap items-center justify-center gap-x-1 gap-y-2 rounded-ui py-2 pr-2 pl-2.5">
      {!walk && (
        <>
          <div className="flex items-center gap-1">
            <Tip label={t('cut.label')} side="top">
              <span className="grid size-7 place-items-center text-ink-2" aria-hidden="true">
                <LayersIcon width={18} height={18} />
              </span>
            </Tip>
            {levels ? <CutControl levels={levels} /> : <Skeleton w={160} />}
          </div>
          <span className="mx-2 h-5 w-px bg-hairline" aria-hidden="true" />
        </>
      )}
      <div className="flex items-center gap-1">
        <Tip label={t('sun.study')} side="top">
          <span className="grid size-7 place-items-center text-ink-2" aria-hidden="true">
            <SunIcon width={18} height={18} />
          </span>
        </Tip>
        <SunDates />
      </div>
      <span className="mx-2 h-5 w-px bg-hairline" aria-hidden="true" />
      <div className="flex w-[400px] items-center gap-1">
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

function ChatPanel({ onClose, className }: { onClose: () => void; className?: string }) {
  const t = useT();
  return (
    <section aria-label={t('chat.title')} className={cx('glass pointer-events-auto flex flex-col rounded-ui', className)}>
      <header className="flex h-12 items-center justify-between border-b border-hairline pr-1.5 pl-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <SparkIcon accent width={18} height={18} />
          {t('chat.title')}
        </h2>
        <IconButton label={t('chat.close')} tip={false} onClick={onClose}>
          <CloseIcon width={18} height={18} />
        </IconButton>
      </header>
      <div className="flex-1 px-4 py-4">
        <span className="inline-block rounded-[5px] bg-wash px-1.5 py-0.5 text-2xs text-ink-2">{t('soon')}</span>
        <p className="mt-2.5 text-sm leading-6 text-ink-2">{t('chat.body')}</p>
      </div>
      <div className="p-3 pt-0">
        <div className="flex h-11 items-center gap-2 rounded-sm border border-hairline bg-white pr-1 pl-3">
          <input disabled placeholder={t('chat.placeholder')} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3" aria-label={t('chat.placeholder')} />
          <button type="button" disabled aria-label={t('chat.send')} className="grid size-9 place-items-center rounded-[6px] bg-wash text-ink-3">
            <SendIcon width={16} height={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

export function ChatRail() {
  const t = useT();
  const open = useStudio((s) => s.chatOpen);
  const setOpen = useStudio((s) => s.setChatOpen);
  if (open) return <ChatPanel onClose={() => setOpen(false)} className="w-[320px]" />;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t('chat.open')}
      aria-expanded={false}
      className="glass group pointer-events-auto flex w-[52px] flex-col items-center gap-1.5 rounded-ui pt-3.5 pb-3 text-ink transition-colors hover:bg-white"
    >
      <SparkIcon accent width={22} height={22} className="transition-transform duration-300 ease-out-soft group-hover:rotate-12" />
      <span className="text-xs font-medium text-ink-2 group-hover:text-ink">{t('chat.rail')}</span>
      <ChevronRightIcon width={16} height={16} className="mt-1 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Phone                                                               */
/* ------------------------------------------------------------------ */

export function MobileHeader({ derived }: { derived: Derived | null }) {
  const t = useT();
  const facts = useFacts(derived);
  const style = useStudio((s) => s.house?.style);
  const setChat = useStudio((s) => s.setChatOpen);
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-white via-white/85 to-transparent px-4 pt-[max(4px,env(safe-area-inset-top))] pb-6">
      <div className="flex h-11 items-center justify-between">
        <Link to="/" className="pointer-events-auto -ml-1 inline-flex h-11 items-center gap-1.5 px-1" aria-label="openSU">
          <Mark width={16} height={16} />
          <span className="text-xs font-semibold tracking-tight">openSU</span>
        </Link>
        <div className="pointer-events-auto -mr-1.5 flex items-center">
          <LangToggle size="lg" />
          <button type="button" onClick={() => setChat(true)} aria-label={t('chat.open')} className="grid size-11 place-items-center">
            <span className="glass grid size-9 place-items-center rounded-full">
              <SparkIcon accent width={19} height={19} />
            </span>
          </button>
        </div>
      </div>
      <div className="min-w-0">
        <h1 className="truncate text-[17px] leading-6 font-semibold">{projectTitle(t, style)}</h1>
        <p className="tnum mt-0.5 truncate text-xs text-ink-2">
          {facts ? `${facts.plot} · ${facts.area} · ${facts.storeys}` : <Skeleton w={180} />}
        </p>
      </div>
    </header>
  );
}

export function MobileChat() {
  const open = useStudio((s) => s.chatOpen);
  const setOpen = useStudio((s) => s.setChatOpen);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/10 p-2 pb-[max(8px,env(safe-area-inset-bottom))] animate-[fade-in_160ms_ease-out]" onClick={() => setOpen(false)}>
      <div className="w-full" onClick={(e) => e.stopPropagation()}>
        <ChatPanel onClose={() => setOpen(false)} className="w-full bg-white" />
      </div>
    </div>
  );
}

/** Bottom sheet with the controls; reports its height so the canvas sits above it. */
export function MobileSheet({ derived, onHeight }: { derived: Derived | null; onHeight: (h: number) => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const mode = useStudio((s) => s.mode);
  const open = useStudio((s) => s.sheetOpen);
  const setOpen = useStudio((s) => s.setSheetOpen);
  const view = useStudio((s) => s.view);
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
        <ModeSwitch size="lg" className="bg-wash" />
        {mode === '3d' && <SunTime className="mt-3 h-11" />}
        <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out-soft', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="min-h-0 overflow-hidden" inert={!open}>
            {mode === '3d' && (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <SunDates className="flex-1" />
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
            {mode === 'plan' && (
              <>
                <Caption className="mt-4 tracking-normal normal-case">{t('levels.label')}</Caption>
                <div className="mt-2">
                  {derived && level && (
                    <Segmented
                      label={t('levels.label')}
                      size="lg"
                      value={level}
                      onChange={setLevel}
                      className="bg-wash"
                      segments={derived.levels.map((l) => ({ value: l.id, label: levelName(lang, l.name, l.index, l.isAttic) }))}
                    />
                  )}
                </div>
                <p className="mt-3 mb-1 text-xs leading-5 text-ink-3">{t('plan.gesture')}</p>
              </>
            )}
            {mode === 'sheet' && <p className="mt-3 mb-1 text-xs leading-5 text-ink-3">{t('sheets.hint')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
