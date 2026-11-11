// The studio's tools (task 015): one toolbar (视角 / 楼层 / 日照 / 走进去) and
// the panel a tool needs. Desktop: compact icons top-right whose label
// slides out on hover, focus and while the tool is in use; the panel is a
// card hanging under the toolbar. Phone: the toolbar sits at the bottom
// with labels; the panel is a bottom sheet the toolbar rides on (PhoneDock).
import { Fragment, type KeyboardEvent as RKeyboardEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronLeftIcon, ChevronRightIcon, CheckIcon, CloseIcon, CubeIcon, FitIcon, LayersIcon, MinusIcon, PauseIcon, PinIcon, PlayIcon, PlusIcon, ResetViewIcon,
  SunIcon, ViewIcon,
} from '../components/icons';
import { cx } from '../components/ui';
import { levelName, type MessageKey, useT } from '../lib/i18n';
import { bearingText, bearingWords, frontBearing, placeText, utcText } from '../lib/site';
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
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

function ToolButton({ icon, label, on, set, show, onClick, ariaLabel, controls, expanded, testId, phone }: {
  icon: ReactNode; label: ReactNode; on?: boolean; set?: boolean; show?: boolean; onClick: () => void; ariaLabel: string; controls?: string; expanded?: boolean; testId?: string; phone?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      aria-pressed={expanded === undefined ? on : undefined}
      aria-controls={controls}
      data-testid={testId}
      data-tool-trigger=""
      data-show={show ? '' : undefined}
      className={cx(
        'tool tnum inline-flex items-center justify-center text-[13px] whitespace-nowrap transition-colors duration-150',
        phone ? 'h-11 min-w-0 flex-1 rounded-[11px] px-1.5' : 'h-9 min-w-9 rounded-[9px] px-[9px]',
        on ? 'bg-ink text-white' : set ? 'bg-wash text-ink' : 'text-ink hover:bg-wash',
      )}
    >
      {icon}
      <span className="tool-label">
        <span>{label}</span>
      </span>
    </button>
  );
}

function IconTool({ label, onClick, children, phone }: { label: string; onClick: () => void; children: ReactNode; phone?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cx('grid place-items-center rounded-[9px] text-ink transition-colors hover:bg-wash', phone ? 'h-11 min-w-0 flex-1' : 'size-9')}>
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-[3px] h-5 w-px shrink-0 bg-hairline" aria-hidden="true" />;

/**
 * Do all labels fit beside their icons (phone row)? Measured: below about
 * 300 px only the tool in use keeps its label.
 */
function useLabelsFit(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean, deps: unknown[]): boolean {
  const [fit, setFit] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const measure = () => {
      const btns = [...el.querySelectorAll<HTMLElement>('.tool')];
      const style = getComputedStyle(el);
      const avail = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2 * Math.max(0, el.children.length - 1);
      let need = 0;
      for (const b of btns) need += 12 + 16 + 6 + ((b.querySelector('.tool-label > span') as HTMLElement | null)?.scrollWidth ?? 0);
      for (const b of el.querySelectorAll<HTMLElement>(':scope > :not(.tool)')) need += b.offsetWidth;
      setFit(need <= avail);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  return fit;
}

/**
 * The four tools (3D), or levels and zoom (plan). `phone`: the bottom row
 * with labels; otherwise the compact desktop group.
 */
export function Toolbar({ derived, phone, className }: { derived: Derived | null; phone?: boolean; className?: string }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const mode = useStudio((s) => s.mode);
  const tray = useStudio((s) => s.tray);
  const sitePanel = useStudio((s) => s.sitePanel);
  const setTray = useStudio((s) => s.setTray);
  const walk = useStudio((s) => s.walk);
  const setWalk = useStudio((s) => s.setWalk);
  const cut = useStudio((s) => s.cut);
  const level = useStudio((s) => s.level);
  const view = useStudio((s) => s.view);
  const sun = useStudio((s) => s.sun);
  const polarNight = useStudio((s) => s.sunInfo?.polar === 'night');
  const setSun = useStudio((s) => s.setSun);
  const sunLabel = polarNight ? t('sun.polarNight') : clock(sun.minutes, lang);
  const ref = useRef<HTMLDivElement>(null);
  const levels = derived?.levels ?? null;
  const lv = (id: string | null) => {
    const l = levels?.find((x) => x.id === id);
    return l ? levelName(lang, l.name, l.index, l.isAttic) : null;
  };
  // A site panel opened from the sun panel keeps the sun tool marked.
  const open = (k: Tray) => tray === k && (!sitePanel || (k === 'sun' && !!sitePanel.fromSun));
  const toggle = (k: Tray) => setTray(open(k) ? null : k);
  const fit = useLabelsFit(ref, !!phone, [lang, mode, cut, sun.on, walk, view, level]);
  const icon = { width: 16, height: 16, className: 'shrink-0' };
  const viewLabel = view !== DEFAULT_VIEW ? t(`viewShort.${view}` as MessageKey) || t(`view.${view}`) : t('bar.views');
  const viewText = presetById(view).kind === 'elevation' ? t(`view.${view}`) : viewLabel;
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t('tools.label')}
      data-testid="toolbar"
      data-labels={phone && fit ? '' : undefined}
      className={cx(
        'tools pointer-events-auto flex items-center gap-0.5 bg-surface shadow-float',
        phone ? 'h-[54px] w-full rounded-[16px] p-[5px]' : 'h-11 rounded-[12px] p-1',
        'ring-1 ring-black/[0.06]',
        className,
      )}
    >
      {mode === 'plan' ? (
        <>
          <ToolButton phone={phone} icon={<LayersIcon {...icon} />} label={lv(level) ?? t('bar.levels')} on={open('levels')} show expanded={open('levels')} controls={TRAY_ID.levels} onClick={() => toggle('levels')} ariaLabel={t('bar.levels')} testId="bar-levels" />
          <Divider />
          <IconTool phone={phone} label={t('plan.zoomOut')} onClick={() => planCommands.zoom(1 / 1.4)}><MinusIcon width={17} height={17} /></IconTool>
          <IconTool phone={phone} label={t('plan.fit')} onClick={() => planCommands.fit()}><FitIcon width={17} height={17} /></IconTool>
          <IconTool phone={phone} label={t('plan.zoomIn')} onClick={() => planCommands.zoom(1.4)}><PlusIcon width={17} height={17} /></IconTool>
        </>
      ) : (
        <>
          {/* Walking: only what applies to walking (the sun, and the way out). */}
          {!walk && (
            <>
            <ToolButton
              phone={phone}
              icon={<CubeIcon {...icon} />}
              label={viewText}
              on={open('views')}
              set={view !== DEFAULT_VIEW}
              show={open('views') || view !== DEFAULT_VIEW}
              expanded={open('views')}
              controls={TRAY_ID.views}
              onClick={() => toggle('views')}
              ariaLabel={view !== DEFAULT_VIEW ? `${t('bar.views')}: ${t(`view.${view}`)}` : t('bar.views')}
              testId="bar-views"
            />
            <ToolButton
              phone={phone}
              icon={<LayersIcon {...icon} />}
              label={cut ? lv(cut) : t('bar.levels')}
              on={open('levels')}
              set={!!cut}
              show={open('levels') || !!cut}
              expanded={open('levels')}
              controls={TRAY_ID.levels}
              onClick={() => toggle('levels')}
              ariaLabel={cut ? `${t('bar.levels')}: ${lv(cut)}` : t('bar.levels')}
              testId="bar-levels"
            />
            </>
          )}
          <ToolButton
            phone={phone}
            icon={<SunIcon {...icon} />}
            label={sun.on ? sunLabel : t('bar.sun')}
            on={open('sun')}
            set={sun.on}
            show={open('sun') || sun.on}
            expanded={open('sun')}
            controls={TRAY_ID.sun}
            onClick={() => {
              if (open('sun')) setTray(null);
              else {
                setTray('sun');
                if (!sun.on) setSun({ on: true });
              }
            }}
            ariaLabel={sun.on ? `${t('bar.sun')} ${sunLabel}` : t('bar.sun')}
            testId="bar-sun"
          />
          {!phone && <Divider />}
          <ToolButton
            phone={phone}
            icon={<WalkIcon {...icon} />}
            label={walk ? `${t('bar.walk')} ×` : t('bar.walk')}
            on={walk}
            show={walk}
            onClick={() => setWalk(!walk)}
            ariaLabel={walk ? t('walk.exit') : t('bar.walk')}
            testId="bar-walk"
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel contents                                                      */
/* ------------------------------------------------------------------ */

export function CloseButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} aria-label={label ?? t('tools.close')} className="hit grid size-[30px] shrink-0 place-items-center rounded-[8px] text-ink-2 transition-colors hover:bg-wash hover:text-ink" data-testid="panel-close">
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
    <button
      key={id}
      type="button"
      aria-label={t(`view.${id}`)}
      aria-pressed={view === id}
      title={t(`view.${id}`)}
      onClick={() => setView(id)}
      className={cx('flex h-[50px] min-w-0 flex-col items-center justify-center gap-[3px] rounded-[8px] text-[11.5px] leading-[14px] transition-colors', view === id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-wash hover:text-ink')}
    >
      <ViewIcon id={id} width={20} height={20} className={view === id ? 'text-white' : 'text-ink'} />
      <span className="max-w-full truncate">{label(id)}</span>
    </button>
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
          className={cx('inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px] transition-colors', view === 'eye-sw' ? 'bg-ink text-white' : 'bg-wash text-ink hover:bg-hairline')}
        >
          <ViewIcon id="eye-sw" width={15} height={15} />
          {t('views.eye')}
        </button>
        <button type="button" aria-label={t('view.reset')} onClick={resetView} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full bg-wash text-[12.5px] text-ink transition-colors hover:bg-hairline">
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
            className={cx('flex h-10 items-center gap-2.5 rounded-[8px] px-3 text-left text-[13px] transition-colors', on ? 'bg-wash font-medium' : 'hover:bg-wash')}
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

/** Time of day on a sunrise..sunset track: the range and its hour ticks (never colliding). */
export function SunSlider({ className }: { className?: string }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const sun = useStudio((s) => s.sun);
  const info = useStudio((s) => s.sunInfo);
  const setSun = useStudio((s) => s.setSun);
  const lo = info?.sunrise ?? 360;
  const hi = info?.sunset ?? 1080;
  const value = Math.min(hi, Math.max(lo, Math.round(sun.minutes)));
  const fill = ((value - lo) / Math.max(1, hi - lo)) * 100;
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
      <input
        type="range"
        className={cx('range block w-full', !sun.on && 'range-idle')}
        style={{ ['--fill' as string]: `${fill}%`, height: 24 }}
        min={lo}
        max={hi}
        step={1}
        value={value}
        onChange={(e) => setSun({ on: true, playing: false, minutes: Number(e.target.value) })}
        aria-label={t('sun.time')}
        aria-valuetext={clock(value, lang)}
      />
      <div ref={ref} className="tnum pointer-events-none absolute inset-x-[9px] bottom-0 h-3 text-2xs leading-none whitespace-nowrap text-ink-3" aria-hidden="true" data-testid="sun-ticks">
        <span className="absolute top-0 left-[-9px]">{loText}</span>
        {hourTicks(lo, hi, width, endGap).map((h) => (
          <span key={h} className="absolute top-0 -translate-x-1/2" style={{ left: `${((h * 60 - lo) / (hi - lo)) * 100}%` }}>
            {h % 24}
          </span>
        ))}
        <span className="absolute top-0 right-[-9px]">{hiText}</span>
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
      className={cx('hit grid shrink-0 place-items-center rounded-full text-ink transition-colors duration-150', sun.on ? 'bg-accent hover:brightness-95' : 'bg-wash hover:bg-accent')}
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

/** The five dates as a light segmented row. */
function DateRow() {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const dateId = useStudio((s) => s.sun.dateId);
  const setSun = useStudio((s) => s.setSun);
  const lat = useStudio((s) => s.house?.site.latitude ?? 30);
  const ref = useRef<HTMLDivElement>(null);
  const pick = (id: SunDateId) => setSun({ dateId: id, on: true });
  const onKey = (e: RKeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = SUN_DATES.indexOf(dateId);
    const next = SUN_DATES[(i + d + SUN_DATES.length) % SUN_DATES.length]!;
    pick(next);
    ref.current?.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={t('sun.dates')} onKeyDown={onKey} className="flex gap-0.5 rounded-[12px] bg-wash p-[3px]" data-testid="sun-date">
      {SUN_DATES.map((id) => {
        const on = id === dateId;
        const day = dayText(sunDate(id, lat), lang);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${t(`sun.date.${id}`)} ${day}`}
            title={day}
            tabIndex={on ? 0 : -1}
            data-value={id}
            onClick={() => pick(id)}
            className={cx('h-[30px] flex-auto rounded-[8px] px-1 text-[13px] whitespace-nowrap transition-colors', on ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]' : 'text-ink-2 hover:text-ink')}
          >
            {lang === 'zh' ? t(`sun.date.${id}`) : t(`sun.date.${id}`).split(' ')[0]}
          </button>
        );
      })}
    </div>
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
  return (
    <button type="button" onClick={onClick} aria-label={label} data-testid={testId} className="flex min-h-11 w-full items-center gap-2.5 rounded-[10px] bg-wash px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-hairline">
      {icon}
      <span className="min-w-0 flex-1 leading-[17px] [overflow-wrap:anywhere]">{text}</span>
      <span className="tnum shrink-0 text-xs text-ink-3">{meta}</span>
      <ChevronRightIcon width={14} height={14} className="shrink-0 text-ink-2" />
    </button>
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
      <div className="flex items-center gap-3">
        {polar !== 'night' && <PlayButton />}
        <div className="min-w-0 flex-1">
          <p className="tnum text-[26px] leading-[30px] font-medium" data-testid="sun-clock">{polar === 'night' ? t('sun.polarNight') : clock(value, lang)}</p>
          <p className="tnum text-[11.5px] leading-4 text-ink-2" data-testid="sun-sub">{sub}</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      {polar === 'night' ? (
        <p className="rounded-[10px] bg-wash px-3 py-2 text-[12px] leading-[18px] text-ink-2" data-testid="sun-polar-note">
          {t('sun.polarNightNote')}
        </p>
      ) : (
        <SunSlider />
      )}
      <DateRow />
      <p className="text-[11.5px] tracking-[0.04em] text-ink-3">{t('sun.site')}</p>
      {site && (
        <div className="-mt-1.5 flex flex-col gap-2">
          <SiteRow
            icon={<PinIcon width={16} height={16} className="shrink-0" />}
            text={<>{placeMain}<span className="text-ink-3">{placeNote}</span></>}
            meta={`${Math.abs(site.latitude).toFixed(1)}°${site.latitude >= 0 ? 'N' : 'S'}`}
            onClick={() => setSitePanel({ kind: 'location', fromSun: true })}
            label={`${t('more.location')}: ${placeTxt}`}
            testId="sun-place"
          />
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
        <span className="tnum min-w-0 text-[11.5px] leading-4 text-ink-2" data-testid="sun-noon">
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
          className="hit inline-flex h-8 shrink-0 items-center gap-1 rounded-[7px] px-2 text-[12.5px] whitespace-nowrap text-ink transition-colors hover:bg-wash"
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
        <button type="button" onClick={back} className="hit mt-2 ml-2 inline-flex h-8 items-center gap-0.5 self-start rounded-[7px] pr-2 pl-1 text-[12.5px] text-ink-2 transition-colors hover:bg-wash hover:text-ink" data-testid="panel-back">
          <ChevronLeftIcon width={16} height={16} />
          {t('sun.label')}
        </button>
      )}
      {panel.kind === 'location' ? <LocationPanel panel={panel} desktop={!phone} onClose={close} /> : <OrientationPanel onClose={close} />}
    </div>
  );
}

/** The content of the open panel (header included); null when none is open. */
export function PanelBody({ derived, phone }: { derived: Derived | null; phone?: boolean }) {
  const open = useOpenPanel();
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

/**
 * Desktop: the open panel as a card hanging under the toolbar (~300 px,
 * fitted to its content). Reports its box so the house frames beside or
 * below it.
 */
export function PanelCard({ derived, onRect }: { derived: Derived | null; onRect: (r: { left: number; bottom: number } | null) => void }) {
  const open = useOpenPanel();
  const kind = useStudio((s) => (s.sitePanel ? `site-${s.sitePanel.kind}` : s.tray));
  const ref = useRef<HTMLDivElement>(null);
  useFocusOnOpen(ref, open ? kind : null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !open) {
      onRect(null);
      return;
    }
    // offsetTop / offsetHeight ignore the drop-in transform: the settled box.
    const report = () => onRect({ left: el.offsetLeft, bottom: el.offsetTop + el.offsetHeight });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, onRect]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      id={open === 'site' ? undefined : TRAY_ID[open]}
      role={open === 'site' ? undefined : 'group'}
      aria-label={open === 'site' ? undefined : open}
      data-testid={open === 'site' ? 'panel-site' : TRAY_ID[open]}
      data-panel=""
      className="glass-solid pointer-events-auto absolute top-[68px] right-4 flex max-h-[calc(100%-68px-96px)] w-[300px] flex-col overflow-y-auto overscroll-contain rounded-[14px]"
    >
      <div key={kind} className="flex min-h-0 flex-col gap-3 px-4 pt-3.5 pb-4 animate-[panel-drop_240ms_cubic-bezier(0.22,0.8,0.24,1)]">
        <PanelBody derived={derived} />
      </div>
    </div>
  );
}
