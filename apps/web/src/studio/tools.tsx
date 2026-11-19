// The studio's tools (tasks 015, 017): one tool group (视角 / 楼层 / 日照 / 漫游) and
// the panel a tool needs, all on the glass primitives. Desktop: a glass
// group top-right, icons with name tooltips; a panel flows out of the whole
// group. Phone: a tab-bar capsule at the bottom (icon over label); the panel
// is an inset glass sheet the tool bar rides on (PhoneDock).
import { lazy, type ReactNode, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { CubeIcon, FitIcon, LayersIcon, MinusIcon, PlusIcon, SunIcon } from '../components/icons';
import { cx } from '../components/ui';
import { Popover, Segmented, ToolbarButton, ToolbarGroup } from '@opensu/ui';
import { levelName, type MessageKey, useT } from '../lib/i18n';
import { type Tray, useStudio } from '../lib/store';
import { clock } from '../lib/sun';
import { DEFAULT_VIEW } from '../lib/views';
import type { Derived } from './house-data';
import { planCommands } from './plan-commands';
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
    <ToolbarButton
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
        <ToolbarGroup label={t('tools.label')} testId="toolbar">
          {tool('levels', <LayersIcon {...icon} />, t('bar.levels'), values.planLevel, 'bar-levels')}
          <ToolbarButton icon={<MinusIcon width={18} height={18} />} label={t('plan.zoomOut')} onClick={() => planCommands.zoom(1 / 1.4)} />
          <ToolbarButton icon={<FitIcon width={18} height={18} />} label={t('plan.fit')} onClick={() => planCommands.fit()} />
          <ToolbarButton icon={<PlusIcon width={18} height={18} />} label={t('plan.zoomIn')} onClick={() => planCommands.zoom(1.4)} />
        </ToolbarGroup>
      </div>
    );
  }
  return (
    <div className={cx('pointer-events-none flex items-center', className)}>
      <ToolbarGroup label={t('tools.label')} testId="toolbar">
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
        <ToolbarButton
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
      </ToolbarGroup>
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
    <Segmented<PhoneTool>
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
/* Panel contents (panels.tsx, loaded when idle or on first open)       */
/* ------------------------------------------------------------------ */

const LazyPanelBody = lazy(() => import('./panels').then((m) => ({ default: m.PanelBody })));
let panelsLoad: Promise<unknown> | null = null;
/** Fetches the panels' code ahead of the first open (the studio calls it when the page is idle). */
export function preloadPanels(): void {
  panelsLoad ??= import('./panels');
}

/** The content of the open panel (header included); null when none is open. */
export function PanelBody(props: { derived: Derived | null; phone?: boolean; kind?: Tray | 'site' }) {
  return (
    <Suspense fallback={null}>
      <LazyPanelBody {...props} />
    </Suspense>
  );
}

/** How the last interaction happened: a panel opened from the keyboard takes the focus along. */
let keyboardUser = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow')) keyboardUser = true;
  }, true);
  window.addEventListener('pointerdown', () => (keyboardUser = false), true);
}

/** Where focus goes in an open panel: the chosen option, else the first control. */
function focusTarget(el: HTMLElement | null | undefined): HTMLElement | null {
  return el?.querySelector<HTMLElement>('[aria-checked=true], [aria-pressed=true], button:not([data-panel-close]), input:not([type=text])') ?? null;
}

/**
 * Moves focus into a panel when it opens from the keyboard (the chosen
 * option, else the first control); Escape brings it back to the tool. The
 * phone sheet's; a desktop panel gives the same rule to Base UI
 * (`initialFocus`).
 */
export function useFocusOnOpen(ref: React.RefObject<HTMLElement | null>, key: string | null): void {
  useLayoutEffect(() => {
    if (!key || !keyboardUser) return;
    focusTarget(ref.current)?.focus({ preventScroll: true });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The control a panel opens below: its tool (a site panel from the sun panel: the sun tool), or the house name (a site panel from its menu). */
function anchorOf(panel: Tray | 'site'): string {
  const sp = panel === 'site' ? useStudio.getState().sitePanel : null;
  if (sp && !sp.fromSun) return '[data-house-name]';
  return `[data-testid=toolbar] [aria-controls="${TRAY_ID[panel === 'site' ? 'sun' : panel]}"]`;
}

/**
 * Desktop: the open panel, an anchored glass surface. Task 029: it floats
 * below its own tool at the module's gap like any popover (one at a time;
 * a panel being replaced flows back into its tool), or under the house name
 * for a site panel from its menu. Reports its box so the house frames
 * beside or below it.
 */
export function PanelCard({ derived, onRect }: { derived: Derived | null; onRect: (r: { left: number; right: number; bottom: number } | null) => void }) {
  const open = useOpenPanel();
  const siteKind = useStudio((s) => s.sitePanel?.kind ?? null);
  const current = open ? (open === 'site' ? `site-${siteKind}` : open) : null;
  // Each panel keeps the attachment it opened with (a site panel flows back where it came from).
  const [panels, setPanels] = useState<{ key: string; panel: Tray | 'site'; anchor: string }[]>([]);
  useLayoutEffect(() => {
    if (current && open && !panels.some((p) => p.key === current)) setPanels((ps) => [...ps, { key: current, panel: open, anchor: anchorOf(open) }]);
    if (!current) onRect(null);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef<HTMLElement>(null);
  const setTray = useStudio((s) => s.setTray);
  return (
    <>
      {panels.map((p) => {
        const on = p.key === current;
        const byName = p.anchor === '[data-house-name]';
        return (
          <Popover
            key={p.key}
            ref={on ? ref : undefined}
            open={on}
            phone={false}
            anchor={() => document.querySelector<HTMLElement>(p.anchor)}
            placement={byName ? 'below-start' : 'below-center'}
            size="tool"
            onClose={() => setTray(null)}
            // A tool's panel stays while the drawing is used (a click on the drawing closes it, Studio.tsx); Escape closes it.
            closeOnOutsidePress={false}
            // Opened from the keyboard, focus goes to the chosen option (else the first control); opened by a press it stays.
            initialFocus={() => (keyboardUser ? focusTarget(ref.current) ?? true : false)}
            onClosed={() => setPanels((ps) => ps.filter((q) => q.key !== p.key))}
            onBox={on ? onRect : undefined}
            id={p.panel === 'site' ? undefined : TRAY_ID[p.panel]}
            role="group"
            label={p.panel === 'site' ? undefined : p.panel}
            testId={on ? (p.panel === 'site' ? 'panel-site' : TRAY_ID[p.panel]) : undefined}
            // Clear of the input at the bottom (its 112 px), as before.
            maxHeight="calc(100vh - 66px - 112px)"
          >
            {/* A closing panel keeps its content (inert, so out of reach) and leaves as itself; one replaced by another
                panel's opening is an empty shape at once (no duplicate controls while both are mounted). */}
            {(on || !current) && <PanelBody derived={derived} kind={p.panel} />}
          </Popover>
        );
      })}
    </>
  );
}
