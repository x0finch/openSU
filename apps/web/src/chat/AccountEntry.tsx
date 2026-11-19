// The account entry (task 026, moved by task 029). In the studio the
// account lives in the project menu only (its first row: "登录", or the
// name opening the account menu); on /projects it is a button at the top
// right (signed out "登录", signed in the picture or the first letter of
// the name). Both open the same surfaces (`openAccount`): one
// implementation. Hidden when the server offers no sign-in.
import { type ReactElement, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PersonIcon } from '../components/icons';
import { Avatar, Button, cx, Menu, MenuItem, MenuLabel, Separator, Toast, Tooltip } from '@opensu/ui';
import { useT } from '../lib/i18n';
import { closeAccountMenu, openSignIn, signOut, useAccount } from './account';
import { useChat } from './chat-store';
import { useKeys } from './keys';
import { showKeyChoices } from './KeyPicker';
import { useToast } from '../lib/toast';
import { SignInInvite, useInviteVisible } from './SignInInvite';

export const ACCOUNT_BUTTON = '[data-account-button]';
const HOUSE_NAME = '[data-house-name]';

/** Sign-in is offered by this server (email or Google). */
export const useAuthOn = () => useChat((s) => !!(s.server?.auth?.email || s.server?.auth?.google));
export const useUser = () => useChat((s) => s.server?.user ?? null);

/** What to call the account: its name, else its email. */
export const accountName = (u: { email: string; name?: string | null }) => u.name || u.email;

/**
 * Opens the account surface from `el`: the sign-in surface when signed out,
 * the account menu when signed in. `from`: the account button, or a row of
 * the project menu (the surface then stands under the house name).
 */
export function openAccount(el: HTMLElement | null, from: 'button' | 'menu'): void {
  const user = useChat.getState().server?.user;
  if (!user) {
    openSignIn(el, from === 'button' ? 'account' : 'menu');
    return;
  }
  const r = el?.getBoundingClientRect();
  useAccount.setState({ menu: true, menuFrom: from, menuRect: from === 'menu' && r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null });
}

/**
 * The account button of /projects. Desktop (`size` 48): signed out a
 * capsule with the person icon and "登录", signed in a circle with the
 * avatar. Phone (`round`): a circle in both states.
 */
export function AccountButton({ size = 48, round, className }: { size?: number; round?: boolean; className?: string }) {
  const t = useT();
  const authOn = useAuthOn();
  const user = useUser();
  const menuOpen = useAccount((s) => s.menu && s.menuFrom === 'button');
  const signInOpen = useAccount((s) => s.open && s.origin === 'account');
  const ref = useRef<HTMLButtonElement>(null);
  if (!authOn) return null;
  const open = menuOpen || signInOpen;
  const onClick = () => {
    if (open) {
      if (signInOpen) useAccount.setState({ open: false, busy: false });
      else closeAccountMenu();
      return;
    }
    openAccount(ref.current, 'button');
  };
  const common = {
    ref,
    height: size,
    onClick,
    'aria-haspopup': user ? ('menu' as const) : ('dialog' as const),
    'aria-expanded': open,
    'data-account-button': '',
    'data-testid': 'account-button',
    'data-state': user ? 'signed-in' : 'signed-out',
  };
  // Phones have no hover: no tooltip there (a tap would leave it standing).
  const tipped = (label: string, el: ReactElement) => <span className={cx('inline-flex', className)}>{round ? el : <Tooltip label={label}>{el}</Tooltip>}</span>;
  if (user) {
    const inner = Math.round(size * (40 / 48));
    return tipped(t('account.label'), <Button variant="glass" {...common} label={`${t('account.label')}: ${accountName(user)}`} icon={<Avatar name={accountName(user)} image={user.image} size={inner} />} />);
  }
  if (round) return tipped(t('account.signIn'), <Button variant="glass" {...common} label={t('account.signIn')} icon={<PersonIcon width={size < 40 ? 18 : 20} height={size < 40 ? 18 : 20} />} />);
  return (
    <span className={cx('inline-flex', className)}>
      <Button variant="glass" {...common} icon={<PersonIcon width={19} height={19} className="shrink-0" />}>
        {t('account.signIn')}
      </Button>
    </span>
  );
}

/**
 * The account menu (signed in): who, today's allowance, the keys (studio
 * only), sign out. Under the house name when the project menu opened it
 * (the studio), at the account button on /projects.
 */
export function AccountMenuHost() {
  const t = useT();
  const open = useAccount((s) => s.menu);
  const from = useAccount((s) => s.menuFrom);
  const user = useUser();
  const server = useChat((s) => s.server);
  // On the projects page (task 027): no keys row (the key picker lives in the studio).
  const onProjectsPage = typeof location !== 'undefined' && location.pathname.startsWith('/projects');
  const menu = useRef<HTMLElement | null>(null);
  const show = open && !!user;
  // Signed out elsewhere (or the status changed): nothing to show.
  useEffect(() => {
    if (open && !user) closeAccountMenu();
  }, [open, user]);
  const back = () => document.querySelector<HTMLElement>(from === 'button' ? ACCOUNT_BUTTON : '[data-testid=project-menu]')?.focus({ preventScroll: true });
  const quota = server?.serverKey && server.quota && server.quota.kind === 'user' ? server.quota : null;
  return (
    <Menu
      ref={menu}
      open={show}
      anchor={() => document.querySelector<HTMLElement>(from === 'button' ? ACCOUNT_BUTTON : HOUSE_NAME)}
      // Base UI closes it (Escape, a press outside, focus leaving); the button toggles it itself.
      onClose={() => closeAccountMenu()}
      // Back to the control it came from (the account button, or the house name when the project menu opened it).
      finalFocus={() => document.querySelector<HTMLElement>(from === 'button' ? ACCOUNT_BUTTON : '[data-testid=project-menu]')}
      placement={from === 'button' ? 'below-end' : 'below-start'}
      label={t('account.menu')}
      style={{ width: 'min(320px, calc(100vw - 24px))' }}
      testId={show ? 'account-menu' : undefined}
    >
      {user && (
        <>
          <MenuLabel title={accountName(user)} sub={user.name ? user.email : undefined} testId="account-identity" subTestId="account-email" />
          <Separator />
          {quota && (
            <MenuLabel title={t('keys.free')} detail={quota.remaining > 0 ? t('quota.left', { n: quota.remaining }) : t('quota.usedUp')} testId="account-allowance" />
          )}
          {!onProjectsPage && (
          <MenuItem
            onClick={() => {
              closeAccountMenu();
              // Keys saved with the account: the key picker's list; else the browser's key settings.
              if (useKeys.getState().ready) showKeyChoices();
              else useChat.getState().setSettingsOpen(true);
            }}
            data-testid="account-keys"
          >
            {t('account.myKeys')}
          </MenuItem>
          )}
          {(!onProjectsPage || quota) && <Separator />}
          <MenuItem
            onClick={() => {
              closeAccountMenu();
              void signOut();
            }}
            data-testid="account-signout"
          >
            {t('account.signOut')}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

/**
 * The short message above the input that leaves by itself: the
 * confirmation after a sign-in ("已登录 · name"), or a message of the
 * studio (`toast`, src/lib/toast.ts; task 027). The latest wins. In the
 * studio (`invite`) the same place holds the sign-in invitation (task 029)
 * while no message is showing.
 */
export function StudioToast({ className, invite }: { className?: string; invite?: 'desktop' | 'phone' }) {
  const t = useT();
  const welcome = useAccount((s) => s.welcome);
  const note = useToast();
  const user = useUser();
  const [shown, setShown] = useState<{ text: string; testId: string } | null>(null);
  useEffect(() => {
    if (!welcome || !user) return;
    setShown({ text: t('account.signedInAs', { name: accountName(user) }), testId: 'account-toast' });
    const id = window.setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcome]);
  useEffect(() => {
    if (!note.seq) return;
    setShown({ text: note.text, testId: note.testId });
    const id = window.setTimeout(() => setShown(null), 5200);
    return () => clearTimeout(id);
  }, [note.seq, note.text, note.testId]);
  const inviting = useInviteVisible() && !!invite;
  if (!shown) return inviting ? <div className={className}><SignInInvite phone={invite === 'phone'} /></div> : null;
  return (
    <div className={cx('pointer-events-none flex animate-[fade-in_200ms_ease-out] justify-center', className)}>
      <Toast data-testid={shown.testId}>
        <span className="max-w-[min(480px,calc(100vw-56px))] truncate">{shown.text}</span>
      </Toast>
    </div>
  );
}

/**
 * `/studio?signin=1` (the landing's "登录"): the sign-in surface opens once,
 * under the house name (where the project menu's account row is), as soon as the server says sign-in is on and
 * nobody is signed in; the parameter leaves the address at once.
 */
export function useSignInParam(): void {
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('signin') !== '1') return;
    q.delete('signin');
    const qs = q.toString();
    history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
    let done = false;
    let timer = 0;
    const tryOpen = () => {
      const s = useChat.getState().server;
      if (done || !s) return;
      done = true;
      unsub();
      if (!(s.auth?.email || s.auth?.google) || s.user) return;
      // After the first frame with the status (the house name is in place).
      timer = window.setTimeout(() => openSignIn(null, 'menu'), 60);
    };
    const unsub = useChat.subscribe(tryOpen);
    tryOpen();
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);
}
