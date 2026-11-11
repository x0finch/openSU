// Studio chrome: floating controls over the drawing (desktop) and their
// bottom-sheet counterparts (phone).
import { Link } from '@tanstack/react-router';
import { type PointerEvent as RPointerEvent, useEffect, useRef, useState } from 'react';
import { ChevronRightIcon, CloseIcon, FitIcon, Mark, MinusIcon, PlusIcon, ResetViewIcon, SendIcon, SparkIcon, SunIcon, ViewIcon } from '../components/icons';
import { Caption, cx, IconButton, LangToggle, Segmented, Tip } from '../components/ui';
import { levelName, type MessageKey, useT } from '../lib/i18n';
import { type Mode, useStudio } from '../lib/store';
import { VIEW_GROUPS } from '../lib/views';
import type { Derived, LevelInfo } from './house-data';
import { planCommands } from './PlanView';

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
    <Segmented<Mode | 'sheet'>
      label={t('mode.label')}
      size={size}
      value={mode}
      onChange={(v) => v !== 'sheet' && setMode(v)}
      className={className}
      segments={[
        { value: '3d', label: t('mode.3d') },
        { value: 'plan', label: t('mode.plan') },
        { value: 'sheet', label: t('mode.sheet'), disabled: true, hint: t('soon') },
      ]}
    />
  );
}

export function ViewRail() {
  const t = useT();
  const view = useStudio((s) => s.view);
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

export function SunBar({ className, compact }: { className?: string; compact?: boolean }) {
  const t = useT();
  const value = 10.5;
  const fill = ((value - 6) / 12) * 100;
  const time = `${Math.floor(value)}:${String(Math.round((value % 1) * 60)).padStart(2, '0')}`;
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <span className="flex items-center gap-1.5 text-sm text-ink-2">
        <SunIcon width={18} height={18} />
        {!compact && <span>{t('sun.label')}</span>}
      </span>
      <div className="relative min-w-0 flex-1 pb-3">
        <input
          type="range"
          className="range block w-full opacity-60"
          min={6}
          max={18}
          step={0.25}
          value={value}
          disabled
          readOnly
          aria-label={t('sun.label')}
          aria-describedby="sun-hint"
          style={{ ['--fill' as string]: `${fill}%` }}
        />
        <div className="tnum pointer-events-none absolute inset-x-[8px] bottom-0 flex justify-between text-[10px] leading-none text-ink-3" aria-hidden="true">
          {[6, 9, 12, 15, 18].map((h) => (
            <span key={h} className="w-0 text-center whitespace-nowrap">
              <span className="inline-block -translate-x-1/2">{h}</span>
            </span>
          ))}
        </div>
      </div>
      <span className="tnum w-10 text-right text-sm text-ink">{time}</span>
      <span id="sun-hint" className="rounded-[5px] bg-wash px-1.5 py-0.5 text-2xs whitespace-nowrap text-ink-2">
        {t('soon')}
      </span>
    </div>
  );
}

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
  const onUp = () => {
    if (start.current === null) return;
    if (Math.abs(dragY) < 6) setOpen(!open);
    else if (dragY > 30) setOpen(false);
    else if (dragY < -30) setOpen(true);
    start.current = null;
    setDragY(0);
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
        className="flex h-6 w-full touch-none items-start justify-center pt-2"
      >
        <span className="h-1 w-9 rounded-full bg-hairline" />
      </button>
      <div className="px-4">
        <ModeSwitch size="lg" className="bg-wash" />
        <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out-soft', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="min-h-0 overflow-hidden" inert={!open}>
            {mode === '3d' ? (
              <>
                <Caption className="mt-4 tracking-normal normal-case">{t('views.label')}</Caption>
                <div className="mt-2 grid grid-cols-5 gap-1.5" role="group" aria-label={t('views.label')}>
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
                <SunBar compact className="mt-4 mb-1 h-11" />
              </>
            ) : (
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
          </div>
        </div>
      </div>
    </div>
  );
}
