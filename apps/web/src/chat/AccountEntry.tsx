// The account entry (task 026, moved by task 029). In the studio the
// account lives in the project menu only (its first row: "登录", or the
// name opening the account menu); on /projects it is a button at the top
// right (signed out "登录", signed in the picture or the first letter of
// the name). Both open the same surfaces (`openAccount`): one
// implementation. Hidden when the server offers no sign-in.
import { type KeyboardEvent as RKeyboardEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PersonIcon } from '../components/icons';
import { cx, GlassButton, GlassMenu, GlassMenuItem, GlassSep, GlassTip, GlassToast } from '../glass';
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

/** The picture, or the first letter of the name on a quiet plate. */
function Avatar({ user, size }: { user: { email: string; name?: string | null; image?: string | null }; size: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [user.image]);
  if (user.image && !broken) {
    return <img src={user.image} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} data-testid="account-avatar" />;
  }
  const letter = Array.from(accountName(user).trim())[0]?.toUpperCase() ?? '';
  return (
    <span className="lg-plate grid shrink-0 place-items-center font-semibold text-ink" data-filled="" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} data-testid="account-letter" aria-hidden="true">
      {letter}
    </span>
  );
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
    size,
    onClick,
    'aria-haspopup': user ? ('menu' as const) : ('dialog' as const),
    'aria-expanded': open,
    'data-account-button': '',
    'data-testid': 'account-button',
    'data-state': user ? 'signed-in' : 'signed-out',
  };
  // Phones have no hover: no tooltip there (a tap would leave it standing).
  const tipped = (label: string, el: ReactNode) => (round ? <span className={cx('inline-flex', className)}>{el}</span> : <GlassTip label={label} className={className}>{el}</GlassTip>);
  if (user) {
    const inner = Math.round(size * (40 / 48));
    return tipped(t('account.label'), <GlassButton {...common} className="hit" aria-label={`${t('account.label')}: ${accountName(user)}`} icon={<Avatar user={user} size={inner} />} />);
  }
  if (round) return tipped(t('account.signIn'), <GlassButton {...common} className="hit" aria-label={t('account.signIn')} icon={<PersonIcon width={size < 40 ? 18 : 20} height={size < 40 ? 18 : 20} />} />);
  return (
    <span className={cx('inline-flex', className)}>
      <GlassButton {...common} className="hit gap-1.5" icon={<PersonIcon width={19} height={19} className="shrink-0" />}>
        {t('account.signIn')}
      </GlassButton>
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
  const rect = useAccount((s) => s.menuRect);
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
  // A press outside closes it (the button toggles it itself); Escape closes it and returns to the button.
  useEffect(() => {
    if (!show) return;
    const down = (e: PointerEvent) => {
      const n = e.target as Element;
      if (menu.current?.contains(n) || n.closest?.(ACCOUNT_BUTTON)) return;
      closeAccountMenu();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      closeAccountMenu();
      back();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  useLayoutEffect(() => {
    if (show) menu.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true });
  }, [show]);
  const quota = server?.serverKey && server.quota && server.quota.kind === 'user' ? server.quota : null;
  const onKey = (e: RKeyboardEvent) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + d + items.length) % items.length]?.focus();
  };
  return (
    <GlassMenu
      ref={menu as RefObject<HTMLElement | null>}
      open={show}
      anchor={() => document.querySelector<HTMLElement>(from === 'button' ? ACCOUNT_BUTTON : HOUSE_NAME)}
      placement={from === 'button' ? 'below-end' : 'below-start'}
      from={rect ? () => rect : undefined}
      label={t('account.menu')}
      onKeyDown={onKey}
      style={{ width: 'min(320px, calc(100vw - 24px))' }}
      data-testid={show ? 'account-menu' : undefined}
    >
      {user && (
        <>
          <div className="flex min-h-12 flex-col justify-center px-3 py-1.5" data-testid="account-identity">
            <span className="truncate text-[14px] leading-5 font-semibold">{accountName(user)}</span>
            {user.name && <span className="truncate text-[12.5px] leading-[18px] text-ink-2" data-testid="account-email">{user.email}</span>}
          </div>
          <GlassSep />
          {quota && (
            <div className="flex h-10 items-center gap-2.5 px-3 text-[14px] font-medium" data-testid="account-allowance">
              <span className="min-w-0 flex-1 truncate">{t('keys.free')}</span>
              <span className="tnum shrink-0 text-[13px] font-normal text-ink-2">{quota.remaining > 0 ? t('quota.left', { n: quota.remaining }) : t('quota.usedUp')}</span>
            </div>
          )}
          {!onProjectsPage && (
          <GlassMenuItem
            onClick={() => {
              closeAccountMenu();
              // Keys saved with the account: the key picker's list; else the browser's key settings.
              if (useKeys.getState().ready) showKeyChoices();
              else useChat.getState().setSettingsOpen(true);
            }}
            data-testid="account-keys"
          >
            {t('account.myKeys')}
          </GlassMenuItem>
          )}
          {(!onProjectsPage || quota) && <GlassSep />}
          <GlassMenuItem
            onClick={() => {
              closeAccountMenu();
              void signOut();
            }}
            data-testid="account-signout"
          >
            {t('account.signOut')}
          </GlassMenuItem>
        </>
      )}
    </GlassMenu>
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
      <GlassToast data-testid={shown.testId}>
        <span className="max-w-[min(480px,calc(100vw-56px))] truncate">{shown.text}</span>
      </GlassToast>
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
