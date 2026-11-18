// The studio's tools (tasks 015, 017): one tool group (视角 / 楼层 / 日照 / 漫游) and
// the panel a tool needs, all on the glass primitives. Desktop: a glass
// group top-right, icons with name tooltips; a panel flows out of the whole
// group. Phone: a tab-bar capsule at the bottom (icon over label); the panel
// is an inset glass sheet the tool bar rides on (PhoneDock).
import { Fragment, type KeyboardEvent as RKeyboardEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronLeftIcon, ChevronRightIcon, CheckIcon, CloseIcon, CubeIcon, FitIcon, LayersIcon, MinusIcon, PauseIcon, PinIcon, PlayIcon, PlusIcon, ResetViewIcon,
  SunIcon, ViewIcon,
} from '../components/icons';
import { cx } from '../components/ui';
import { GlassButtonGroup, GlassChoice, GlassSegmented, GlassGroupButton, GlassPopover, GlassRow, GlassSep, GlassSlider, GlassTip } from '../glass';
import { levelName, type MessageKey, useT } from '../lib/i18n';
import { bearingText, bearingWords, frontBearing, placeText, utcText } from '../lib/site';
import { useViewOnly } from '../lib/view-only';
import { SUN_DATES, type SunDateId, type Tray, useStudio } from '../lib/store';
import { clock, compass, dayText, hourTicks, sunDate } from '../lib/sun';
import { DEFAULT_VIEW, presetById, type ViewId } from '../lib/views';
import type { Derived } from './house-data';
import { planCommands } from './PlanView';
import { LocationPanel, OrientationPanel } from './SitePanels';
import { WalkIcon } from './walk-icon';

/** Height of a level cutaway above its floor, m (the kernel's CUT_HEIGHT, 1250 mm). */
const CUT_HEIGHT_M = 1.25;

export const TRAY_ID: Record<Tray, string> = { views: 'tray-views', levels: 'tray-levels', sun: 'tray-sun' };

/** The panel that is open, if any: a site panel (location, orientation) or a tool's panel. */
export function useOpenPanel(): Tray | 'site' | null {
  return useStudio((s) => {
    if (s.mode === 'sheet') return null;
    if (s.sitePanel) return 'site';
    if (!s.tray) return null;
    if (s.mode === 'plan' && s.tray !== 'levels') return null;
    return s.tray;
  });
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

/** Merge group of the desktop tool group and the popovers that flow out of it. */
export const TOOLS_GROUP = 7;

const NAMES_KEY = 'opensu.toolnames.v1';

/**
 * First visit: the tools show their names beside their icons until the
 * first tool is used (remembered in the browser), then icons only.
 */
export function useToolNames(): [boolean, () => void] {
  const [named, setNamed] = useState(false);
  useLayoutEffect(() => {
    try {
      setNamed(localStorage.getItem(NAMES_KEY) !== 'done' && !new URLSearchParams(location.search).has('nohints'));
    } catch {
      setNamed(false);
    }
  }, []);
  const used = () => {
    if (!named) return;
    setNamed(false);
    try {
      localStorage.setItem(NAMES_KEY, 'done');
    } catch {
      /* private mode: icons from now on, for this page */
    }
  };
  return [named, used];
}

/** Values the tools show in use (sun time, cut level, chosen view) and the plan view's level. */
function useToolValues(derived: Derived | null) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const cut = useStudio((s) => s.cut);
  const level = useStudio((s) => s.level);
  const view = useStudio((s) => s.view);
  const sun = useStudio((s) => s.sun);
  const polarNight = useStudio((s) => s.sunInfo?.polar === 'night');
  const lv = (id: string | null) => {
    const l = derived?.levels.find((x) => x.id === id);
    return l ? levelName(lang, l.name, l.index, l.isAttic) : null;
  };
  return {
    views: view !== DEFAULT_VIEW ? t(`viewShort.${view}` as MessageKey) || t(`view.${view}`) : null,
    levels: cut ? lv(cut) : null,
    planLevel: lv(level),
    sun: sun.on ? (polarNight ? t('sun.polarNight') : clock(sun.minutes, lang)) : null,
  };
}

/**
 * Desktop, top trailing (task 017, owner's decisions): one glass group of
 * four tools, 视角 / 楼层 / 日照 / 漫游, icons with a name tooltip below;
 * a tool in use shows its value in its icon's place; walking, 漫游 reads
 * "漫游 ×" (selected) and leaves on click or Escape. A tool's panel flows
 * out of the whole group (PanelCard). Plan view: levels and zoom.
 */
export function DesktopTools({ derived, className }: { derived: Derived | null; className?: string }) {
  const t = useT();
  const mode = useStudio((s) => s.mode);
  const tray = useStudio((s) => s.tray);
  const sitePanel = useStudio((s) => s.sitePanel);
  const setTray = useStudio((s) => s.setTray);
  const walk = useStudio((s) => s.walk);
  const setWalk = useStudio((s) => s.setWalk);
  const sun = useStudio((s) => s.sun);
  const setSun = useStudio((s) => s.setSun);
  const values = useToolValues(derived);
  const [named, used] = useToolNames();
  const open = (k: Tray) => tray === k && (!sitePanel || (k === 'sun' && !!sitePanel.fromSun));
  const icon = { width: 19, height: 19, className: 'shrink-0' };
  const tool = (k: Tray, ico: ReactNode, label: string, value: string | null, testId: string, onClick?: () => void, disabled?: boolean) => (
    <GlassGroupButton
      icon={ico}
      label={label}
      reading={open(k) ? null : value}
      named={named}
      on={open(k)}
      disabled={disabled}
      aria-expanded={open(k)}
      aria-controls={TRAY_ID[k]}
      data-testid={testId}
      data-tool-trigger=""
      className="disabled:opacity-35"
      onClick={() => {
        used();
        if (onClick) onClick();
        else setTray(open(k) ? null : k);
      }}
    />
  );
  if (mode === 'plan') {
    return (
      <div className={cx('pointer-events-none flex items-center', className)}>
        <GlassButtonGroup label={t('tools.label')} group={TOOLS_GROUP} testId="toolbar">
          {tool('levels', <LayersIcon {...icon} />, t('bar.levels'), values.planLevel, 'bar-levels')}
          <GlassGroupButton icon={<MinusIcon width={18} height={18} />} label={t('plan.zoomOut')} onClick={() => planCommands.zoom(1 / 1.4)} />
          <GlassGroupButton icon={<FitIcon width={18} height={18} />} label={t('plan.fit')} onClick={() => planCommands.fit()} />
          <GlassGroupButton icon={<PlusIcon width={18} height={18} />} label={t('plan.zoomIn')} onClick={() => planCommands.zoom(1.4)} />
        </GlassButtonGroup>
      </div>
    );
  }
  return (
    <div className={cx('pointer-events-none flex items-center', className)}>
      <GlassButtonGroup label={t('tools.label')} group={TOOLS_GROUP} testId="toolbar">
        {/* Walking, view and level do not apply: they stay in place, dimmed (the group keeps its width). */}
        {tool('views', <CubeIcon {...icon} />, t('bar.views'), values.views, 'bar-views', undefined, walk)}
        {tool('levels', <LayersIcon {...icon} />, t('bar.levels'), values.levels, 'bar-levels', undefined, walk)}
        {tool('sun', <SunIcon {...icon} />, t('bar.sun'), values.sun, 'bar-sun', () => {
          if (open('sun')) setTray(null);
          else {
            setTray('sun');
            if (!sun.on) setSun({ on: true });
          }
        })}
        <GlassGroupButton
          icon={<WalkIcon {...icon} />}
          label={walk ? t('walk.exit') : t('bar.walk')}
          named={named}
          text={walk ? `${t('bar.walk')} ×` : undefined}
          on={walk}
          aria-pressed={walk}
          data-testid="bar-walk"
          onClick={() => {
            used();
            setWalk(!walk);
          }}
        />
      </GlassButtonGroup>
    </div>
  );
}

type PhoneTool = Tray | 'walk' | 'zoomOut' | 'fit' | 'zoomIn';

/**
 * Phone (task 017): the tools as a tab-bar glass capsule, icon over label;
 * the open tool is a lens that slides (press and drag scrubs it across,
 * 2b.2). Tapping the open tool closes its sheet. Plan view: levels and zoom.
 */
export function PhoneTools({ derived }: { derived: Derived | null }) {
  const t = useT();
  const mode = useStudio((s) => s.mode);
  const tray = useStudio((s) => s.tray);
  const sitePanel = useStudio((s) => s.sitePanel);
  const setTray = useStudio((s) => s.setTray);
  const walk = useStudio((s) => s.walk);
  const setWalk = useStudio((s) => s.setWalk);
  const sun = useStudio((s) => s.sun);
  const setSun = useStudio((s) => s.setSun);
  const values = useToolValues(derived);
  const open = (k: Tray) => tray === k && (!sitePanel || (k === 'sun' && !!sitePanel.fromSun));
  const icon = { width: 22, height: 22, className: 'shrink-0' };
  const item = (k: Tray, ico: ReactNode, name: string, value: string | null, testId: string, disabled?: boolean) => ({
    value: k as PhoneTool,
    icon: ico,
    label: value ?? name,
    ariaLabel: value ? `${name}: ${value}` : name,
    disabled,
    props: { 'data-testid': testId, 'aria-expanded': open(k), 'aria-controls': TRAY_ID[k], 'data-tool-trigger': '' },
  });
  const plan = mode === 'plan';
  const segments = plan
    ? [
        item('levels', <LayersIcon {...icon} />, t('bar.levels'), values.planLevel, 'bar-levels'),
        { value: 'zoomOut' as PhoneTool, icon: <MinusIcon {...icon} />, label: t('bar.zoom'), ariaLabel: t('plan.zoomOut') },
        { value: 'fit' as PhoneTool, icon: <FitIcon {...icon} />, label: t('plan.fit'), ariaLabel: t('plan.fit') },
        { value: 'zoomIn' as PhoneTool, icon: <PlusIcon {...icon} />, label: t('bar.zoom'), ariaLabel: t('plan.zoomIn') },
      ]
    : [
        item('views', <CubeIcon {...icon} />, t('bar.views'), values.views, 'bar-views', walk),
        item('levels', <LayersIcon {...icon} />, t('bar.levels'), values.levels, 'bar-levels', walk),
        item('sun', <SunIcon {...icon} />, t('bar.sun'), values.sun, 'bar-sun'),
        {
          value: 'walk' as PhoneTool,
          icon: <WalkIcon {...icon} />,
          label: walk ? `${t('bar.walk')} ×` : t('bar.walk'),
          ariaLabel: walk ? t('walk.exit') : t('bar.walk'),
          props: { 'data-testid': 'bar-walk', 'aria-pressed': walk },
        },
      ];
  const current: PhoneTool | null = walk && !plan ? 'walk' : tray && open(tray) && (!plan || tray === 'levels') ? tray : null;
  const pick = (v: PhoneTool) => {
    if (v === 'zoomOut') return planCommands.zoom(1 / 1.4);
    if (v === 'zoomIn') return planCommands.zoom(1.4);
    if (v === 'fit') return planCommands.fit();
    if (v === 'walk') return setWalk(!walk);
    if (open(v)) return setTray(null);
    setTray(v);
    if (v === 'sun' && !sun.on) setSun({ on: true });
  };
  return (
    <GlassSegmented<PhoneTool>
      variant="tabs"
      reselect
      label={t('tools.label')}
      value={current}
      onChange={pick}
      segments={segments}
      height={60}
      testId="toolbar"
      className="w-full"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Panel contents                                                      */
/* ------------------------------------------------------------------ */

export function CloseButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} aria-label={label ?? t('tools.close')} className="hit lg-plate grid size-[30px] shrink-0 place-items-center text-ink-2 hover:text-ink" data-testid="panel-close">
      <CloseIcon width={16} height={16} />
    </button>
  );
}

function PanelHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[14px] font-medium">{title}</h2>
      <CloseButton onClick={onClose} />
    </div>
  );
}

/** The nine presets as a small plan diagram: corners = axonometric, sides = elevations; eye level and reset below. */
function ViewsPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const walk = useStudio((s) => s.walk);
  const view = useStudio((s) => (walk || s.viewMoved ? null : s.view));
  const setView = useStudio((s) => s.setView);
  const resetView = useStudio((s) => s.resetView);
  const label = (id: ViewId) => (presetById(id).kind === 'elevation' ? t(`view.${id}`) : t(`viewShort.${id}` as MessageKey));
  const cell = (id: ViewId) => (
    <GlassTip key={id} label={t(`view.${id}`)} className="min-w-0">
      <button
        type="button"
        aria-label={t(`view.${id}`)}
        aria-pressed={view === id}
        onClick={() => setView(id)}
        // A tile: the module's plate with the tile's own corners.
        className={cx('lg-plate flex h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-[8px] text-[11.5px] leading-[14px]', view === id ? 'bg-ink text-on-ink' : 'text-ink-2 hover:text-ink')}
      >
        <ViewIcon id={id} width={20} height={20} className={view === id ? 'text-on-ink' : 'text-ink'} />
        <span className="max-w-full truncate">{label(id)}</span>
      </button>
    </GlassTip>
  );
  return (
    <>
      <PanelHead title={t('views.title')} onClose={onClose} />
      <div className="grid grid-cols-3 gap-1">
        {cell('axo-nw')}
        {cell('elev-north')}
        {cell('axo-ne')}
        {cell('elev-west')}
        <div className="mx-3 my-2 grid place-items-center rounded-[6px] border border-dashed border-[#cfcfcf] text-[11.5px] text-ink-2" aria-hidden="true">N ↑</div>
        {cell('elev-east')}
        {cell('axo-sw')}
        {cell('elev-south')}
        {cell('axo-se')}
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          aria-label={t('view.eye-sw')}
          aria-pressed={view === 'eye-sw'}
          onClick={() => setView('eye-sw')}
          data-filled={view === 'eye-sw' ? undefined : ''}
          className={cx('lg-plate inline-flex h-8 flex-1 items-center justify-center gap-1.5 text-[12.5px]', view === 'eye-sw' ? 'bg-ink text-on-ink' : 'text-ink')}
        >
          <ViewIcon id="eye-sw" width={15} height={15} />
          {t('views.eye')}
        </button>
        <button type="button" aria-label={t('view.reset')} onClick={resetView} data-filled="" className="lg-plate inline-flex h-8 flex-1 items-center justify-center gap-1.5 text-[12.5px] text-ink">
          <ResetViewIcon width={14} height={14} />
          {t('view.resetShort')}
        </button>
      </div>
    </>
  );
}

/** A list of radio rows (arrow keys move the choice). */
function RadioRows<T extends string>({ label, value, onChange, rows }: { label: string; value: T; onChange: (v: T) => void; rows: { value: T; label: string; meta?: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: RKeyboardEvent) => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = Math.max(0, rows.findIndex((r) => r.value === value));
    const next = rows[(i + d + rows.length) % rows.length]!;
    onChange(next.value);
    ref.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} onKeyDown={onKey} className="flex flex-col gap-0.5">
      {rows.map((r) => {
        const on = r.value === value;
        return (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-value={r.value}
            onClick={() => onChange(r.value)}
            data-on={on ? '' : undefined}
            className={cx('lg-plate flex h-10 items-center gap-2.5 rounded-[14px] px-3 text-left text-[13px]', on && 'font-medium')}
          >
            {on ? <CheckIcon width={16} height={16} className="shrink-0" /> : <span className="w-4 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            {r.meta && <span className="tnum shrink-0 text-[11.5px] font-normal text-ink-3">{r.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}

const elevText = (mm: number) => (Math.abs(mm) < 1 ? '±0.00' : `${mm > 0 ? '+' : '−'}${(Math.abs(mm) / 1000).toFixed(2)} m`);

function LevelsPanel({ derived, onClose }: { derived: Derived; onClose: () => void }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const mode = useStudio((s) => s.mode);
  const cut = useStudio((s) => s.cut);
  const setCut = useStudio((s) => s.setCut);
  const level = useStudio((s) => s.level);
  const setLevel = useStudio((s) => s.setLevel);
  const paused = useStudio((s) => !!s.cut && presetById(s.view).kind !== 'axo');
  // Top floor first, as in a section.
  const rows = [...derived.levels].reverse().map((l) => ({
    value: l.id,
    label: levelName(lang, l.name, l.index, l.isAttic),
    meta: elevText(derived.resolved.levels.find((x) => x.id === l.id)?.elevation ?? 0),
  }));
  return (
    <>
      <PanelHead title={t('levels.label')} onClose={onClose} />
      {mode === 'plan' ? (
        <RadioRows label={t('levels.label')} value={level ?? derived.levels[0]!.id} onChange={setLevel} rows={rows} />
      ) : (
        <>
          <RadioRows<string> label={t('cut.label')} value={cut ?? 'all'} onChange={(v) => setCut(v === 'all' ? null : v)} rows={[{ value: 'all', label: t('cut.all'), meta: t('levels.whole') }, ...rows]} />
          <p className="text-[11.5px] leading-4 text-ink-3">{paused ? t('cut.paused') : t('levels.cutHeight', { h: CUT_HEIGHT_M.toFixed(2) })}</p>
        </>
      )}
    </>
  );
}

/** Time of day on a sunrise..sunset track: a glass-thumb slider and its hour ticks (never colliding). */
export function SunSlider({ className }: { className?: string }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const sun = useStudio((s) => s.sun);
  const info = useStudio((s) => s.sunInfo);
  const setSun = useStudio((s) => s.setSun);
  const lo = info?.sunrise ?? 360;
  const hi = info?.sunset ?? 1080;
  const value = Math.min(hi, Math.max(lo, Math.round(sun.minutes)));
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(260);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setWidth(el.clientWidth || 260);
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const loText = clock(lo, lang);
  const hiText = clock(hi, lang);
  // End labels take ~6 px per character (half of it beside the end), hour labels two digits.
  const endGap = Math.max(loText.length, hiText.length) * 6.2 + 4;
  return (
    <div className={cx('relative min-w-0 pb-3.5', className)}>
      <GlassSlider
        min={lo}
        max={hi}
        value={value}
        idle={!sun.on}
        onChange={(v) => setSun({ on: true, playing: false, minutes: v })}
        ariaLabel={t('sun.time')}
        ariaValueText={clock(value, lang)}
      />
      <div ref={ref} className="tnum pointer-events-none absolute inset-x-[19px] bottom-0 h-3 text-[11px] leading-none whitespace-nowrap text-ink-2" aria-hidden="true" data-testid="sun-ticks">
        <span className="absolute top-0 left-[-19px]">{loText}</span>
        {hourTicks(lo, hi, width, endGap).map((h) => (
          <span key={h} className="absolute top-0 -translate-x-1/2" style={{ left: `${((h * 60 - lo) / (hi - lo)) * 100}%` }}>
            {h % 24}
          </span>
        ))}
        <span className="absolute top-0 right-[-19px]">{hiText}</span>
      </div>
    </div>
  );
}

function PlayButton({ size = 36 }: { size?: number }) {
  const t = useT();
  const sun = useStudio((s) => s.sun);
  const info = useStudio((s) => s.sunInfo);
  const setSun = useStudio((s) => s.setSun);
  const lo = info?.sunrise ?? 360;
  const hi = info?.sunset ?? 1080;
  const value = Math.min(hi, Math.max(lo, sun.minutes));
  const play = () => {
    if (sun.playing) setSun({ playing: false });
    else setSun({ on: true, playing: true, minutes: value >= hi - 5 ? lo : value });
  };
  return (
    <button
      type="button"
      onClick={play}
      aria-label={sun.playing ? t('sun.pause') : t('sun.play')}
      aria-pressed={sun.playing}
      style={{ width: size, height: size }}
      className={cx('hit lg-focus grid shrink-0 place-items-center rounded-full text-on-accent transition-[filter] duration-150 hover:brightness-95', sun.on ? 'bg-accent' : 'bg-accent/70')}
    >
      {sun.playing ? <PauseIcon width={16} height={16} /> : <PlayIcon width={16} height={16} className="translate-x-px" />}
    </button>
  );
}

/** Play, slider and a time readout in one row (the landscape walk HUD). */
export function SunTime({ className }: { className?: string }) {
  const lang = useStudio((s) => s.lang);
  const sun = useStudio((s) => s.sun);
  const info = useStudio((s) => s.sunInfo);
  const t = useT();
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <PlayButton />
      <SunSlider className="flex-1" />
      <div className="w-[52px] shrink-0 text-right">
        <p className="tnum text-[15px] leading-5 font-medium tracking-tight">{info?.polar === 'night' ? t('sun.polarNight') : clock(sun.minutes, lang)}</p>
        <p className="tnum truncate text-2xs text-ink-2">{info && sun.on ? `${compass(info.azimuth, lang)} ${Math.max(0, Math.round(info.elevation))}°` : t('sun.offShort')}</p>
      </div>
    </div>
  );
}

/** The five dates as choice chips inside the panel. */
function DateRow() {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const dateId = useStudio((s) => s.sun.dateId);
  const setSun = useStudio((s) => s.setSun);
  const lat = useStudio((s) => s.house?.site.latitude ?? 30);
  return (
    <GlassChoice<SunDateId>
      label={t('sun.dates')}
      value={dateId}
      onChange={(id) => setSun({ dateId: id, on: true })}
      testId="sun-date"
      className="-mx-1"
      options={SUN_DATES.map((id) => {
        const day = dayText(sunDate(id, lat), lang);
        return { value: id, title: day, ariaLabel: `${t(`sun.date.${id}`)} ${day}`, label: lang === 'zh' ? t(`sun.date.${id}`) : t(`sun.date.${id}`).split(' ')[0] };
      })}
    />
  );
}

/** A compass dial in a circle: the front of the house faces down on the plan. */
function MiniDial({ northDeg }: { northDeg: number }) {
  return (
    <svg viewBox="0 0 40 40" width={30} height={30} className="shrink-0" aria-hidden="true">
      <circle cx={20} cy={20} r={18} fill="white" stroke="#d6d6d6" />
      <g transform={`rotate(${northDeg} 20 20)`}>
        <path d="M20 8l3.5 12h-7z" fill="var(--color-accent)" stroke="var(--color-ink)" strokeWidth={1} strokeLinejoin="round" />
        <path d="M20 32l3.5-12h-7z" fill="var(--color-ink)" />
      </g>
    </svg>
  );
}

function SiteRow({ icon, text, meta, onClick, label, testId }: { icon: ReactNode; text: ReactNode; meta: string; onClick: () => void; label: string; testId: string }) {
  // Viewing a shared project (task 028): the place and orientation are facts, not a way to change them.
  if (useViewOnly()) {
    return (
      <div aria-label={label} data-testid={testId} className="flex min-h-11 items-center gap-2.5 py-1.5 text-[14px] font-medium">
        {icon}
        <span className="min-w-0 flex-1 leading-[18px] [overflow-wrap:anywhere]">{text}</span>
        <span className="tnum shrink-0 text-[13px] font-normal text-ink-2">{meta}</span>
      </div>
    );
  }
  return (
    <GlassRow onClick={onClick} aria-label={label} data-testid={testId} className="-mx-3 w-[calc(100%+24px)] py-1.5 text-[14px]">
      {icon}
      <span className="min-w-0 flex-1 leading-[18px] [overflow-wrap:anywhere]">{text}</span>
      <span className="tnum shrink-0 text-[13px] font-normal text-ink-2">{meta}</span>
      <ChevronRightIcon width={14} height={14} className="shrink-0 text-ink-2" />
    </GlassRow>
  );
}

/** The sun study: play, time, sun position; dates; location and orientation; sunrise, noon, sunset; off. */
function SunPanel({ onClose, phone }: { onClose: () => void; phone?: boolean }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const sun = useStudio((s) => s.sun);
  const info = useStudio((s) => s.sunInfo);
  const site = useStudio((s) => s.house?.site);
  const tz = !!site?.timeZone;
  const setSun = useStudio((s) => s.setSun);
  const setTray = useStudio((s) => s.setTray);
  const setSitePanel = useStudio((s) => s.setSitePanel);
  const lo = info?.sunrise ?? 360;
  const hi = info?.sunset ?? 1080;
  const value = Math.min(hi, Math.max(lo, sun.minutes));
  const date = t(`sun.date.${sun.dateId}`);
  const polar = info?.polar ?? null;
  const dir = info ? compass(info.azimuth, lang) : '';
  // At the ends of the slider the sun sits on the horizon (sunrise / sunset), as drawn.
  const sub = !info
    ? date
    : polar === 'night'
      ? t('sun.subNight', { date })
      : polar === 'day' || info.elevation >= 1
        ? t(polar === 'day' ? 'sun.subDay' : 'sun.sub', { date, dir, el: Math.max(0, Math.round(info.elevation)) })
        : t(value <= (lo + hi) / 2 ? 'sun.subRise' : 'sun.subSet', { date, dir });
  const noon = info ? t('sun.noon', { t: clock(info.solarNoon, lang) }) : '';
  const utc = info && (tz || info.utcOffsetHours !== 8) ? utcText(info.utcOffsetHours) : '';
  // Facts that wrap between, never inside ("日落 17:03" stays on one line).
  const span = (
    !info
      ? []
      : polar === 'day'
        ? [t('sun.polarDay'), noon]
        : polar === 'night'
          ? [t('sun.polarNight')]
          : !phone
            ? [t('sun.rise', { t: clock(info.sunrise, lang) }), noon, t('sun.set', { t: clock(info.sunset, lang) })]
            : [noon]
  ).concat(utc ? [utc] : []);
  const placeTxt = site ? placeText(site, lang) : '';
  const [placeMain, placeNote] = placeTxt.includes('（') ? [placeTxt.slice(0, placeTxt.indexOf('（')), placeTxt.slice(placeTxt.indexOf('（'))] : placeTxt.includes(' (') ? [placeTxt.slice(0, placeTxt.indexOf(' (')), placeTxt.slice(placeTxt.indexOf(' ('))] : [placeTxt, ''];
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="tnum text-[40px] leading-10 font-bold tracking-[-0.02em]" data-testid="sun-clock">{polar === 'night' ? t('sun.polarNight') : clock(value, lang)}</p>
          <p className="tnum mt-1.5 text-[13px] leading-[18px] font-medium text-ink-2" data-testid="sun-sub">{sub}</p>
        </div>
        {polar !== 'night' && <PlayButton size={44} />}
      </div>
      {polar === 'night' ? (
        <p className="text-[13px] leading-[18px] text-ink-2" data-testid="sun-polar-note">
          {t('sun.polarNightNote')}
        </p>
      ) : (
        <SunSlider />
      )}
      <DateRow />
      {site && (
        <div className="-my-1 flex flex-col">
          <SiteRow
            icon={<PinIcon width={16} height={16} className="shrink-0" />}
            text={<>{placeMain}<span className="text-ink-3">{placeNote}</span></>}
            meta={`${Math.abs(site.latitude).toFixed(1)}°${site.latitude >= 0 ? 'N' : 'S'}`}
            onClick={() => setSitePanel({ kind: 'location', fromSun: true })}
            label={`${t('more.location')}: ${placeTxt}`}
            testId="sun-place"
          />
          <GlassSep className="mx-0 my-0" />
          <SiteRow
            icon={<MiniDial northDeg={site.northDeg} />}
            text={t('sun.front', { dir: bearingWords(frontBearing(site.northDeg), lang) })}
            meta={`${Math.round(frontBearing(site.northDeg))}°`}
            onClick={() => setSitePanel({ kind: 'orientation', fromSun: true })}
            label={`${t('more.orientation')}: ${bearingText(frontBearing(site.northDeg), lang)}`}
            testId="sun-orientation"
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="tnum min-w-0 text-[12px] leading-4 font-medium text-ink-2" data-testid="sun-noon">
          {span.map((x, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              <span className="whitespace-nowrap">{x}</span>
            </Fragment>
          ))}
        </span>
        <button
          type="button"
          onClick={() => {
            setSun({ on: false, playing: false });
            setTray(null);
          }}
          className="hit lg-plate -mr-2 inline-flex h-8 shrink-0 items-center gap-1 px-2.5 text-[13px] font-medium whitespace-nowrap"
        >
          <CloseIcon width={14} height={14} />
          {t('sun.exit')}
        </button>
      </div>
    </>
  );
}

/** A site panel shown in the tool panel's place; from the sun panel it has a way back. */
function SitePanelBody({ phone }: { phone?: boolean }) {
  const t = useT();
  const panel = useStudio((s) => s.sitePanel);
  const setSitePanel = useStudio((s) => s.setSitePanel);
  const setTray = useStudio((s) => s.setTray);
  if (!panel) return null;
  const back = panel.fromSun ? () => setSitePanel(null) : undefined;
  const close = () => setTray(null);
  return (
    <div className="-mx-4 -mt-3.5 -mb-4 flex min-h-0 flex-1 flex-col" role="dialog" aria-label={panel.kind === 'location' ? t('loc.title') : t('ori.title')} data-testid={`panel-${panel.kind}`}>
      {back && (
        <button type="button" onClick={back} className="hit lg-plate mt-2 ml-2 inline-flex h-8 items-center gap-0.5 self-start pr-2.5 pl-1.5 text-[12.5px] text-ink-2 hover:text-ink" data-testid="panel-back">
          <ChevronLeftIcon width={16} height={16} />
          {t('sun.label')}
        </button>
      )}
      {panel.kind === 'location' ? <LocationPanel panel={panel} desktop={!phone} onClose={close} /> : <OrientationPanel onClose={close} />}
    </div>
  );
}

/** The content of the open panel (header included); null when none is open. */
export function PanelBody({ derived, phone, kind }: { derived: Derived | null; phone?: boolean; kind?: Tray | 'site' }) {
  const current = useOpenPanel();
  const open = kind ?? current;
  const setTray = useStudio((s) => s.setTray);
  const close = () => setTray(null);
  if (!open) return null;
  if (open === 'site') return <SitePanelBody phone={phone} />;
  if (open === 'views') return <ViewsPanel onClose={close} />;
  if (open === 'levels') return derived ? <LevelsPanel derived={derived} onClose={close} /> : null;
  return <SunPanel onClose={close} phone={phone} />;
}

/** How the last interaction happened: a panel opened from the keyboard takes the focus along. */
let keyboardUser = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow')) keyboardUser = true;
  }, true);
  window.addEventListener('pointerdown', () => (keyboardUser = false), true);
}

/**
 * Moves focus into a panel when it opens from the keyboard (the chosen
 * option, else the first control); Escape brings it back to the tool.
 */
export function useFocusOnOpen(ref: React.RefObject<HTMLElement | null>, key: string | null): void {
  useLayoutEffect(() => {
    if (!key || !keyboardUser) return;
    const el = ref.current;
    const target = el?.querySelector<HTMLElement>('[aria-checked=true], [aria-pressed=true], button, input:not([type=text])');
    target?.focus({ preventScroll: true });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Panels hang from the tool group and join it (owner's decision); a site panel opened from the house menu floats under the house name. */
function fromGroup(panel: Tray | 'site'): boolean {
  const sp = panel === 'site' ? useStudio.getState().sitePanel : null;
  return !sp || !!sp.fromSun;
}

/**
 * Desktop: the open panel, an anchored glass surface (task 025): joined to
 * the whole tool group, right edges aligned (one at a time; a panel being
 * replaced flows back into the group), or under the house name for a site
 * panel from its menu. Reports its box so the house frames beside or below it.
 */
export function PanelCard({ derived, onRect }: { derived: Derived | null; onRect: (r: { left: number; right: number; bottom: number } | null) => void }) {
  const open = useOpenPanel();
  const siteKind = useStudio((s) => s.sitePanel?.kind ?? null);
  const current = open ? (open === 'site' ? `site-${siteKind}` : open) : null;
  // Each panel keeps the attachment it opened with (a site panel flows back where it came from).
  const [panels, setPanels] = useState<{ key: string; panel: Tray | 'site'; joined: boolean }[]>([]);
  useLayoutEffect(() => {
    if (current && open && !panels.some((p) => p.key === current)) setPanels((ps) => [...ps, { key: current, panel: open, joined: fromGroup(open) }]);
    if (!current) onRect(null);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef<HTMLElement>(null);
  useFocusOnOpen(ref, current);
  return (
    <>
      {panels.map((p) => {
        const on = p.key === current;
        const joined = p.joined;
        return (
          <GlassPopover
            key={p.key}
            ref={on ? ref : undefined}
            open={on}
            anchor={() => document.querySelector<HTMLElement>(joined ? '[data-testid=toolbar]' : '[data-house-name]')}
            placement={joined ? 'below-end' : 'below-start'}
            attach={joined ? 'joined' : 'float'}
            onClosed={() => setPanels((ps) => ps.filter((q) => q.key !== p.key))}
            onBox={on ? onRect : undefined}
            id={p.panel === 'site' ? undefined : TRAY_ID[p.panel]}
            ariaRole={p.panel === 'site' ? undefined : 'group'}
            aria-label={p.panel === 'site' ? undefined : p.panel}
            data-testid={on ? (p.panel === 'site' ? 'panel-site' : TRAY_ID[p.panel]) : undefined}
            data-panel={on ? '' : undefined}
            group={joined ? TOOLS_GROUP : undefined}
            // Clear of the input at the bottom (its 112 px), as before.
            style={{ width: 330, maxHeight: 'calc(100vh - 66px - 112px)' }}
            className="flex flex-col overflow-y-auto overscroll-contain"
            bodyClassName="flex min-h-0 flex-col gap-4 p-[22px]"
          >
            {/* A panel flowing back is an empty shape: its controls are gone at once (no duplicates for keyboard, screen readers and tests). */}
            {on && <PanelBody derived={derived} kind={p.panel} />}
          </GlassPopover>
        );
      })}
    </>
  );
}
