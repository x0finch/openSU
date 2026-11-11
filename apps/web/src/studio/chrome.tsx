// Studio chrome around the drawing: the house name (with a quiet project
// menu), the mode switch, the first-visit hints and the day player. The
// toolbar and its panels live in tools.tsx, the conversation in chat/.
import { Link } from '@tanstack/react-router';
import { type KeyboardEvent as RKeyboardEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TEMPLATE_META } from '@opensu/agent/templates-meta';
import { ChevronDownSmallIcon, CloseIcon, CompassIcon, LayersIcon, Mark, PinIcon, ResetViewIcon } from '../components/icons';
import { cx, Segmented } from '../components/ui';
import { type MessageKey, useT } from '../lib/i18n';
import { freshView, type Mode, useStudio } from '../lib/store';
import { resetToTemplate } from '../lib/autosave';
import { bearingText, frontBearing, placeText } from '../lib/site';
import { replaceHouse, useChat } from '../chat/chat-store';
import type { Derived } from './house-data';
import { loadHouseData } from './useDerived';

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
    <p className={cx('tnum truncate text-xs text-ink-2 max-[339px]:text-[11.5px]', className)}>
      <span>{`${fmtLen(derived.plot.width)} × ${fmtLen(derived.plot.depth)} m`}</span>
      <span className="mx-1 text-ink-3">·</span>
      <span data-testid="fact-area">{`${fmtArea(derived.area)} m²`}</span>
      {/* The narrowest phones drop the storeys so the top row fits on one line. */}
      <span className="max-[339px]:hidden">
        <span className="mx-1 text-ink-3">·</span>
        <span>{storeys}</span>
      </span>
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
          'hit group -ml-2 flex max-w-[calc(100%+8px)] items-center gap-[7px] rounded-[9px] px-2 text-left transition-colors hover:bg-wash/80',
          compact ? 'h-8' : 'h-9',
          open && 'bg-wash',
        )}
      >
        <Mark width={18} height={18} className="shrink-0" />
        <span className={cx('truncate', compact ? 'text-[16px] max-[339px]:text-[15px]' : 'text-[18px]')}>{name}</span>
        <ChevronDownSmallIcon width={16} height={16} className={cx('-ml-1 shrink-0 text-ink-3 transition-transform duration-150 group-hover:text-ink-2', open && 'rotate-180')} />
      </button>
      <Facts derived={derived} className={cx('pl-0', compact ? 'mt-0' : 'mt-0.5')} />
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
    freshView();
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
      className={cx(className, size === 'sm' && 'p-[3px]! [&>button]:hit [&>button]:h-[30px] [&>button]:px-[11px] [&>button]:text-[13px] max-[339px]:[&>button]:px-2')}
      segments={[
        { value: '3d', label: t('mode.3d') },
        { value: 'plan', label: t('mode.plan') },
        { value: 'sheet', label: t('mode.sheet') },
      ]}
    />
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

/**
 * Three small chips for a first visit, just above the input. Any
 * meaningful interaction (a tool, a view, orbiting, a mode, the assistant,
 * walking...) or the × dismisses them for good.
 */
export function Hints({ className }: { className?: string }) {
  const t = useT();
  const [gone, setGone] = useState(true);
  useEffect(() => setGone(hintsDismissed() || new URLSearchParams(location.search).has('nohints')), []);
  const busy = useStudio((s) => s.tray !== null || s.walk || s.mode !== '3d' || s.recent || s.pinned || !!s.sitePanel);
  const done = () => {
    setGone(true);
    try {
      localStorage.setItem(HINTS_KEY, 'done');
    } catch {
      /* private mode: gone for this page only */
    }
  };
  const doneRef = useRef(done);
  doneRef.current = done;
  // The first interaction of any kind ends the hints.
  useEffect(() => {
    if (gone) return;
    const a = useStudio.subscribe((s, p) => {
      if (s.tray !== p.tray || s.mode !== p.mode || s.viewNonce !== p.viewNonce || s.cut !== p.cut || s.sun.on !== p.sun.on || s.sun.minutes !== p.sun.minutes || s.walk !== p.walk || s.recent !== p.recent || s.pinned !== p.pinned || s.sitePanel !== p.sitePanel || (s.viewMoved && !p.viewMoved) || s.lang !== p.lang) doneRef.current();
    });
    const b = useChat.subscribe((s, p) => {
      if (s.items.length !== p.items.length || (s.draft && !p.draft) || s.settingsOpen !== p.settingsOpen) doneRef.current();
    });
    return () => {
      a();
      b();
    };
  }, [gone]);
  if (gone || busy) return null;
  const s = useStudio.getState;
  const chips: [MessageKey, () => void][] = [
    ['hint.sun', () => { s().setSun({ on: true, dateId: 'winter' }); s().setTray('sun'); }],
    ['hint.walk', () => s().setWalk(true)],
    ['hint.sheets', () => s().setMode('sheet')],
  ];
  return (
    <div className={cx('pointer-events-auto flex animate-[fade-in_300ms_ease-out] items-center gap-1.5', className)} data-testid="hints">
      {chips.map(([k, run]) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            done();
            run();
          }}
          className="hit inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-accent/70 bg-white pr-3 pl-2 text-xs font-medium text-ink shadow-hair transition-colors hover:bg-accent"
        >
          <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
          {t(k)}
        </button>
      ))}
      <button type="button" onClick={done} aria-label={t('hint.dismiss')} title={t('hint.dismiss')} className="hit grid size-7 shrink-0 place-items-center rounded-full bg-white text-ink-3 shadow-hair transition-colors hover:text-ink">
        <CloseIcon width={14} height={14} />
      </button>
    </div>
  );
}
