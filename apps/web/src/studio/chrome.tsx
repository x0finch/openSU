// Studio chrome around the drawing: the house name (with a quiet project
// menu), the mode switch, the first-visit hints and the day player. The
// toolbar and its panels live in tools.tsx, the conversation in chat/.
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TEMPLATE_META } from '@opensu/agent/templates-meta';
import { ChevronDownSmallIcon, CloseIcon, CompassIcon, CopyIcon, DownloadIcon, FolderIcon, LayersIcon, Mark, PencilIcon, PersonIcon, PinIcon, PlusIcon, ResetViewIcon, ShareIcon } from '../components/icons';
import { cx } from '../components/ui';
import { Button, Dot, Menu, MenuItem, MenuLabel, MenuSeparator, NameInput, Segmented, Skeleton } from '@opensu/ui';
import { type MessageKey, useT } from '../lib/i18n';
import { freshView, type Mode, useStudio } from '../lib/store';
import { resetToTemplate } from '../lib/autosave';
import { fmtArea, fmtLen, goToProjects, projectSync, useHouseName, useProjects, useProjectsOffered } from '../lib/projects';
import { bearingText, frontBearing, placeText } from '../lib/site';
import { useViewOnly } from '../lib/view-only';
import { openShare } from '../lib/share';
import { exportConversation, replaceHouse, useChat } from '../chat/chat-store';
import { accountName, openAccount } from '../chat/AccountEntry';
import { useKeys } from '../chat/keys';
import { showKeyChoices } from '../chat/KeyPicker';
import type { Derived } from './house-data';
import { loadHouseData } from './useDerived';


/* ------------------------------------------------------------------ */
/* Title and project menu                                              */
/* ------------------------------------------------------------------ */

function Facts({ derived, className }: { derived: Derived | null; className?: string }) {
  const t = useT();
  if (!derived) return <p className={cx('h-4', className)}><Skeleton className="h-2.5 w-36" /></p>;
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
export function TitleMenu({ derived, onRect, compact, trailing }: { derived: Derived | null; onRect?: (r: { right: number; bottom: number }) => void; compact?: boolean; trailing?: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pressOpened = useRef(-1e9);
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
  const menu = useRef<HTMLElement | null>(null);
  // The name toggles the menu itself; Base UI closes it on Escape (focus back to the name), a press anywhere else (the
  // share button beside it included) or focus leaving it.
  // The name the user gave the project (task 027), else the house's own title.
  const name = useHouseName();
  // Rename in place (task 027: the file name in the top bar, as in Figma and Google Docs): Enter saves, Escape cancels.
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!renaming) return;
    setDraft(name);
    field.current?.focus();
    // The whole name selected, once it is in the field (typing replaces it, as in Figma).
    requestAnimationFrame(() => field.current?.select());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming]);
  const commit = (save: boolean) => {
    if (!renaming) return;
    setRenaming(false);
    const id = projectSync.store.getState().openId;
    const next = draft.trim();
    if (save && id && next && next !== name) void projectSync.rename(id, next);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };
  const titleText = compact ? 'text-[17px] max-[339px]:text-[15px]' : 'text-[20px]';
  return (
    <div className="pointer-events-auto relative min-w-0" ref={box} data-house-name="">
      {/* The name's line: the name and (task 029) what acts on the document, on its centre line. */}
      <div className="flex min-w-0 items-center gap-3">
      {renaming ? (
        <div className={cx('-ml-1 flex items-center gap-[7px] px-1', compact ? 'h-8' : 'h-9')}>
          <Mark width={18} height={18} className="shrink-0" />
          <NameInput
            ref={field}
            value={draft}
            maxLength={80}
            aria-label={t('projects.nameLabel')}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(true);
              else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                commit(false);
              }
            }}
            className={cx('-mr-1.5 h-[30px] w-[min(320px,calc(100vw-140px))] tracking-[-0.01em] text-canvas-ink', titleText)}
            data-testid="title-rename-input"
          />
        </div>
      ) : (
      <Button
        ref={trigger}
        variant="canvas"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('more.open')}: ${name}`}
        onPointerDown={(e) => {
          // Touch: the menu opens on press, so the finger can slide onto a row (scrub) and lift to choose.
          if (e.pointerType === 'mouse' || open) return;
          pressOpened.current = performance.now();
          setOpen(true);
        }}
        onClick={() => {
          if (performance.now() - pressOpened.current < 700) return;
          setOpen(!open);
        }}
        data-testid="project-menu"
        className={cx('group -ml-1 max-w-[calc(100%+4px)] shrink touch-none justify-start gap-[7px] px-1 text-left', compact ? 'h-8' : 'h-9')}
      >
        <Mark width={18} height={18} className="shrink-0" />
        <span className={cx('truncate font-semibold tracking-[-0.01em]', titleText)} data-testid="title-name">{name}</span>
        <ChevronDownSmallIcon width={16} height={16} className={cx('-ml-0.5 shrink-0 text-ink-2 transition-transform duration-200', open && 'rotate-180')} />
      </Button>
      )}
      {trailing}
      </div>
      <Facts derived={derived} className={cx('pl-0', compact ? 'mt-0' : 'mt-0.5')} />
      {/* The menu stands under the house name's block (its name and facts), not over the facts line. */}
      <ProjectMenu ref={menu} open={open} anchor={() => box.current} onClose={close} compact={compact} onRename={() => setRenaming(true)} />
    </div>
  );
}

function Item({ children, onSelect, value, icon, danger, testId }: { children: ReactNode; onSelect: () => void; value?: ReactNode; icon?: ReactNode; danger?: boolean; testId?: string }) {
  return (
    <MenuItem onClick={onSelect} data-testid={testId} icon={icon} detail={value} danger={danger}>
      {children}
    </MenuItem>
  );
}

const Sep = () => <MenuSeparator />;

function ProjectMenu({ open, anchor, onClose, compact, onRename, ref }: { open: boolean; anchor: () => HTMLElement | null; onClose: (focus: boolean) => void; compact?: boolean; onRename: () => void; ref: RefObject<HTMLElement | null> }) {
  const t = useT();
  const navigate = useNavigate();
  const lang = useStudio((s) => s.lang);
  const site = useStudio((s) => s.house?.site);
  const setLang = useStudio((s) => s.setLang);
  const setSitePanel = useStudio((s) => s.setSitePanel);
  const setSettingsOpen = useChat((s) => s.setSettingsOpen);
  const authOn = useChat((s) => !!(s.server?.auth?.email || s.server?.auth?.google));
  const user = useChat((s) => s.server?.user ?? null);
  const hasChat = useChat((s) => s.items.length > 0);
  // Task 027: signed in where projects are kept with the account, a template is a new project ("My projects"),
  // so the rows that replace the open house go; the line at the bottom says where edits are kept.
  const projectsOffered = useProjectsOffered();
  const cloud = useProjects((s) => s.on);
  const openId = useProjects((s) => s.openId);
  const failed = useProjects((s) => s.failed);
  // Viewing a shared project (task 028): only the account, the language and "about"; nothing that edits.
  const edit = !useViewOnly();
  const [templates, setTemplates] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // Closed: the templates and the reset confirmation fold back.
  useLayoutEffect(() => {
    if (open) return;
    setTemplates(false);
    setConfirm(false);
  }, [open]);
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
    <Menu
      ref={ref}
      open={open}
      anchor={anchor}
      onClose={onClose}
      placement="below-start"
      label={t('more.open')}
      style={{ width: compact ? 'min(300px, calc(100vw - 24px))' : 300 }}
      testId={open ? 'project-menu-list' : undefined}
    >
      {/* Phones (task 029): "分享" first. The top row has no room for a button beside the name (measured at 390 and
          360 px wide); the same share surface opens, as a sheet. Desktop has the button beside the name. */}
      {compact && edit && projectsOffered && (
        <Item icon={<ShareIcon width={16} height={16} />} onSelect={() => { onClose(false); openShare(null, null); }} testId="menu-share">
          {t('share.button')}
        </Item>
      )}
      {/* The account (task 019; task 029: the studio's only account entry, the same surfaces as the account button on
          /projects): hidden when this server offers no sign-in. */}
      {authOn && (
        <>
          <MenuItem
            icon={<PersonIcon width={17} height={17} />}
            onClick={(e) => {
              openAccount(e.currentTarget, 'menu');
              onClose(false);
            }}
            aria-haspopup={user ? 'menu' : 'dialog'}
            data-testid={user ? 'menu-account' : 'menu-signin'}
          >
            {user ? accountName(user) : t('account.signIn')}
          </MenuItem>
        </>
      )}
      {/* Task 027: the file browser (Figma's "Back to files"); signed out it shows this browser's project and invites sign-in. */}
      {projectsOffered && (
        <Item icon={<FolderIcon width={17} height={17} />} onSelect={() => { onClose(false); void goToProjects(); }} testId="menu-all-projects">
          {t('projects.all')}
        </Item>
      )}
      {(authOn || projectsOffered) && <Sep />}
      {/* The open project, as a file menu has it (Figma, Google Docs): new, rename, duplicate. */}
      {cloud && openId && (
        <>
          <Item
            icon={<PlusIcon width={17} height={17} />}
            testId="menu-new-project"
            onSelect={async () => {
              onClose(false);
              const r = await projectSync.create();
              if (r === null) setSitePanel({ kind: 'location', intro: true });
            }}
          >
            {t('projects.new')}
          </Item>
          <Item icon={<PencilIcon width={16} height={16} />} testId="menu-rename" onSelect={() => { onClose(false); onRename(); }}>
            {t('projects.rename')}
          </Item>
          <Item
            icon={<CopyIcon width={16} height={16} />}
            testId="menu-duplicate"
            onSelect={async () => {
              onClose(false);
              const r = await projectSync.duplicate(openId);
              if ('id' in r) await projectSync.open(r.id);
            }}
          >
            {t('projects.copy')}
          </Item>
          <Sep />
        </>
      )}
      {edit && (
        <>
          <Item icon={<PinIcon width={17} height={17} />} value={site ? placeText(site, lang) : ''} onSelect={() => { onClose(false); setSitePanel({ kind: 'location' }); }} testId="menu-location">
            {t('more.location')}
          </Item>
          <Item icon={<CompassIcon width={17} height={17} />} value={site ? bearingText(frontBearing(site.northDeg), lang) : ''} onSelect={() => { onClose(false); setSitePanel({ kind: 'orientation' }); }} testId="menu-orientation">
            {t('more.orientation')}
          </Item>
        </>
      )}
      {edit && !cloud && <Sep />}
      {edit && !cloud && (
      <Item icon={<LayersIcon width={17} height={17} />} onSelect={() => setTemplates(!templates)} value={<ChevronDownSmallIcon width={15} height={15} className={cx('transition-transform', templates && 'rotate-180')} />}>
        {t('more.templates')}
      </Item>
      )}
      {edit && !cloud && templates && (
        <div className="mb-1 ml-9">
          {TEMPLATE_META.map((m) => (
            <Item key={m.id} onSelect={() => void pick(m.id)} value={`${m.plot.width / 1000} × ${m.plot.depth / 1000} m`}>
              {m.name}
            </Item>
          ))}
          <MenuLabel small={t('tpl.note')} />
        </div>
      )}
      {edit && !cloud && (
      <Item
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
      </Item>
      )}
      {edit && <Sep />}
      <Item value={t('lang.switch')} onSelect={() => setLang(lang === 'zh' ? 'en' : 'zh')} icon={<span className="text-[11px] font-semibold">{lang === 'zh' ? '文' : 'A'}</span>}>
        {t('more.lang')}
      </Item>
      {edit && (
      <Item
        icon={<SparkDot />}
        onSelect={() => {
          onClose(false);
          // Signed in where keys live with the account (task 022): the key picker; else the browser's key settings.
          if (useKeys.getState().ready) showKeyChoices();
          else setSettingsOpen(true);
        }}
      >
        {t('chat.settings')}
      </Item>
      )}
      {/* Task 020: the conversation as one JSON file, built here (no server call). */}
      {edit && (
      <MenuItem
        icon={<DownloadIcon width={16} height={16} />}
        disabled={!hasChat}
        className="disabled:text-ink-3"
        onClick={() => {
          onClose(false);
          exportConversation();
        }}
        data-testid="menu-export"
      >
        {t('more.export')}
      </MenuItem>
      )}
      <MenuItem icon={<Mark width={15} height={15} />} onClick={() => void navigate({ to: '/' })}>
        {t('more.about')}
      </MenuItem>
      {/* No status while saving works; one quiet line when it does not (task 027). */}
      {edit && (
      <MenuLabel testId="menu-saved" flag={failed ?? undefined} small={failed === 'retry' ? t('projects.notSynced') : failed === 'too-large' ? t('projects.tooLarge') : failed === 'full' ? t('projects.notAdded') : cloud ? t('house.autosavedAccount') : t('house.autosaved')} />
      )}
    </Menu>
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
      height={size === 'sm' ? 44 : 48}
      compact={size === 'sm'}
      value={mode}
      onChange={setMode}
      className={className}
      testId="mode-switch"
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
    <div className={cx('pointer-events-none flex animate-[fade-in_300ms_ease-out] items-center gap-2', className)} data-testid="hints">
      {chips.map(([k, run]) => (
        <Button variant="glass"
          key={k}
          height={32}
          className="pr-3.5! pl-2.5! text-[12.5px]"
          icon={<Dot />}
          onClick={() => {
            done();
            run();
          }}
        >
          {t(k)}
        </Button>
      ))}
      <Button variant="glass" height={32} className="text-ink-2" onClick={done} label={t('hint.dismiss')} tip icon={<CloseIcon width={14} height={14} />} />
    </div>
  );
}
