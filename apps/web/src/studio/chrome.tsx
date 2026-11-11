// Studio chrome. Calm by default: the house name (with a quiet menu), the
// mode switch, the prompt bar and four secondary buttons (视角, 楼层, 日照,
// 走进去). Each secondary button opens one small tray above the row; only
// one tray is open at a time, and Escape or a tap on the drawing closes it.
import { Link } from '@tanstack/react-router';
import { type KeyboardEvent as RKeyboardEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TEMPLATE_META } from '@opensu/agent/templates-meta';
import {
  ChevronDownSmallIcon, CloseIcon, CompassIcon, CubeIcon, FitIcon, LayersIcon, Mark, MinusIcon, PauseIcon, PinIcon, PlayIcon, PlusIcon,
  ResetViewIcon, SunIcon, ViewIcon,
} from '../components/icons';
import { cx, Segmented } from '../components/ui';
import { levelName, type MessageKey, useT } from '../lib/i18n';
import { type Mode, SUN_DATES, type SunDateId, type Tray, useStudio } from '../lib/store';
import { resetToTemplate } from '../lib/autosave';
import { bearingText, frontBearing, placeText, utcText } from '../lib/site';
import { compass, dayText, hhmm, hourTicks, sunDate } from '../lib/sun';
import { presetById, type ViewId } from '../lib/views';
import { replaceHouse, useChat } from '../chat/chat-store';
import type { Derived, LevelInfo } from './house-data';
import { planCommands } from './PlanView';
import { loadHouseData } from './useDerived';
import { WalkIcon } from './WalkHUD';

const fmtArea = (a: number) => (Math.round(a * 10) / 10).toFixed(1);
const fmtLen = (m: number) => String(Math.round(m * 10) / 10);

/** The house's own name; the internal golden benchmark shows its style title instead. */
export function projectTitle(t: ReturnType<typeof useT>, house: { name: string; style: string } | null | undefined): string {
  if (house?.name && !house.name.startsWith('Golden sample')) return house.name;
  const key = `project.title.${house?.style ?? 'modern-pitched'}` as MessageKey;
  return t(key) || house?.style || '';
}

/** Closes the menu / tray on Escape and on a press outside `ref` (and outside `except`). */
function useDismiss(open: boolean, close: (viaKey: boolean) => void, refs: RefObject<HTMLElement | null>[], ignore?: string): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        closeRef.current(true);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      if (ignore && (e.target as Element | null)?.closest?.(ignore)) return;
      closeRef.current(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/* ------------------------------------------------------------------ */
/* Title and project menu                                              */
/* ------------------------------------------------------------------ */

function Facts({ derived, className }: { derived: Derived | null; className?: string }) {
  const t = useT();
  if (!derived) return <p className={cx('h-4', className)}><span className="inline-block h-2.5 w-36 rounded-sm bg-wash" /></p>;
  const storeys = derived.attic ? t('facts.storeysAttic', { n: derived.storeys }) : t('facts.storeysValue', { n: derived.storeys });
  return (
    <p className={cx('tnum truncate text-xs text-ink-2', className)}>
      <span>{`${fmtLen(derived.plot.width)} × ${fmtLen(derived.plot.depth)} m`}</span>
      <span className="mx-1.5 text-ink-3">·</span>
      <span data-testid="fact-area">{`${fmtArea(derived.area)} m²`}</span>
      <span className="mx-1.5 text-ink-3">·</span>
      <span>{storeys}</span>
    </p>
  );
}

/**
 * The house name: the trigger of the project menu (place, orientation,
 * templates, reset, language, AI settings, about). Reports its extent so
 * the 3D view frames the house clear of it.
 */
export function TitleMenu({ derived, onRect, compact }: { derived: Derived | null; onRect?: (r: { right: number; bottom: number }) => void; compact?: boolean }) {
  const t = useT();
  const house = useStudio((s) => s.house);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
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
  const close = (focus: boolean) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  };
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(open, close, [box, menu]);
  const name = projectTitle(t, house);
  return (
    <div className="pointer-events-auto relative min-w-0" ref={box}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('more.open')}: ${name}`}
        onClick={() => setOpen(!open)}
        data-testid="project-menu"
        className={cx(
          'group -ml-2 flex max-w-full items-center gap-2 rounded-[9px] px-2 text-left transition-colors hover:bg-wash/80',
          compact ? 'h-9' : 'h-10',
          open && 'bg-wash',
        )}
      >
        <Mark width={compact ? 17 : 19} height={compact ? 17 : 19} className="shrink-0" />
        <span className={cx('truncate font-semibold tracking-[-0.01em]', compact ? 'text-[15px]' : 'text-[17px]')}>{name}</span>
        <ChevronDownSmallIcon width={16} height={16} className={cx('-ml-1 shrink-0 text-ink-3 transition-transform duration-150 group-hover:text-ink-2', open && 'rotate-180')} />
      </button>
      <Facts derived={derived} className={cx('pl-0.5', compact ? 'mt-0' : 'mt-0.5')} />
      {open && <ProjectMenu ref={menu} onClose={close} compact={compact} />}
    </div>
  );
}

function MenuItem({ children, onSelect, value, icon, danger, testId }: { children: ReactNode; onSelect: () => void; value?: ReactNode; icon?: ReactNode; danger?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onSelect}
      data-testid={testId}
      className={cx(
        'flex h-9 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors hover:bg-wash focus-visible:bg-wash focus-visible:outline-none',
        danger ? 'bg-ink text-white hover:bg-ink focus-visible:bg-ink' : 'text-ink',
      )}
    >
      {icon && <span className={cx('grid size-5 shrink-0 place-items-center', danger ? 'text-white' : 'text-ink-2')}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {value !== undefined && <span className={cx('max-w-[52%] shrink-0 truncate text-xs', danger ? 'text-white/80' : 'text-ink-3')}>{value}</span>}
    </button>
  );
}

const Sep = () => <div className="my-1 h-px bg-hairline" role="separator" />;

function ProjectMenu({ onClose, compact, ref }: { onClose: (focus: boolean) => void; compact?: boolean; ref: RefObject<HTMLDivElement | null> }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const site = useStudio((s) => s.house?.site);
  const setLang = useStudio((s) => s.setLang);
  const setSitePanel = useStudio((s) => s.setSitePanel);
  const setChatOpen = useStudio((s) => s.setChatOpen);
  const setSettingsOpen = useChat((s) => s.setSettingsOpen);
  const [templates, setTemplates] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // Arrow keys move between items; focus starts on the first.
  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
  }, [ref]);
  const onKey = (e: RKeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (d) {
      e.preventDefault();
      items[(i + d + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') onClose(false);
  };
  const pick = async (id: string) => {
    onClose(false);
    const m = await loadHouseData();
    const house = m.templateById(id);
    const meta = TEMPLATE_META.find((x) => x.id === id);
    await replaceHouse(house, t('tpl.edit', { name: meta?.name ?? house.name }));
    // A new house: say where it stands (or skip).
    setSitePanel({ kind: 'location', intro: true });
  };
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t('more.open')}
      onKeyDown={onKey}
      className={cx('glass-solid absolute top-full left-0 z-40 mt-1.5 w-[288px] animate-[fade-in_120ms_ease-out] rounded-ui p-1.5', compact && 'w-[min(288px,calc(100vw-24px))]')}
      data-testid="project-menu-list"
    >
      <MenuItem icon={<PinIcon width={17} height={17} />} value={site ? placeText(site, lang) : ''} onSelect={() => { onClose(false); setSitePanel({ kind: 'location' }); }} testId="menu-location">
        {t('more.location')}
      </MenuItem>
      <MenuItem icon={<CompassIcon width={17} height={17} />} value={site ? bearingText(frontBearing(site.northDeg), lang) : ''} onSelect={() => { onClose(false); setSitePanel({ kind: 'orientation' }); }} testId="menu-orientation">
        {t('more.orientation')}
      </MenuItem>
      <Sep />
      <MenuItem icon={<LayersIcon width={17} height={17} />} onSelect={() => setTemplates(!templates)} value={<ChevronDownSmallIcon width={15} height={15} className={cx('transition-transform', templates && 'rotate-180')} />}>
        {t('more.templates')}
      </MenuItem>
      {templates && (
        <div className="mb-1 ml-9 border-l border-hairline pl-1.5">
          {TEMPLATE_META.map((m) => (
            <MenuItem key={m.id} onSelect={() => void pick(m.id)} value={`${m.plot.width / 1000} × ${m.plot.depth / 1000} m`}>
              {m.name}
            </MenuItem>
          ))}
          <p className="px-2.5 pt-0.5 pb-1.5 text-2xs text-ink-3">{t('tpl.note')}</p>
        </div>
      )}
      <MenuItem
        icon={<ResetViewIcon width={16} height={16} />}
        danger={confirm}
        testId="reset-house"
        onSelect={() => {
          if (!confirm) setConfirm(true);
          else {
            onClose(false);
            void resetToTemplate();
          }
        }}
      >
        {confirm ? t('house.resetConfirm') : t('house.reset')}
      </MenuItem>
      <Sep />
      <MenuItem value={t('lang.switch')} onSelect={() => setLang(lang === 'zh' ? 'en' : 'zh')} icon={<span className="text-[11px] font-semibold">{lang === 'zh' ? '文' : 'A'}</span>}>
        {t('more.lang')}
      </MenuItem>
      <MenuItem
        icon={<SparkDot />}
        onSelect={() => {
          onClose(false);
          setChatOpen(true);
          setSettingsOpen(true);
        }}
      >
        {t('chat.settings')}
      </MenuItem>
      <Link to="/" role="menuitem" tabIndex={-1} className="flex h-9 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] text-ink transition-colors hover:bg-wash focus-visible:bg-wash focus-visible:outline-none">
        <span className="grid size-5 place-items-center"><Mark width={15} height={15} /></span>
        {t('more.about')}
      </Link>
      <p className="px-2.5 pt-1 pb-1 text-2xs leading-4 text-ink-3">{t('house.autosaved')}</p>
    </div>
  );
}

function SparkDot() {
  return <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true"><path d="M12 3.5c.5 4.3 2.7 6.9 7 8-4.3 1.1-6.5 3.7-7 8-.5-4.3-2.7-6.9-7-8 4.3-1.1 6.5-3.7 7-8Z" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" /></svg>;
}

export function ModeSwitch({ size = 'md', className }: { size?: 'md' | 'lg' | 'sm'; className?: string }) {
  const t = useT();
  const mode = useStudio((s) => s.mode);
  const setMode = useStudio((s) => s.setMode);
  return (
    <Segmented<Mode>
      label={t('mode.label')}
      size={size === 'sm' ? 'md' : size}
      value={mode}
      onChange={setMode}
      className={cx(className, size === 'sm' && '[&>button]:h-7 [&>button]:px-3')}
      segments={[
        { value: '3d', label: t('mode.3d') },
        { value: 'plan', label: t('mode.plan') },
        { value: 'sheet', label: t('mode.sheet') },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* The secondary row                                                   */
/* ------------------------------------------------------------------ */

function RowButton({ label, icon, children, active, on, onClick, ariaLabel, controls, testId, compact, expanded }: {
  label?: string; icon: ReactNode; children?: ReactNode; active?: boolean; on?: boolean; onClick: () => void; ariaLabel: string; controls?: string; testId?: string; compact?: boolean; expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-controls={controls}
      data-testid={testId}
      data-tray-trigger={controls ? 'true' : undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors duration-150',
        compact ? 'h-10 min-w-0 flex-1 rounded-[11px] px-2 text-[13px]' : 'h-9 rounded-full pr-3.5 pl-3 text-[13px]',
        active ? 'bg-ink text-white shadow-float' : on ? 'bg-accent text-ink shadow-float hover:brightness-95' : 'glass text-ink-2 hover:text-ink',
      )}
    >
      {icon}
      <span className="truncate">{children ?? label}</span>
    </button>
  );
}

const TRAY_ID: Record<Tray, string> = { views: 'tray-views', levels: 'tray-levels', sun: 'tray-sun' };

/** The four secondary buttons (3D), or levels and zoom (plan). */
export function ActionRow({ levels, compact }: { levels: LevelInfo[] | null; compact?: boolean }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const mode = useStudio((s) => s.mode);
  const tray = useStudio((s) => s.tray);
  const setTray = useStudio((s) => s.setTray);
  const walk = useStudio((s) => s.walk);
  const setWalk = useStudio((s) => s.setWalk);
  const cut = useStudio((s) => s.cut);
  const level = useStudio((s) => s.level);
  const sun = useStudio((s) => s.sun);
  const setSun = useStudio((s) => s.setSun);
  const toggle = (k: Tray) => setTray(tray === k ? null : k);
  const icon = compact ? 18 : 17;
  const lv = (id: string | null) => {
    const l = levels?.find((x) => x.id === id);
    return l ? levelName(lang, l.name, l.index, l.isAttic) : null;
  };
  if (mode === 'plan') {
    return (
      <div className={cx('pointer-events-auto flex items-center gap-1.5', compact && 'w-full')} role="toolbar" aria-label={t('views.label')}>
        <RowButton compact={compact} icon={<LayersIcon width={icon} height={icon} />} ariaLabel={t('bar.levels')} expanded={tray === 'levels'} active={tray === 'levels'} controls={TRAY_ID.levels} onClick={() => toggle('levels')} testId="bar-levels">
          {lv(level) ?? t('bar.levels')}
        </RowButton>
        <div className={cx('glass flex items-center rounded-full p-0.5', compact && 'h-10 rounded-[11px]')} role="group" aria-label={t('bar.zoom')}>
          <ZoomButton label={t('plan.zoomOut')} onClick={() => planCommands.zoom(1 / 1.4)}><MinusIcon width={17} height={17} /></ZoomButton>
          <ZoomButton label={t('plan.fit')} onClick={() => planCommands.fit()}><FitIcon width={17} height={17} /></ZoomButton>
          <ZoomButton label={t('plan.zoomIn')} onClick={() => planCommands.zoom(1.4)}><PlusIcon width={17} height={17} /></ZoomButton>
        </div>
      </div>
    );
  }
  const sunLabel = sun.on ? hhmm(sun.minutes) : t('bar.sun');
  return (
    <div className={cx('pointer-events-auto flex items-center gap-1.5', compact && 'w-full')} role="toolbar" aria-label={t('views.label')}>
      <RowButton compact={compact} icon={<CubeIcon width={icon} height={icon} />} ariaLabel={t('bar.views')} expanded={tray === 'views'} active={tray === 'views'} controls={TRAY_ID.views} onClick={() => toggle('views')} testId="bar-views">
        {t('bar.views')}
      </RowButton>
      <RowButton compact={compact} icon={<LayersIcon width={icon} height={icon} />} ariaLabel={cut ? `${t('bar.levels')}: ${lv(cut)}` : t('bar.levels')} expanded={tray === 'levels'} active={tray === 'levels'} controls={TRAY_ID.levels} onClick={() => toggle('levels')} testId="bar-levels">
        {cut ? lv(cut) : t('bar.levels')}
      </RowButton>
      <RowButton
        compact={compact}
        icon={<SunIcon width={icon} height={icon} />}
        ariaLabel={sun.on ? `${t('bar.sun')} ${sunLabel}` : t('bar.sun')}
        expanded={tray === 'sun'}
        active={tray === 'sun'}
        on={sun.on}
        controls={TRAY_ID.sun}
        testId="bar-sun"
        onClick={() => {
          if (tray === 'sun') setTray(null);
          else {
            setTray('sun');
            if (!sun.on) setSun({ on: true });
          }
        }}
      >
        <span className={cx(sun.on && 'tnum')}>{sunLabel}</span>
      </RowButton>
      <RowButton compact={compact} icon={<WalkIcon width={icon} height={icon} />} ariaLabel={t('bar.walk')} active={walk} onClick={() => setWalk(!walk)} testId="bar-walk">
        {t('bar.walk')}
      </RowButton>
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-8 place-items-center rounded-full text-ink-2 transition-colors hover:bg-wash hover:text-ink">
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Trays                                                               */
/* ------------------------------------------------------------------ */

/** The open tray, above the secondary row. Focus moves in when it opens and back to its button on Escape. */
export function TrayHost({ levels, compact }: { levels: LevelInfo[] | null; compact?: boolean }) {
  const tray = useStudio((s) => s.tray);
  const mode = useStudio((s) => s.mode);
  const setTray = useStudio((s) => s.setTray);
  const ref = useRef<HTMLDivElement>(null);
  const shown = mode === 'sheet' ? null : mode === 'plan' && tray !== 'levels' ? null : tray;
  useDismiss(!!shown, (viaKey) => {
    const trig = document.querySelector<HTMLElement>(`[aria-controls="${TRAY_ID[shown!]}"]`);
    setTray(null);
    if (viaKey) trig?.focus();
  }, [ref], '[data-tray-trigger], [role=dialog]');
  // Presses on the trigger row toggle it themselves; a press on the drawing closes it.
  useLayoutEffect(() => {
    if (!shown) return;
    const el = ref.current;
    const target = el?.querySelector<HTMLElement>('[aria-checked=true], [aria-pressed=true], button, input');
    target?.focus({ preventScroll: true });
  }, [shown]);
  if (!shown) return null;
  return (
    <div
      ref={ref}
      id={TRAY_ID[shown]}
      role="group"
      aria-label={shown}
      data-testid={TRAY_ID[shown]}
      onPointerDownCapture={(e) => e.stopPropagation()}
      className={cx('glass-solid pointer-events-auto animate-[tray-in_160ms_cubic-bezier(0.22,0.8,0.24,1)] rounded-[14px]', compact ? 'w-full' : '')}
    >
      {shown === 'views' && <ViewsTray compact={compact} />}
      {shown === 'levels' && levels && <LevelsTray levels={levels} compact={compact} />}
      {shown === 'sun' && <SunTray compact={compact} />}
    </div>
  );
}

/** The nine presets as a small plan diagram: corners = axonometric, sides = elevations; eye level and reset below. */
function ViewsTray({ compact }: { compact?: boolean }) {
  const t = useT();
  const walk = useStudio((s) => s.walk);
  const view = useStudio((s) => (walk || s.viewMoved ? null : s.view));
  const setView = useStudio((s) => s.setView);
  const resetView = useStudio((s) => s.resetView);
  const cell = (id: ViewId, label: string) => (
    <button
      key={id}
      type="button"
      aria-label={t(`view.${id}`)}
      aria-pressed={view === id}
      title={t(`view.${id}`)}
      onClick={() => setView(id)}
      className={cx(
        'flex flex-col items-center justify-center gap-0.5 rounded-[9px] transition-colors',
        compact ? 'h-[54px]' : 'h-[52px] w-[68px]',
        view === id ? 'bg-ink text-white' : 'text-ink hover:bg-wash',
      )}
    >
      <ViewIcon id={id} width={20} height={20} />
      <span className={cx('text-[11px] leading-3', view === id ? 'text-white/80' : 'text-ink-2')}>{label}</span>
    </button>
  );
  const short = (id: ViewId) => t(`viewShort.${id}` as MessageKey);
  const elev = (id: ViewId) => (presetById(id).kind === 'elevation' ? t(`view.${id}`) : short(id));
  return (
    <div className={cx('p-2', compact ? 'w-full' : 'w-[236px]')}>
      <div className={cx('grid grid-cols-3 gap-1', compact && 'mx-auto max-w-[300px]')}>
        {cell('axo-nw', short('axo-nw'))}
        {cell('elev-north', elev('elev-north'))}
        {cell('axo-ne', short('axo-ne'))}
        {cell('elev-west', elev('elev-west'))}
        <div className="grid place-items-center" aria-hidden="true">
          <div className="relative grid size-9 place-items-center rounded-[4px] border border-dashed border-ink-3/60">
            <span className="text-[10px] font-semibold text-ink-3">N↑</span>
          </div>
        </div>
        {cell('elev-east', elev('elev-east'))}
        {cell('axo-sw', short('axo-sw'))}
        {cell('elev-south', elev('elev-south'))}
        {cell('axo-se', short('axo-se'))}
      </div>
      <div className={cx('mt-1.5 flex gap-1 border-t border-hairline pt-1.5', compact && 'mx-auto max-w-[300px]')}>
        <button
          type="button"
          aria-label={t('view.eye-sw')}
          aria-pressed={view === 'eye-sw'}
          onClick={() => setView('eye-sw')}
          className={cx('flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] text-xs font-medium transition-colors', view === 'eye-sw' ? 'bg-ink text-white' : 'text-ink hover:bg-wash')}
        >
          <ViewIcon id="eye-sw" width={18} height={18} />
          {t('views.eye')}
        </button>
        <button type="button" aria-label={t('view.reset')} onClick={resetView} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] text-xs font-medium text-ink transition-colors hover:bg-wash">
          <ResetViewIcon width={16} height={16} />
          {t('view.resetShort')}
        </button>
      </div>
      <p className="mt-1 text-center text-2xs text-ink-3">{t('views.hint')}</p>
    </div>
  );
}

function LevelsTray({ levels, compact }: { levels: LevelInfo[]; compact?: boolean }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const mode = useStudio((s) => s.mode);
  const cut = useStudio((s) => s.cut);
  const setCut = useStudio((s) => s.setCut);
  const level = useStudio((s) => s.level);
  const setLevel = useStudio((s) => s.setLevel);
  const paused = useStudio((s) => !!s.cut && presetById(s.view).kind !== 'axo');
  const names = levels.map((l) => ({ value: l.id, label: levelName(lang, l.name, l.index, l.isAttic) }));
  const seg = compact ? 'lg' : 'md';
  return (
    <div className={cx('p-1.5', compact && 'w-full')}>
      {mode === 'plan' ? (
        <Segmented label={t('levels.label')} size={seg} value={level ?? levels[0]!.id} onChange={setLevel} segments={names} className="p-0!" />
      ) : (
        <>
          <Segmented<string>
            label={t('cut.label')}
            size={seg}
            soft={paused}
            value={cut ?? 'all'}
            onChange={(v) => setCut(v === 'all' ? null : v)}
            className="p-0!"
            segments={[{ value: 'all', label: t('cut.all') }, ...names]}
          />
          {paused && <p className="px-2 pt-1 pb-0.5 text-center text-2xs text-ink-3">{t('cut.paused')}</p>}
        </>
      )}
    </div>
  );
}

/** Time of day on a sunrise..sunset track, with a play button (the sun study). */
export function SunTime({ className, readout = true }: { className?: string; readout?: boolean }) {
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
        className={cx('grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-150', sun.on ? 'bg-accent text-ink hover:brightness-95' : 'bg-wash text-ink hover:bg-accent')}
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
      {readout && (
        <div className="w-[52px] shrink-0 text-right">
          <p className={cx('tnum text-[15px] leading-5 font-medium tracking-tight', sun.on ? 'text-ink' : 'text-ink-2')}>{hhmm(value)}</p>
          <p className="tnum truncate text-2xs text-ink-2">{info && sun.on ? `${compass(info.azimuth, lang)} ${Math.max(0, Math.round(info.elevation))}°` : t('sun.offShort')}</p>
        </div>
      )}
    </div>
  );
}

/** The date of the sun study: a chip that opens a tiny menu of the presets (seasons of the site). */
function DateChip() {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const sun = useStudio((s) => s.sun);
  const setSun = useStudio((s) => s.setSun);
  const lat = useStudio((s) => s.house?.site.latitude ?? 30);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useDismiss(open, (k) => {
    setOpen(false);
    if (k) btn.current?.focus();
  }, [box]);
  return (
    <div ref={box} className="relative">
      <button
        ref={btn}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t('sun.dates')}: ${t(`sun.date.${sun.dateId}`)}`}
        onClick={() => setOpen(!open)}
        className="inline-flex h-8 items-center gap-1 rounded-full bg-wash pr-2 pl-3 text-xs font-medium text-ink transition-colors hover:bg-hairline"
        data-testid="sun-date"
      >
        {t(`sun.date.${sun.dateId}`)}
        {lang === 'zh' && <span className="tnum font-normal text-ink-2">{dayText(sunDate(sun.dateId, lat), lang)}</span>}
        <ChevronDownSmallIcon width={14} height={14} className="text-ink-3" />
      </button>
      {open && (
        <div className="glass-solid absolute bottom-full left-0 z-10 mb-1.5 w-[168px] rounded-ui p-1" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <Segmented<SunDateId>
            label={t('sun.dates')}
            size="sm"
            value={sun.dateId}
            onChange={(dateId) => {
              setSun({ dateId, on: true });
              setOpen(false);
              btn.current?.focus();
            }}
            className="flex-col [&>button]:justify-between [&>button]:px-2.5"
            segments={SUN_DATES.map((id) => ({
              value: id,
              label: (
                <>
                  <span>{t(`sun.date.${id}`)}</span>
                  <span className="tnum font-normal opacity-70">{dayText(sunDate(id, lat), lang)}</span>
                </>
              ),
            }))}
          />
        </div>
      )}
    </div>
  );
}

function SiteChip({ kind }: { kind: 'location' | 'orientation' }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const site = useStudio((s) => s.house?.site);
  const setSitePanel = useStudio((s) => s.setSitePanel);
  if (!site) return null;
  const text = kind === 'location' ? placeText(site, lang) : bearingText(frontBearing(site.northDeg), lang);
  return (
    <button
      type="button"
      onClick={() => setSitePanel({ kind })}
      aria-label={`${kind === 'location' ? t('more.location') : t('more.orientation')}: ${text}`}
      data-testid={kind === 'location' ? 'sun-place' : 'sun-orientation'}
      className="inline-flex h-8 max-w-[220px] min-w-0 items-center gap-1 rounded-full bg-wash pr-3 pl-2 text-xs font-medium text-ink transition-colors hover:bg-hairline"
    >
      {kind === 'location' ? <PinIcon width={15} height={15} className="shrink-0 text-ink-2" /> : <CompassIcon width={15} height={15} className="shrink-0 text-ink-2" />}
      <span className="truncate">{text}</span>
    </button>
  );
}

/** The sun strip: play, time, sun position; date, place, orientation, solar noon; off. */
function SunTray({ compact }: { compact?: boolean }) {
  const t = useT();
  const info = useStudio((s) => s.sunInfo);
  const tz = useStudio((s) => !!s.house?.site.timeZone);
  const setSun = useStudio((s) => s.setSun);
  const setTray = useStudio((s) => s.setTray);
  return (
    <div className={cx('px-3 pt-2.5 pb-2', compact ? 'w-full' : 'w-[600px] max-w-[calc(100vw-48px)]')}>
      <SunTime />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <DateChip />
        <SiteChip kind="location" />
        <SiteChip kind="orientation" />
        <span className="tnum ml-1 truncate text-2xs text-ink-2" data-testid="sun-noon">
          {info ? t('sun.noon', { t: hhmm(info.solarNoon) }) : ''}
          {info && (tz || info.utcOffsetHours !== 8) ? ` · ${utcText(info.utcOffsetHours)}` : ''}
        </span>
        <button
          type="button"
          onClick={() => {
            setSun({ on: false, playing: false });
            setTray(null);
          }}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-full pr-2.5 pl-2 text-xs whitespace-nowrap text-ink-2 transition-colors hover:bg-wash hover:text-ink"
        >
          <CloseIcon width={14} height={14} />
          {t('sun.exit')}
        </button>
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

/* ------------------------------------------------------------------ */
/* First-visit hints                                                   */
/* ------------------------------------------------------------------ */

const HINTS_KEY = 'opensu.hints.v1';

function hintsDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(HINTS_KEY) === 'done';
  } catch {
    return true;
  }
}

/** Three small chips for a first visit; any use (or ×) dismisses them for good. */
export function Hints({ compact }: { compact?: boolean }) {
  const t = useT();
  const [gone, setGone] = useState(true);
  useEffect(() => setGone(hintsDismissed() || new URLSearchParams(location.search).has('nohints')), []);
  const busy = useStudio((s) => s.tray !== null || s.walk || s.mode !== '3d');
  if (gone || busy) return null;
  const done = () => {
    setGone(true);
    try {
      localStorage.setItem(HINTS_KEY, 'done');
    } catch {
      /* private mode: gone for this page only */
    }
  };
  const s = useStudio.getState;
  const chips: [MessageKey, () => void][] = [
    ['hint.sun', () => { s().setTray('sun'); s().setSun({ on: true, dateId: 'winter' }); }],
    ['hint.walk', () => s().setWalk(true)],
    ['hint.sheets', () => s().setMode('sheet')],
  ];
  return (
    <div className={cx('pointer-events-auto flex animate-[fade-in_300ms_ease-out] items-center gap-1.5', compact && 'max-w-full overflow-x-auto')} data-testid="hints">
      {chips.map(([k, run]) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            done();
            run();
          }}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-accent/70 bg-white/90 pr-3 pl-2 text-xs font-medium text-ink shadow-hair transition-colors hover:bg-accent"
        >
          <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
          {t(k)}
        </button>
      ))}
      <button type="button" onClick={done} aria-label={t('hint.dismiss')} title={t('hint.dismiss')} className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-white hover:text-ink">
        <CloseIcon width={14} height={14} />
      </button>
    </div>
  );
}

