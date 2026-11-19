// Share links (task 028; task 032: opened from the project menu, signed in
// only). The owner's side: the one share surface (a glass popover under the name's row on desktop, a
// sheet on phones; the projects page's card menu opens the same surface).
// The viewer's side: the quiet bar that takes the prompt's place, with
// "make my own copy" (Figma's "View only" and "Duplicate to your drafts").
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Notice, NoticeAction, Popover, usePhone } from '@opensu/ui';
import { useT } from '../lib/i18n';
import { projectSync, useHouseName } from '../lib/projects';
import { closeShare, makeCopy, openShare, useShareUi } from '../lib/share';
import { toast } from '../lib/toast';
import { useShared } from '../lib/view-only';
import { useAccount } from '../chat/account';
import { useChat } from '../chat/chat-store';

/** What opens the surface in the studio (task 032): the project menu's trigger, the house name. */
export const SHARE_OPENER = '[data-testid=project-menu]';
/** The row of the house name: the share surface (and the sign-in it offers) stands under it. */
export const TITLE_ROW = '[data-title-row]';

/* ------------------------------------------------------------------ */
/* The surface                                                         */
/* ------------------------------------------------------------------ */

const ShareBody = lazy(() => import('./share-body'));

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
      if (p.on && p.openId && !p.busy) openShare(document.querySelector<HTMLElement>(SHARE_OPENER), null);
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
  if (!shown) return null;
  // The studio: under the row of the house name it shares (as the project menu stands under the name). The projects
  // page: under the card's "more" button. Base UI closes it (Escape: focus back to its opener; a press outside).
  const opener = () => (anchorEl?.isConnected ? anchorEl : document.querySelector<HTMLElement>(SHARE_OPENER));
  const row = () => opener()?.closest<HTMLElement>(TITLE_ROW) ?? null;
  const anchor = () => row() ?? opener();
  return (
    <Popover
      ref={panel}
      open={open}
      anchor={anchor}
      placement={row() ? 'below-start' : 'below-end'}
      size="dialog"
      onClose={closeShare}
      finalFocus={() => opener()}
      onClosed={() => setShown(false)}
      labelledBy="share-title"
      label={t('share.button')}
      testId="share-surface"
    >
      <Suspense fallback={null}>
        <ShareBody />
      </Suspense>
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
