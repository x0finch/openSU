// "My projects" (task 027, amended): the file browser, a page of its own
// as in Figma, Canva and Google Docs. A grid of cards (thumbnail, name,
// "edited ... ago"), "New project" first; each card has a "..." menu (also
// on right click): open, rename, duplicate, delete. Delete asks once in
// place, then a toast with Undo; the delete is sent when the toast ends.
// Signed out: this browser's project as one card and one line inviting
// sign-in. Paper, like the landing page; the menu and the toast are the
// studio's glass primitives.
import { TEMPLATE_META } from '@opensu/agent/templates-meta';
import { Link } from '@tanstack/react-router';
import { type MouseEvent as RMouseEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CubeIcon, Mark, MoreIcon, PlusIcon } from '../components/icons';
import { cx, LangToggle } from '../components/ui';
import { GlassLayer, GlassMenu, GlassMenuItem, GlassSep, GlassToast } from '../glass';
import { loadSaved } from '../lib/autosave';
import { type Lang, useT } from '../lib/i18n';
import { houseTitle, type ProjectMeta, projectName, projectSync, thumbUrl, useProjects } from '../lib/projects';
import { restoreLang, useStudio } from '../lib/store';
import { fetchServerStatus, useChat } from '../chat/chat-store';

/** How long a deleted project can be brought back (the toast), ms. */
export const UNDO_MS = 6000;

/** When it was last changed, as people say it: just now, 3 minutes ago, yesterday, a date. */
export function changedText(lang: Lang, at: number, now = Date.now()): string | null {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return null;
  const loc = lang === 'zh' ? 'zh-CN' : 'en';
  const rel = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
  if (s < 3600) return rel.format(-Math.floor(s / 60), 'minute');
  const a = new Date(at), n = new Date(now);
  const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86_400_000);
  if (days === 0) return rel.format(-Math.floor(s / 3600), 'hour');
  if (days < 7) return rel.format(-days, 'day');
  return new Intl.DateTimeFormat(loc, a.getFullYear() === n.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }).format(a);
}

function useEdited(at: number): string {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const when = changedText(lang, at);
  return when === null ? t('projects.editedNow') : t('projects.edited', { when });
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

const TILE = 'relative block aspect-[4/3] overflow-hidden rounded-[14px] border border-hairline bg-wash transition-colors';

/** Pictures of the templates, rendered in this browser the first time the strip opens (kept for the page). */
const templateThumbs = new Map<string, string>();
function useTemplateThumbs(on: boolean): Map<string, string> {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!on || templateThumbs.size) return;
    let live = true;
    void (async () => {
      // Never on the server: keeps the model and three.js out of the Worker bundle.
      const [{ templateById }, { renderThumb }] = await (import.meta.env.SSR ? new Promise<never>(() => {}) : Promise.all([import('../studio/house-data'), import('../studio/thumb')]));
      for (const m of TEMPLATE_META) {
        const blob = await renderThumb(templateById(m.id)).catch(() => null);
        if (blob) templateThumbs.set(m.id, URL.createObjectURL(blob));
        if (live) bump((n) => n + 1);
      }
    })();
    return () => {
      live = false;
    };
  }, [on]);
  return templateThumbs;
}

/** The picture of a project, or a quiet placeholder until it has one. */
function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" data-testid="project-thumb" />;
  return (
    <span className="grid size-full place-items-center text-ink-3" data-testid="project-thumb-empty">
      <CubeIcon width={30} height={30} />
    </span>
  );
}

function CardText({ name, line, more, renaming, wrap }: { name: ReactNode; line: string; more?: ReactNode; renaming?: boolean; wrap?: boolean }) {
  return (
    <div className="mt-2.5 flex items-start gap-1">
      <div className="min-w-0 flex-1">
        {renaming ? name : <p className="truncate text-[14px] leading-5 font-medium" data-testid="project-name">{name}</p>}
        {line && <p className={cx('tnum text-[12.5px] leading-[18px] text-ink-2', !wrap && 'truncate')} data-testid="project-when">{line}</p>}
      </div>
      {more}
    </div>
  );
}

/** A plain button on paper (the page has no glass to put a plate on). */
function PaperButton({ children, onClick, strong, testId }: { children: ReactNode; onClick: () => void; strong?: boolean; testId: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className={cx('hit inline-flex h-8 items-center rounded-full px-3 text-[13px] transition-colors', strong ? 'bg-ink font-semibold text-white hover:bg-black' : 'bg-wash font-medium hover:bg-hairline')}>
      {children}
    </button>
  );
}

function ProjectCard({ p, onDelete, menuOpen, onMenu, renaming, onRenamed, asking, setAsking }: { p: ProjectMeta; onDelete: () => void; menuOpen: boolean; onMenu: (el: HTMLElement | null) => void; renaming: boolean; onRenamed: () => void; asking: boolean; setAsking: (v: boolean) => void }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const name = projectName(lang, p);
  const edited = useEdited(p.updatedAt);
  const [draft, setDraft] = useState(name);
  const more = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!renaming) return;
    setDraft(name);
    field.current?.focus();
    field.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming]);
  const commit = () => {
    onRenamed();
    const next = draft.trim();
    if (next && next !== name) void projectSync.rename(p.id, next);
  };
  return (
    <article
      className="min-w-0"
      data-testid="project-card"
      data-id={p.id}
      onContextMenu={(e: RMouseEvent) => {
        e.preventDefault();
        onMenu(more.current);
      }}
    >
      <a href={`/studio?p=${p.id}`} className={cx(TILE, 'hover:border-ink-3')} aria-label={`${t('projects.open')}: ${name}`} data-testid="project-open">
        <Thumb src={thumbUrl(p)} alt="" />
      </a>
      {asking ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5" data-testid="project-delete-ask">
          <p className="w-full text-[14px] leading-5 font-medium">{t('projects.deleteAsk')}</p>
          <PaperButton strong testId="project-delete-confirm" onClick={() => { setAsking(false); onDelete(); }}>
            {t('projects.delete')}
          </PaperButton>
          <PaperButton testId="project-delete-cancel" onClick={() => setAsking(false)}>
            {t('projects.cancel')}
          </PaperButton>
        </div>
      ) : (
        <CardText
          renaming={renaming}
          name={
            renaming ? (
              <input
                ref={field}
                value={draft}
                maxLength={80}
                aria-label={t('projects.nameLabel')}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    setDraft(name);
                    onRenamed();
                  }
                }}
                className="-mx-1.5 -my-0.5 h-6 w-[calc(100%+12px)] rounded-[6px] bg-page px-1.5 text-[14px] leading-5 font-medium outline outline-1 outline-ink-3 focus:outline-2 focus:outline-ink"
                data-testid="project-name-input"
              />
            ) : (
              name
            )
          }
          line={edited}
          more={
            <button
              ref={more}
              type="button"
              aria-label={t('projects.more')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => onMenu(more.current)}
              className="hit -mr-1.5 grid size-8 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-wash hover:text-ink"
              data-testid="project-more"
            >
              <MoreIcon width={18} height={18} />
            </button>
          }
        />
      )}
    </article>
  );
}

function NewCard({ full, open, onToggle }: { full: boolean; open: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <article className="min-w-0" data-testid="project-new-card">
      <button type="button" disabled={full} aria-expanded={open} onClick={onToggle} className={cx(TILE, 'grid w-full place-items-center text-ink-2 enabled:hover:border-ink-3 enabled:hover:text-ink disabled:text-ink-3')} data-testid="project-new">
        <span className="grid size-11 place-items-center rounded-full border border-current">
          <PlusIcon width={22} height={22} />
        </span>
      </button>
      <CardText name={t('projects.new')} line={full ? t('projects.full') : ''} wrap />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

export function ProjectsPage() {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const server = useChat((s) => s.server);
  const projects = useProjects((s) => s.projects);
  const loaded = useProjects((s) => s.loaded);
  const max = useProjects((s) => s.max);
  const [templates, setTemplates] = useState(false);
  const [menu, setMenu] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  /** The card asking "delete?" (the menu's delete asks in place, on its card). */
  const [asking, setAsking] = useState<string | null>(null);
  /** Deleted, not sent yet: the toast can bring them back. */
  const [pending, setPending] = useState<Map<string, number>>(new Map());
  const [toast, setToast] = useState<{ id: string; name: string } | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const tplThumbs = useTemplateThumbs(templates);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const signedIn = !!server?.user;
  const offered = !!server?.projects && !!(server.auth?.email || server.auth?.google);
  const cloud = signedIn && offered;

  useEffect(() => {
    restoreLang();
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'zh') useStudio.getState().setLang(q);
    void fetchServerStatus();
    window.__studio = { ...window.__studio, projects: projectSync, chat: useChat, store: useStudio };
    const onShow = () => document.visibilityState === 'visible' && void projectSync.refresh();
    // Leaving the page: deletes still waiting for their toast are sent now.
    const onLeave = () => {
      for (const id of pendingRef.current.keys()) void fetch(`/api/projects/${id}`, { method: 'DELETE', credentials: 'same-origin', keepalive: true });
    };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('pagehide', onLeave);
    };
  }, []);
  useEffect(() => {
    if (cloud) void projectSync.refresh();
  }, [cloud]);

  // A press outside closes the card menu; Escape closes it and gives focus back.
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node) || menu.el.contains(e.target as Node)) return;
      setMenu(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setMenu(null);
      menu.el.focus();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [menu]);

  const remove = (p: ProjectMeta) => {
    const timer = window.setTimeout(() => {
      setPending((m) => {
        const n = new Map(m);
        n.delete(p.id);
        return n;
      });
      setToast((x) => (x?.id === p.id ? null : x));
      void projectSync.remove(p.id);
    }, UNDO_MS);
    setPending((m) => new Map(m).set(p.id, timer));
    setToast({ id: p.id, name: projectName(lang, p) });
  };
  const undo = () => {
    if (!toast) return;
    clearTimeout(pending.get(toast.id));
    setPending((m) => {
      const n = new Map(m);
      n.delete(toast.id);
      return n;
    });
    setToast(null);
  };

  const shown = projects.filter((p) => !pending.has(p.id));
  const full = projects.length >= max;
  const menuProject = menu ? projects.find((p) => p.id === menu.id) : null;
  const local = !cloud ? loadSaved() : null;
  const localName = typeof window === 'undefined' ? '' : (readLinkName() || houseTitle(lang, local?.house ?? null));

  return (
    <GlassLayer>
      <div className="min-h-dvh bg-page text-ink">
        <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 md:h-20 md:px-10">
          <Link to="/" className="hit flex items-center gap-2" aria-label="openSU">
            <Mark />
            <span className="text-[15px] font-semibold tracking-tight">openSU</span>
          </Link>
          <nav className="flex min-w-0 items-center gap-1">
            {server?.user && <span className="hidden max-w-[240px] truncate px-2 text-sm text-ink-2 sm:inline" data-testid="projects-user">{server.user.name || server.user.email}</span>}
            <LangToggle />
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 md:px-10">
          <h1 className="pt-2 text-[26px] leading-tight font-semibold tracking-[-0.02em] md:pt-4 md:text-[32px]">{t('projects.title')}</h1>
          {server && !cloud && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="projects-invite">
              <p className="text-[14px] leading-6 text-ink-2">{t('projects.why')}</p>
              {offered && (
                <a href="/studio?signin=1" className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[14px] font-medium text-white transition-colors hover:bg-black" data-testid="projects-signin">
                  {t('account.signIn')}
                </a>
              )}
            </div>
          )}
          {cloud && templates && !full && (
            <section className="mt-6" data-testid="project-templates" aria-label={t('projects.templates')}>
              <h2 className="text-[13px] font-medium text-ink-2">{t('projects.templates')}</h2>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
                {TEMPLATE_META.map((m) => (
                  <a key={m.id} href={`/studio?new=${m.id}`} className="min-w-0" data-testid={`project-template-${m.id}`}>
                    <span className={cx(TILE, 'hover:border-ink-3')}>
                      <Thumb src={tplThumbs.get(m.id) ?? null} alt="" />
                    </span>
                    <CardText name={m.name} line={`${m.plot.width / 1000} × ${m.plot.depth / 1000} m`} />
                  </a>
                ))}
              </div>
            </section>
          )}
          <section className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:mt-8 lg:grid-cols-4 xl:grid-cols-5" data-testid="projects-grid" aria-label={t('projects.title')}>
            {cloud && <NewCard full={full} open={templates} onToggle={() => setTemplates(!templates)} />}
            {cloud &&
              shown.map((p) => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  onDelete={() => remove(p)}
                  menuOpen={menu?.id === p.id}
                  onMenu={(el) => setMenu(menu?.id === p.id || !el ? null : { id: p.id, el })}
                  renaming={renaming === p.id}
                  onRenamed={() => setRenaming(null)}
                  asking={asking === p.id}
                  setAsking={(v) => setAsking(v ? p.id : null)}
                />
              ))}
            {server && !cloud && (
              <article className="min-w-0" data-testid="project-card" data-local="">
                <a href="/studio" className={cx(TILE, 'hover:border-ink-3')} aria-label={`${t('projects.open')}: ${localName}`} data-testid="project-open">
                  <Thumb src={null} alt="" />
                </a>
                <CardText name={localName} line={local ? (changedText(lang, local.savedAt) === null ? t('projects.editedNow') : t('projects.edited', { when: changedText(lang, local.savedAt)! })) : ''} />
              </article>
            )}
          </section>
          {cloud && !loaded && !projects.length && <p className="mt-6 text-[14px] text-ink-2" data-testid="projects-loading">{t('projects.loading')}</p>}
        </main>
        <GlassMenu
          ref={menuRef as RefObject<HTMLElement | null>}
          open={!!menu && !!menuProject}
          anchor={() => menu?.el ?? null}
          placement="below-end"
          label={t('projects.more')}
          style={{ width: 220 }}
          data-testid={menu ? 'project-menu-card' : undefined}
        >
          {menuProject && (
            <>
              <GlassMenuItem onClick={() => location.assign(`/studio?p=${menuProject.id}`)} data-testid="card-open">{t('projects.open')}</GlassMenuItem>
              <GlassMenuItem onClick={() => { setMenu(null); setRenaming(menuProject.id); }} data-testid="card-rename">{t('projects.rename')}</GlassMenuItem>
              <GlassMenuItem
                disabled={full}
                className="disabled:text-ink-3"
                onClick={() => {
                  setMenu(null);
                  void projectSync.duplicate(menuProject.id);
                }}
                data-testid="card-duplicate"
              >
                {t('projects.copy')}
              </GlassMenuItem>
              <GlassSep />
              <GlassMenuItem
                onClick={() => {
                  setAsking(menuProject.id);
                  setMenu(null);
                }}
                data-testid="card-delete"
              >
                {t('projects.delete')}
              </GlassMenuItem>
            </>
          )}
        </GlassMenu>
        {toast && (
          <div className="pointer-events-none fixed inset-x-0 bottom-[max(24px,env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
            <GlassToast className="gap-3 pr-1.5" data-testid="project-deleted-toast" key={toast.id}>
              <span className="max-w-[min(360px,calc(100vw-160px))] truncate">{t('projects.deleted', { name: toast.name })}</span>
              <button type="button" onClick={undo} className="lg-plate h-7 rounded-full px-3 text-[13px] font-semibold" data-testid="project-undo">
                {t('projects.undo')}
              </button>
            </GlassToast>
          </div>
        )}
      </div>
    </GlassLayer>
  );
}

/** The name the user gave this browser's project, if any (kept with the browser copy's link). */
function readLinkName(): string {
  try {
    const l = JSON.parse(localStorage.getItem('opensu.project.v1') ?? 'null') as { name?: unknown } | null;
    return typeof l?.name === 'string' ? l.name : '';
  } catch {
    return '';
  }
}

