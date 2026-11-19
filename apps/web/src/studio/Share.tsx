// Share links (task 028; placed by task 029). The owner's side: the
// "分享" button right of the house name, with the document it shares
// (Apple's document title menu, Notion's title row), and the one share
// surface it opens (a glass popover under the name's row on desktop, a
// sheet on phones; the projects page's card menu opens the same surface).
// The viewer's side: the quiet bar that takes the prompt's place, with
// "make my own copy" (Figma's "View only" and "Duplicate to your drafts").
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, cx, Input, Notice, NoticeAction, Popover, PopoverAction, PopoverBody, PopoverDescription, PopoverFooter, PopoverHeader, PopoverTitle, Switch, usePhone } from '@opensu/ui';
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
 * "分享": a glass capsule on the house name's line, as high as the name
 * (desktop; phones have the project menu's row). There whenever projects
 * are kept with accounts here (signed out it explains and offers sign-in);
 * absent while viewing a shared project.
 */
export function ShareButton({ className }: { className?: string }) {
  const t = useT();
  const offered = useProjectsOffered();
  const viewOnly = useViewOnly();
  const open = useShareUi((s) => s.open && !s.project);
  const ref = useRef<HTMLButtonElement>(null);
  if (viewOnly || !offered) return null;
  return (
    <span className={cx('inline-flex', className)}>
      <Button
        variant="glass"
        height={36}
        ref={ref}
        onClick={() => (open ? closeShare() : openShare(ref.current, null))}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-share-button=""
        data-testid="share-button"
      >
        {t('share.button')}
      </Button>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* The surface                                                         */
/* ------------------------------------------------------------------ */

function ShareBody() {
  const t = useT();
  const phone = usePhone();
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
  const canSend = phone && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const head = (
    <PopoverHeader onClose={closeShare} closeLabel={t('account.close')} closeTestId="share-close">
      <PopoverTitle id="share-title">{meta ? t('share.titleOf', { name }) : t('share.button')}</PopoverTitle>
    </PopoverHeader>
  );

  if (!user || !meta) {
    // Signed out, or this house is not (yet) a project of the account.
    return (
      <div className="contents" data-testid="share-need-account">
          {head}
          <PopoverDescription>{user ? t('share.notKept') : t('share.needAccount')}</PopoverDescription>
          {!user && (
            <PopoverFooter>
              <PopoverAction
                onClick={() => {
                  // Under the name's row, as the share surface was (it grows out of and back into the share button).
                  useShareUi.setState({ open: false, afterSignIn: true });
                  openSignIn(document.querySelector<HTMLElement>(SHARE_BUTTON), 'menu');
                }}
                data-testid="share-signin"
              >
                {t('account.signIn')}
              </PopoverAction>
            </PopoverFooter>
          )}
      </div>
    );
  }

  return (
    <div className="contents" data-testid="share-surface-body" data-shared={shared ? '' : undefined}>
      {head}
      <PopoverBody>
        <div className="flex items-center gap-3">
          <label htmlFor="share-switch" className="min-w-0 flex-1 cursor-pointer text-[14.5px] leading-5 font-medium">
            {t('share.anyone')}
          </label>
          <Switch
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
          <p className="text-[13.5px] leading-5 text-ink" role="alert" data-testid="share-failed">
            {t('share.failed')}
          </p>
        )}
        {shared && !ui.busy && <Input ref={field} readOnly mono size="md" aria-label={t('share.link')} value={url} onFocus={(e) => e.target.select()} data-testid="share-link" />}
      </PopoverBody>
      <PopoverFooter note={<span data-testid="share-note">{t('share.viewersCannot')}</span>}>
        {shared && !ui.busy && (
          <PopoverAction onClick={() => void copyLink(url, t('share.copied'), { title: name, send: canSend, field: field.current })} data-testid="share-copy">
            {canSend ? t('share.send') : t('share.copy')}
          </PopoverAction>
        )}
      </PopoverFooter>
    </div>
  );
}

/**
 * The one share surface: on desktop under the house name's row (the
 * share button beside the name) or a card's "more" button on the projects
 * page; a sheet on phones (the base's rule; opened by the project menu's
 * "分享" row). Signed out it says sharing needs the account and offers
 * sign-in; once signed in (the browser's house kept with the account,
 * task 027) it opens again by itself.
 */
export function ShareHost() {
  const t = useT();
  const phone = usePhone();
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
  return (
    <Popover
      ref={panel}
      open={open}
      anchor={anchor}
      placement={row() ? 'below-start' : 'below-end'}
      from={opener}
      size="dialog"
      onClose={closeShare}
      onClosed={() => setShown(false)}
      labelledBy="share-title"
      label={t('share.button')}
      testId="share-surface"
    >
      <ShareBody />
    </Popover>
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
  return (
    <Notice phone={phone} wide={phone} role="group" testId="view-only-bar" actions={asking ? (
      <>
        <NoticeAction filled onClick={() => answer(true)} data-testid="view-only-replace">
          {t('share.replace')}
        </NoticeAction>
        <NoticeAction className="-ml-1.5" onClick={() => answer(false)} data-testid="view-only-cancel">
          {t('projects.cancel')}
        </NoticeAction>
      </>
    ) : (
      <NoticeAction filled disabled={!ready || busy} onClick={() => void copy()} data-testid="view-only-copy">
        {t('share.makeCopy')}
      </NoticeAction>
    )}>
      {asking ? (
        <span data-testid="view-only-ask">{t('share.replaceAsk')}</span>
      ) : (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="min-w-0 truncate font-semibold" data-testid="view-only-name">{name}</span>
          <span className="shrink-0 font-normal text-ink-2">· {t('share.viewOnly')}</span>
        </span>
      )}
    </Notice>
  );
}
