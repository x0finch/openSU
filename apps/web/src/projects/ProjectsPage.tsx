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
import { CubeIcon, LinkIcon, Mark, MoreIcon, PlusIcon } from '../components/icons';
import { cx, LangToggle } from '../components/ui';
import { Button, GlassLayer, Menu, MenuItem, NameInput, Separator, Tile, TileButton, TileLink, TileMark, Toast } from '@opensu/ui';
import { loadSaved } from '../lib/autosave';
import { type Lang, useT } from '../lib/i18n';
import { projectTitle, type ProjectMeta, projectName, projectSync, thumbUrl, useProjects, useProjectSync } from '../lib/projects';
import { restoreLang, useStudio } from '../lib/store';
import { fetchServerStatus, useChat } from '../chat/chat-store';
import { AccountButton, AccountMenuHost, StudioToast } from '../chat/AccountEntry';
import { SignInHost } from '../chat/SignIn';
import { openShare } from '../lib/share';
import { ShareHost } from '../studio/Share';

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

/** One grid for the projects and the templates: two columns on phones, else as many cards of 240 px or more as fit (Figma, Canva, Google Docs). */
const GRID = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-x-6 sm:gap-y-8';


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

function CardText({ name, line, more, renaming, wrap, mark }: { name: ReactNode; line: string; more?: ReactNode; renaming?: boolean; wrap?: boolean; mark?: ReactNode }) {
  return (
    <div className="mt-2.5 flex items-start gap-1">
      <div className="min-w-0 flex-1">
        {renaming ? (
          name
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[14px] leading-5 font-medium sm:text-[15px] sm:leading-[22px]" data-testid="project-name">{name}</p>
            {mark}
          </div>
        )}
        {line && <p className={cx('tnum text-[12.5px] leading-[18px] text-ink-2 sm:text-[13px]', !wrap && 'truncate')} data-testid="project-when">{line}</p>}
      </div>
      {more}
    </div>
  );
}

/** A button on paper (the page has no glass to put a plate on). */
function PaperButton({ children, onClick, strong, testId }: { children: ReactNode; onClick: () => void; strong?: boolean; testId: string }) {
  return (
    <Button variant={strong ? 'ink' : 'paper-tinted'} size="sm" strong={strong} onClick={onClick} data-testid={testId}>
      {children}
    </Button>
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
    requestAnimationFrame(() => field.current?.select());
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
      <TileLink href={`/studio?p=${p.id}`} aria-label={`${t('projects.open')}: ${name}`} data-testid="project-open">
        <Thumb src={thumbUrl(p)} alt="" />
      </TileLink>
      {asking ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5" data-testid="project-delete-ask">
          <p className="w-full text-[14px] leading-5 font-medium sm:text-[15px]">{t('projects.deleteAsk')}</p>
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
              <NameInput
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
                className="-mx-1.5 -my-0.5 h-6 w-[calc(100%+12px)] text-[14px] leading-5 font-medium! sm:h-[26px] sm:text-[15px]"
                data-testid="project-name-input"
              />
            ) : (
              name
            )
          }
          line={edited}
          // Task 028: shared with a link, Google Drive's mark beside the name.
          mark={
            p.share ? (
              <span role="img" aria-label={t('projects.shared')} className="inline-flex shrink-0 text-ink-2" data-testid="project-shared">
                <LinkIcon width={15} height={15} />
              </span>
            ) : undefined
          }
          more={
            <Button
              ref={more}
              variant="paper"
              size="sm"
              label={t('projects.more')}
              icon={<MoreIcon width={18} height={18} />}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => onMenu(more.current)}
              className="-mr-1.5 text-ink-2"
              data-testid="project-more"
            />
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
      <TileButton disabled={full} aria-expanded={open} onClick={onToggle} data-testid="project-new">
        <TileMark>
          <PlusIcon width={22} height={22} />
        </TileMark>
      </TileButton>
      <CardText name={t('projects.new')} line={full ? t('projects.full') : ''} wrap />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

/** Phones: the studio's phone header sizes (the account button round, 36 px, 44 to touch). */
function useNarrow(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = matchMedia('(max-width: 639px)');
    const fn = () => setOn(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return on;
}

export function ProjectsPage() {
  const t = useT();
  const phone = useNarrow();
  // The sync, as in the studio: a sign-in here adopts this browser's edited house (nothing is opened or made otherwise).
  useProjectSync({ page: true });
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
  const localName = typeof window === 'undefined' ? '' : projectTitle(lang, readLinkName(), local?.house ?? null);

  return (
    <GlassLayer>
      <div className="min-h-dvh bg-page text-ink">
        <header className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-4 md:h-20 md:px-10">
          <Link to="/" className="hit flex items-center gap-2" aria-label="openSU">
            <Mark />
            <span className="text-[15px] font-semibold tracking-tight">openSU</span>
          </Link>
          <nav className="flex min-w-0 items-center gap-1">
            <LangToggle size="lg" />
            {/* The account entry of the studio (task 026): the same button, menu and sign-in surface. */}
            <AccountButton {...(phone ? { size: 36, round: true } : {})} className="ml-1" />
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
          <h1 className="pt-2 text-[26px] leading-tight font-semibold tracking-[-0.02em] md:pt-4 md:text-[32px]">{t('projects.title')}</h1>
          {server && !cloud && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="projects-invite">
              <p className="text-[14px] leading-6 text-ink-2">{t('projects.why')}</p>
            </div>
          )}
          {cloud && templates && !full && (
            <section className="mt-6" data-testid="project-templates" aria-label={t('projects.templates')}>
              <h2 className="text-[13px] font-medium text-ink-2">{t('projects.templates')}</h2>
              <div className={cx('mt-3', GRID)}>
                {TEMPLATE_META.map((m) => (
                  <a key={m.id} href={`/studio?new=${m.id}`} className="min-w-0" data-testid={`project-template-${m.id}`}>
                    <Tile>
                      <Thumb src={null} alt="" />
                    </Tile>
                    <CardText name={m.name} line={`${m.plot.width / 1000} × ${m.plot.depth / 1000} m`} />
                  </a>
                ))}
              </div>
            </section>
          )}
          <section className={cx('mt-6 md:mt-8', GRID)} data-testid="projects-grid" aria-label={t('projects.title')}>
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
                <TileLink href="/studio" aria-label={`${t('projects.open')}: ${localName}`} data-testid="project-open">
                  <Thumb src={null} alt="" />
                </TileLink>
                <CardText name={localName} line={local ? (changedText(lang, local.savedAt) === null ? t('projects.editedNow') : t('projects.edited', { when: changedText(lang, local.savedAt)! })) : ''} />
              </article>
            )}
          </section>
          {cloud && !loaded && !projects.length && <p className="mt-6 text-[14px] text-ink-2" data-testid="projects-loading">{t('projects.loading')}</p>}
        </main>
        <Menu
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
              <MenuItem onClick={() => location.assign(`/studio?p=${menuProject.id}`)} data-testid="card-open">{t('projects.open')}</MenuItem>
              {/* Task 028: the studio's share surface, at the card (Google Drive, Figma: right click > Share). */}
              <MenuItem
                onClick={() => {
                  const el = menu?.el ?? null;
                  setMenu(null);
                  openShare(el, menuProject.id);
                }}
                data-testid="card-share"
              >
                {t('share.button')}
              </MenuItem>
              <MenuItem onClick={() => { setMenu(null); setRenaming(menuProject.id); }} data-testid="card-rename">{t('projects.rename')}</MenuItem>
              <MenuItem
                disabled={full}
                className="disabled:text-ink-3"
                onClick={() => {
                  setMenu(null);
                  void projectSync.duplicate(menuProject.id);
                }}
                data-testid="card-duplicate"
              >
                {t('projects.copy')}
              </MenuItem>
              <Separator />
              <MenuItem
                onClick={() => {
                  setAsking(menuProject.id);
                  setMenu(null);
                }}
                data-testid="card-delete"
              >
                {t('projects.delete')}
              </MenuItem>
            </>
          )}
        </Menu>
        {/* The account's surfaces, as in the studio: the menu at the button, sign-in (a popover; a sheet on phones). */}
        <div className="pointer-events-none fixed inset-0 z-40">
          <AccountMenuHost />
          <SignInHost />
          <ShareHost />
        </div>
        {!toast && <StudioToast className="fixed inset-x-0 bottom-[max(24px,env(safe-area-inset-bottom))] z-50 px-4" />}
        {toast && (
          <div className="pointer-events-none fixed inset-x-0 bottom-[max(24px,env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
            <Toast
              data-testid="project-deleted-toast"
              key={toast.id}
              action={
                <Button variant="plain" size="xs" strong onClick={undo} data-testid="project-undo">
                  {t('projects.undo')}
                </Button>
              }
            >
              <span className="max-w-[min(360px,calc(100vw-160px))] truncate">{t('projects.deleted', { name: toast.name })}</span>
            </Toast>
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

