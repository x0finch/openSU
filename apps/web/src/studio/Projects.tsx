// "My projects" (task 027): one surface, opened from the project menu (under
// the house name) and from the account menu (at the account button).
// Desktop: a glass popover at its opener; phone: the inset bottom sheet.
// "New project" first (the templates open in place), then the projects,
// most recent first: the open one carries a check mark; each row has its
// actions in place (rename, duplicate, delete; delete asks once, in the
// row). No box inside the surface: rows on plates, inset hairlines.
// Signed out, opening it leads to sign-in with one line on why.
import { TEMPLATE_META } from '@opensu/agent/templates-meta';
import { type KeyboardEvent as RKeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { CheckIcon, ChevronDownSmallIcon, CloseIcon, MoreIcon, PlusIcon } from '../components/icons';
import { cx, GlassIconButton, GlassPopover, GlassSep, GlassSheet } from '../glass';
import { type Lang, type MessageKey, useT } from '../lib/i18n';
import { fmtArea, fmtLen, parseSummary, type ProjectMeta, projectName, projectSync, useProjects } from '../lib/projects';
import { useStudio } from '../lib/store';
import { openSignIn, useAccount } from '../chat/account';
import { useChat } from '../chat/chat-store';

const HOUSE_NAME = '[data-house-name]';
const ACCOUNT = '[data-account-button]';
type Rect = { x: number; y: number; width: number; height: number };

interface SurfaceState {
  open: boolean;
  /** Opened from the project menu (under the house name) or the account menu (at the account button). */
  from: 'menu' | 'account';
  /** The menu row it grows out of (that row closed with its menu). */
  rect: Rect | null;
}
const useSurface = create<SurfaceState>(() => ({ open: false, from: 'menu', rect: null }));

/** Opens "My projects" from a menu row; signed out, the sign-in surface (it says why). */
export function openProjects(el: HTMLElement | null, from: 'menu' | 'account'): void {
  if (!useChat.getState().server?.user) {
    openSignIn(el, from === 'menu' ? 'menu' : 'account', 'projects');
    return;
  }
  const r = el?.getBoundingClientRect();
  useSurface.setState({ open: true, from, rect: r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null });
  void projectSync.refresh();
}

export const closeProjects = () => useSurface.setState({ open: false });

/** The server keeps projects with accounts (and offers sign-in). */
export const useProjectsOffered = () => useChat((s) => !!s.server?.projects && !!(s.server.auth?.email || s.server.auth?.google));

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** When it was last changed, as people say it: just now, 3 minutes ago, yesterday, a date. */
export function changedText(lang: Lang, t: (k: MessageKey) => string, at: number, now = Date.now()): string {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return t('projects.justNow');
  const loc = lang === 'zh' ? 'zh-CN' : 'en';
  const rel = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
  if (s < 3600) return rel.format(-Math.floor(s / 60), 'minute');
  const a = new Date(at), n = new Date(now);
  const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86_400_000);
  if (days === 0) return rel.format(-Math.floor(s / 3600), 'hour');
  if (days < 7) return rel.format(-days, 'day');
  return new Intl.DateTimeFormat(loc, a.getFullYear() === n.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }).format(a);
}

function facts(t: ReturnType<typeof useT>, p: ProjectMeta): string {
  const s = parseSummary(p.summary);
  if (!s) return '';
  const storeys = s.attic ? t('facts.storeysAttic', { n: s.storeys }) : t('facts.storeysValue', { n: s.storeys });
  return [`${fmtLen(s.w / 1000)} × ${fmtLen(s.d / 1000)} m`, `${fmtArea(s.area)} m²`, storeys].join(' · ');
}

/* ------------------------------------------------------------------ */
/* The list                                                            */
/* ------------------------------------------------------------------ */

/** A text action in a row (rename, duplicate, delete, cancel): a filled plate. */
function Action({ children, onClick, danger, testId, phone }: { children: ReactNode; onClick: () => void; danger?: boolean; testId: string; phone?: boolean }) {
  return (
    <button type="button" onClick={onClick} data-filled="" data-testid={testId} className={cx('hit lg-plate shrink-0 px-3 text-[13px] font-medium', phone ? 'h-9' : 'h-8', danger ? 'text-[var(--lg-danger)]' : 'text-ink')}>
      {children}
    </button>
  );
}

function ProjectRow({ p, open, phone, expanded, onExpand, error }: { p: ProjectMeta; open: boolean; phone?: boolean; expanded: boolean; onExpand: (v: boolean) => void; error: (msg: string | null) => void }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const busy = useProjects((s) => s.busy);
  const [mode, setMode] = useState<'idle' | 'rename' | 'delete'>('idle');
  const name = projectName(lang, p);
  const [draft, setDraft] = useState(name);
  const field = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded) setMode('idle');
  }, [expanded]);
  useLayoutEffect(() => {
    if (mode === 'rename') {
      field.current?.focus();
      field.current?.select();
    }
    if (mode === 'delete') row.current?.querySelector<HTMLElement>('[data-testid=project-delete-confirm]')?.focus();
  }, [mode]);
  const done = (ok: boolean) => error(ok ? null : t('projects.failed'));
  const commitRename = async () => {
    if (mode !== 'rename') return;
    setMode('idle');
    onExpand(false);
    const next = draft.trim();
    if (next === name || !next) return;
    done(await projectSync.rename(p.id, next));
  };
  const when = changedText(lang, (k) => t(k), p.updatedAt);
  const height = phone ? 'min-h-[60px]' : 'min-h-[54px]';

  if (mode === 'delete') {
    return (
      <div ref={row} className={cx('flex items-center gap-2 rounded-[16px] pr-1.5 pl-3', height)} data-testid="project-row" data-id={p.id} data-state="delete">
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium" data-testid="project-delete-ask">{t('projects.deleteAsk', { name })}</span>
        <Action
          danger
          phone={phone}
          testId="project-delete-confirm"
          onClick={async () => {
            onExpand(false);
            done(await projectSync.remove(p.id));
          }}
        >
          {t('projects.delete')}
        </Action>
        <Action
          phone={phone}
          testId="project-delete-cancel"
          onClick={() => {
            setMode('idle');
            onExpand(false);
          }}
        >
          {t('projects.cancel')}
        </Action>
      </div>
    );
  }

  return (
    <div ref={row} data-testid="project-row" data-id={p.id} data-open={open ? '' : undefined} data-state={mode}>
      <div className={cx('flex items-center gap-1', height)}>
        {mode === 'rename' ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-3">
            <span className="grid size-5 shrink-0 place-items-center">{open && <CheckIcon width={18} height={18} aria-hidden="true" />}</span>
            <form
              className="min-w-0 flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                void commitRename();
              }}
            >
              <label className="lg-field flex h-9 items-center rounded-[12px] px-2.5">
                <span className="sr-only">{t('projects.nameLabel')}</span>
                <input
                  ref={field}
                  value={draft}
                  maxLength={80}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraft(name);
                      setMode('idle');
                    }
                  }}
                  className="w-full min-w-0 bg-transparent text-[14px] font-medium outline-none"
                  data-testid="project-name-input"
                />
              </label>
            </form>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (open) {
                closeProjects();
                return;
              }
              const ok = await projectSync.open(p.id);
              if (ok) closeProjects();
              else error(t('projects.failed'));
            }}
            aria-current={open ? 'true' : undefined}
            className={cx('lg-plate flex min-w-0 flex-1 items-center gap-2.5 self-stretch rounded-[16px] pr-1 pl-3 text-left', open && 'cursor-default')}
            data-testid="project-open"
          >
            <span className="grid size-5 shrink-0 place-items-center" aria-label={open ? t('projects.current') : undefined}>
              {open && <CheckIcon width={18} height={18} />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col py-1.5">
              <span className="truncate text-[14px] leading-5 font-medium" data-testid="project-name">{name}</span>
              <span className="tnum truncate text-[12px] leading-4 text-ink-2" data-testid="project-facts">
                {facts(t, p)}
                <span className="mx-1 text-ink-3">·</span>
                <span data-testid="project-when">{when}</span>
              </span>
            </span>
          </button>
        )}
        <GlassIconButton label={t('projects.more')} size={phone ? 36 : 32} aria-expanded={expanded} onClick={() => onExpand(!expanded)} className="mr-1.5" data-testid="project-more" tip={!phone}>
          <MoreIcon width={18} height={18} />
        </GlassIconButton>
      </div>
      {expanded && mode === 'idle' && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 pb-2 pl-[42px]" data-testid="project-actions">
          <Action
            phone={phone}
            testId="project-rename"
            onClick={() => {
              setDraft(name);
              setMode('rename');
            }}
          >
            {t('projects.rename')}
          </Action>
          <Action
            phone={phone}
            testId="project-duplicate"
            onClick={async () => {
              onExpand(false);
              const r = await projectSync.duplicate(p.id);
              error(r === null ? null : r === 'full' ? t('projects.full') : t('projects.failed'));
            }}
          >
            {t('projects.duplicate')}
          </Action>
          <Action danger phone={phone} testId="project-delete" onClick={() => setMode('delete')}>
            {t('projects.delete')}
          </Action>
        </div>
      )}
    </div>
  );
}

function ProjectsBody({ phone, onClose }: { phone?: boolean; onClose: () => void }) {
  const t = useT();
  const projects = useProjects((s) => s.projects);
  const loaded = useProjects((s) => s.loaded);
  const openId = useProjects((s) => s.openId);
  const max = useProjects((s) => s.max);
  const busy = useProjects((s) => s.busy);
  const [templates, setTemplates] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = projects.length >= max;
  const create = async (id: string) => {
    const r = await projectSync.create(id);
    if (r === null) {
      onClose();
      // A new house: say where it stands (or skip), as a template did before.
      useStudio.getState().setSitePanel({ kind: 'location', intro: true });
    } else setError(r === 'full' ? t('projects.full') : t('projects.failed'));
  };
  return (
    <div className="flex flex-col" data-testid="projects-body">
      <div className={cx('flex items-center gap-1', phone ? 'px-5 pt-1 pb-2' : 'px-[18px] pt-3 pb-1.5')}>
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]" id="projects-title">{t('projects.title')}</h2>
        {phone && (
          <button type="button" onClick={onClose} aria-label={t('account.close')} className="hit lg-plate -mr-1.5 grid size-8 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink" data-testid="projects-close">
            <CloseIcon width={16} height={16} />
          </button>
        )}
      </div>
      <div className={cx('flex flex-col', phone ? 'px-2 pb-3' : 'px-1.5 pb-1.5')}>
        <button
          type="button"
          disabled={full || busy}
          aria-expanded={templates}
          onClick={() => setTemplates(!templates)}
          className={cx('lg-plate flex w-full items-center gap-2.5 rounded-[16px] px-3 text-left text-[14px] font-medium disabled:text-ink-3', phone ? 'h-11' : 'h-10')}
          data-testid="project-new"
        >
          <span className="grid size-5 shrink-0 place-items-center text-ink-2"><PlusIcon width={18} height={18} /></span>
          <span className="min-w-0 flex-1 truncate">{t('projects.new')}</span>
          {!full && <ChevronDownSmallIcon width={15} height={15} className={cx('shrink-0 text-ink-2 transition-transform', templates && 'rotate-180')} />}
        </button>
        {full && <p className="px-3 pt-0.5 pb-2 pl-[42px] text-[12px] leading-4 text-ink-2" data-testid="projects-full">{t('projects.full')}</p>}
        {templates && !full && (
          <div className="pl-8" data-testid="project-templates">
            {TEMPLATE_META.map((m) => (
              <button key={m.id} type="button" disabled={busy} onClick={() => void create(m.id)} className={cx('lg-plate flex w-full items-center gap-2.5 rounded-[16px] px-3 text-left text-[14px] font-medium', phone ? 'h-11' : 'h-10')} data-testid={`project-template-${m.id}`}>
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <span className="tnum shrink-0 text-[13px] font-normal text-ink-2">{`${m.plot.width / 1000} × ${m.plot.depth / 1000} m`}</span>
              </button>
            ))}
            <p className="px-3 pt-0.5 pb-1.5 text-[12px] leading-4 text-ink-2">{t('projects.newNote')}</p>
          </div>
        )}
        <GlassSep />
        {!loaded && !projects.length ? (
          <p className="px-3 py-3 text-[13px] text-ink-2" data-testid="projects-loading">{t('projects.loading')}</p>
        ) : !projects.length ? (
          <p className="px-3 py-3 text-[13px] text-ink-2" data-testid="projects-empty">{t('projects.empty')}</p>
        ) : (
          <div className="flex flex-col" data-testid="projects-list">
            {projects.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <GlassSep className="ml-[42px]" />}
                <ProjectRow p={p} open={p.id === openId} phone={phone} expanded={expanded === p.id} onExpand={(v) => setExpanded(v ? p.id : null)} error={setError} />
              </div>
            ))}
          </div>
        )}
        {error && (
          <p className="px-3 pt-1.5 pb-1 text-[12.5px] leading-[18px] text-ink" role="alert" data-testid="projects-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Hosts "My projects": desktop a popover at its opener, phone a sheet. */
export function ProjectsHost({ phone }: { phone?: boolean }) {
  const t = useT();
  const open = useSurface((s) => s.open);
  const from = useSurface((s) => s.from);
  const rect = useSurface((s) => s.rect);
  const on = useProjects((s) => s.on);
  const panel = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(open);
  const show = open && on;
  useLayoutEffect(() => {
    if (show) setShown(true);
  }, [show]);
  // Signed out meanwhile: nothing to show.
  useEffect(() => {
    if (open && !on && !useChat.getState().server?.user) closeProjects();
  }, [open, on]);
  // Signed in from "My projects" (signed out it led to sign-in): it opens once the projects are there.
  useEffect(
    () =>
      useAccount.subscribe((s, p) => {
        if (s.welcome !== p.welcome && s.reason === 'projects') {
          useAccount.setState({ reason: null });
          useSurface.setState({ open: true, from: s.origin === 'account' ? 'account' : 'menu', rect: null });
        }
      }),
    [],
  );
  const back = () => document.querySelector<HTMLElement>(from === 'account' ? ACCOUNT : '[data-testid=project-menu]')?.focus({ preventScroll: true });
  // Desktop: a press outside closes it; Escape closes it and returns to its opener.
  useEffect(() => {
    if (!show) return;
    const down = (e: PointerEvent) => {
      if (phone || panel.current?.contains(e.target as Node)) return;
      closeProjects();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      closeProjects();
      if (!phone) back();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, phone]);
  useLayoutEffect(() => {
    if (show && !phone) panel.current?.querySelector<HTMLElement>('[data-testid=project-new]:not(:disabled), [data-testid=project-open]')?.focus({ preventScroll: true });
  }, [show, phone]);
  if (!shown) return null;
  const onKey = (e: RKeyboardEvent) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d || (e.target as HTMLElement).tagName === 'INPUT') return;
    e.preventDefault();
    const rows = [...(panel.current?.querySelectorAll<HTMLElement>('[data-testid=project-new]:not(:disabled), [data-testid^=project-template-], [data-testid=project-open]') ?? [])];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    rows[(i + d + rows.length) % rows.length]?.focus();
  };
  const body = <ProjectsBody phone={phone} onClose={closeProjects} />;
  if (phone) {
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    return (
      <>
        <div className={cx('pointer-events-auto absolute inset-0 z-40 bg-black/10 transition-opacity duration-300', show ? 'opacity-100' : 'opacity-0')} onClick={closeProjects} aria-hidden="true" />
        <GlassSheet open={show} large={Math.round(vh * 0.92)} onClose={closeProjects} onClosed={() => setShown(false)} ariaLabel={t('projects.title')} testId="projects-sheet" className="z-50" style={{ left: 8, right: 8, bottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="projects-title" ref={(el) => void (panel.current = el)} onKeyDown={onKey}>
            {body}
          </div>
        </GlassSheet>
      </>
    );
  }
  return (
    <GlassPopover
      ref={panel}
      open={show}
      anchor={() => document.querySelector<HTMLElement>(from === 'account' ? ACCOUNT : HOUSE_NAME)}
      placement={from === 'account' ? 'below-end' : 'below-start'}
      from={() => (show && rect ? rect : document.querySelector<HTMLElement>(from === 'account' ? ACCOUNT : HOUSE_NAME))}
      kind="text"
      radius={22}
      onClosed={() => setShown(false)}
      ariaRole="dialog"
      aria-labelledby="projects-title"
      onKeyDown={onKey}
      style={{ width: 360, maxHeight: 'calc(100vh - 112px)' }}
      className="flex flex-col overflow-y-auto overscroll-contain"
      bodyClassName="flex min-h-0 flex-col"
      data-testid={show ? 'projects-surface' : undefined}
    >
      {show && body}
    </GlassPopover>
  );
}
