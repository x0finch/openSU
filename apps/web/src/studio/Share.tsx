// Share links (task 028; placed by task 029). The owner's side: the
// "分享" button right of the house name, with the document it shares
// (Apple's document title menu, Notion's title row), and the one share
// surface it opens (a glass popover under the name's row on desktop, a
// sheet on phones; the projects page's card menu opens the same surface).
// The viewer's side: the quiet bar that takes the prompt's place, with
// "make my own copy" (Figma's "View only" and "Duplicate to your drafts").
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CloseIcon, ShareIcon } from '../components/icons';
import { cx, Glass, GlassButton, GlassPopover, GlassSep, GlassSheet, GlassSwitch } from '../glass';
import { useT } from '../lib/i18n';
import { projectName, projectSync, useHouseName, useProjects, useProjectsOffered } from '../lib/projects';
import { closeShare, copyLink, makeCopy, openShare, setShared, shareUrl, useShareUi } from '../lib/share';
import { useStudio } from '../lib/store';
import { toast } from '../lib/toast';
import { useShared, useViewOnly } from '../lib/view-only';
import { openSignIn, useAccount } from '../chat/account';
import { useChat } from '../chat/chat-store';

const SHARE_BUTTON = '[data-share-button]';
/** The row of the house name and the share button: the share surface (and the sign-in it offers) stands under it. */
export const TITLE_ROW = '[data-title-row]';

/* ------------------------------------------------------------------ */
/* The button                                                          */
/* ------------------------------------------------------------------ */

/**
 * "分享": a capsule on the name's line, as high as the name (desktop), or a
 * round icon button (`round`). There whenever projects are kept with
 * accounts here (signed out it explains and offers sign-in); absent while
 * viewing a shared project.
 */
export function ShareButton({ size = 36, round, className }: { size?: number; round?: boolean; className?: string }) {
  const t = useT();
  const offered = useProjectsOffered();
  const viewOnly = useViewOnly();
  const open = useShareUi((s) => s.open && !s.project);
  const ref = useRef<HTMLButtonElement>(null);
  if (viewOnly || !offered) return null;
  const common = {
    ref,
    size,
    onClick: () => (open ? closeShare() : openShare(ref.current, null)),
    'aria-haspopup': 'dialog' as const,
    'aria-expanded': open,
    'data-share-button': '',
    'data-testid': 'share-button',
  };
  return (
    <span className={cx('inline-flex', className)}>
      {round ? (
        <GlassButton {...common} className="hit" label={t('share.button')} icon={<ShareIcon width={18} height={18} />} />
      ) : (
        <GlassButton {...common} className="hit px-4">
          {t('share.button')}
        </GlassButton>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* The surface                                                         */
/* ------------------------------------------------------------------ */

function ShareBody({ phone }: { phone?: boolean }) {
  const t = useT();
  const lang = useStudio((s) => s.lang);
  const ui = useShareUi();
  const user = useChat((s) => s.server?.user ?? null);
  const openId = useProjects((s) => s.openId);
  const id = ui.project ?? openId;
  const meta = useProjects((s) => s.projects.find((p) => p.id === id) ?? null);
  const studioName = useHouseName();
  const name = meta ? projectName(lang, meta) : studioName;
  const field = useRef<HTMLInputElement>(null);
  const shared = !!meta?.share;
  // While the switch is on its way, it shows where it is going.
  const [want, setWant] = useState<boolean | null>(null);
  useEffect(() => {
    if (!ui.busy) setWant(null);
  }, [ui.busy]);
  const on = want ?? shared;
  const url = meta?.share ? shareUrl(meta.share) : '';
  const canSend = !!phone && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const pad = phone ? 'px-5 pt-1 pb-6' : 'p-[22px]';

  const head = (
    <div className="flex items-center gap-1">
      <h2 className="min-w-0 flex-1 truncate text-[19px] font-semibold tracking-[-0.01em]" id="share-title">
        {meta ? t('share.titleOf', { name }) : t('share.button')}
      </h2>
      <button type="button" onClick={closeShare} aria-label={t('account.close')} className="hit lg-plate -mr-1.5 grid size-8 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink" data-testid="share-close">
        <CloseIcon width={16} height={16} />
      </button>
    </div>
  );

  if (!user || !meta) {
    // Signed out, or this house is not (yet) a project of the account.
    return (
      <div className={cx('flex flex-col gap-4', pad)} data-testid="share-need-account">
        {head}
        <p className="-mt-2 text-[13.5px] leading-5 text-ink-2">{user ? t('share.notKept') : t('share.needAccount')}</p>
        {!user && (
          <button
            type="button"
            onClick={() => {
              // Under the name's row, as the share surface was (it grows out of and back into the share button).
              useShareUi.setState({ open: false, afterSignIn: true });
              openSignIn(document.querySelector<HTMLElement>(SHARE_BUTTON), 'menu');
            }}
            className="hit lg-plate flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold"
            data-filled=""
            data-testid="share-signin"
          >
            {t('account.signIn')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cx('flex flex-col gap-4', pad)} data-testid="share-surface-body" data-shared={shared ? '' : undefined}>
      {head}
      <div className="flex items-center gap-3">
        <label htmlFor="share-switch" className="min-w-0 flex-1 cursor-pointer text-[14.5px] leading-5 font-medium">
          {t('share.anyone')}
        </label>
        <GlassSwitch
          id="share-switch"
          checked={on}
          disabled={ui.busy}
          onChange={(v) => {
            setWant(v);
            void setShared(meta.id, v);
          }}
          data-testid="share-switch"
        />
      </div>
      {ui.failed && (
        <p className="-mt-1 text-[13.5px] leading-5 text-ink" role="alert" data-testid="share-failed">
          {t('share.failed')}
        </p>
      )}
      {shared && !ui.busy && (
        <>
          <GlassSep className="mx-0 my-0" />
          <div className={cx('flex gap-2', phone ? 'flex-col' : 'items-center')}>
            {/* Phones: the field over the button (a column: no flex-1, which would take the field's height). */}
            <label className={cx('lg-field flex h-11 min-w-0 items-center px-3.5', !phone && 'flex-1')}>
              <input
                ref={field}
                readOnly
                aria-label={t('share.link')}
                value={url}
                onFocus={(e) => e.target.select()}
                className="tnum h-full w-full min-w-0 truncate bg-transparent text-[13px] font-medium text-ink-2 outline-none [&:focus-visible]:outline-none"
                data-testid="share-link"
              />
            </label>
            <button
              type="button"
              onClick={() => void copyLink(url, t('share.copied'), { title: name, send: canSend, field: field.current })}
              className={cx('hit lg-plate h-11 shrink-0 rounded-full px-4 text-[14px] font-semibold whitespace-nowrap', phone && 'w-full')}
              data-filled=""
              data-testid="share-copy"
            >
              {canSend ? t('share.send') : t('share.copy')}
            </button>
          </div>
        </>
      )}
      {/* Last, so the surface ends in text (no shape in its corner). */}
      <p className="text-[13px] leading-[18px] text-ink-2" data-testid="share-note">
        {t('share.viewersCannot')}
      </p>
    </div>
  );
}

/**
 * The one share surface: on desktop under the house name's row (the
 * share button beside the name) or a card's "more" button on the projects
 * page; a sheet on phones (opened by the share button or the project
 * menu's "分享" row).
 * Signed out it says sharing needs the account and offers sign-in; once
 * signed in (the browser's house kept with the account, task 027) it
 * opens again by itself.
 */
export function ShareHost({ phone }: { phone?: boolean }) {
  const t = useT();
  const open = useShareUi((s) => s.open);
  const anchorEl = useShareUi((s) => s.anchor);
  const [shown, setShown] = useState(open);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (open) setShown(true);
  }, [open]);
  // Signed in from the surface: it opens again once the house is a project of the account.
  useEffect(() => {
    const check = () => {
      const ui = useShareUi.getState();
      if (!ui.afterSignIn) return;
      const user = useChat.getState().server?.user;
      const p = projectSync.store.getState();
      if (!user) {
        if (!useAccount.getState().open) useShareUi.setState({ afterSignIn: false });
        return;
      }
      if (p.on && p.openId && !p.busy) openShare(document.querySelector<HTMLElement>(SHARE_BUTTON), null);
    };
    const a = useChat.subscribe(check);
    const b = projectSync.store.subscribe(check);
    const c = useAccount.subscribe(check);
    return () => {
      a();
      b();
      c();
    };
  }, []);
  // A press outside closes it (desktop); Escape closes it and gives focus back to its opener.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (phone || panel.current?.contains(e.target as Node)) return;
      const opener = useShareUi.getState().anchor;
      if (opener?.contains(e.target as Node) || (e.target as Element | null)?.closest?.(SHARE_BUTTON)) return;
      closeShare();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      closeShare();
      useShareUi.getState().anchor?.focus({ preventScroll: true });
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open, phone]);
  if (!shown) return null;
  // The studio: under the row of the house name it shares (as the project menu stands under the name), grown out of the
  // share button. The projects page: under the card's "more" button.
  const opener = () => (anchorEl?.isConnected ? anchorEl : document.querySelector<HTMLElement>(SHARE_BUTTON));
  const row = () => opener()?.closest<HTMLElement>(TITLE_ROW) ?? null;
  const anchor = () => row() ?? opener();
  if (phone) {
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    return (
      <>
        <div className={cx('pointer-events-auto absolute inset-0 z-40 bg-black/10 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0', !open && 'pointer-events-none')} onClick={closeShare} aria-hidden="true" />
        <GlassSheet
          open={open}
          large={Math.round(vh * 0.92)}
          onClose={closeShare}
          onClosed={() => setShown(false)}
          ariaLabel={t('share.button')}
          testId="share-surface"
          className="z-50"
          style={{ left: 8, right: 8, bottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="share-title">
            <ShareBody phone />
          </div>
        </GlassSheet>
      </>
    );
  }
  return (
    <GlassPopover
      ref={panel}
      open={open}
      anchor={anchor}
      placement={row() ? 'below-start' : 'below-end'}
      from={opener}
      kind="text"
      onClosed={() => setShown(false)}
      ariaRole="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
      style={{ width: 380 }}
      data-testid="share-surface"
    >
      <ShareBody />
    </GlassPopover>
  );
}

/* ------------------------------------------------------------------ */
/* The viewer's bar                                                    */
/* ------------------------------------------------------------------ */

/**
 * Viewing a shared project, the prompt's place holds one quiet bar: the
 * project's name, "仅查看", and "创建我的副本" (Figma's "View only" chip
 * and "Duplicate to your drafts"; Google Docs' "Make a copy").
 */
export function ViewOnlyBar({ phone }: { phone?: boolean }) {
  const t = useT();
  const name = useHouseName();
  const ready = useShared((s) => s.status === 'ready');
  const [asking, setAsking] = useState<((ok: boolean) => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = async () => {
    setBusy(true);
    // Kept as this browser's house: the owner's own name for it, if any (else the house's title shows, as for any house).
    const r = await makeCopy(useShared.getState().name, t('projects.copyName', { name }), () => new Promise<boolean>((ok) => setAsking(() => ok)));
    setAsking(null);
    if (r !== null) setBusy(false);
    if (r === 'full') toast(t('share.copyFull'), 'share-copy-full');
    else if (r === 'failed') toast(t('share.copyFailed'), 'share-copy-failed');
  };
  const answer = (ok: boolean) => asking?.(ok);
  const btn = 'hit lg-plate h-8 shrink-0 rounded-full px-3.5 text-[13.5px] font-semibold whitespace-nowrap';
  return (
    <div className="pointer-events-none flex w-full justify-center">
      {/* Text 12 px from the start, the 32 px buttons concentric at the end (8 px): the input capsule's insets. */}
      <Glass className={cx('pointer-events-auto flex h-12 min-w-0 items-center gap-3 pr-2 pl-3', phone ? 'w-full' : 'max-w-full')} data-testid="view-only-bar">
        {asking ? (
          <>
            {/* Phones: up to two lines (the question must be read whole); desktop has the width for one. */}
            <span className={cx('min-w-0 flex-1 font-medium', phone ? 'line-clamp-2 text-[13px] leading-4' : 'truncate text-[14px]')} data-testid="view-only-ask">{t('share.replaceAsk')}</span>
            <button type="button" className={btn} data-filled="" onClick={() => answer(true)} data-testid="view-only-replace">
              {t('share.replace')}
            </button>
            <button type="button" className={cx(btn, '-ml-1.5')} onClick={() => answer(false)} data-testid="view-only-cancel">
              {t('projects.cancel')}
            </button>
          </>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-[14px]">
              <span className="min-w-0 truncate font-semibold" data-testid="view-only-name">{name}</span>
              <span className="shrink-0 text-ink-2">· {t('share.viewOnly')}</span>
            </span>
            <button type="button" disabled={!ready || busy} className={btn} data-filled="" onClick={() => void copy()} data-testid="view-only-copy">
              {t('share.makeCopy')}
            </button>
          </>
        )}
      </Glass>
    </div>
  );
}
