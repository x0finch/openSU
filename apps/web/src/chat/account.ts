// The account (task 019): sign-in with an emailed code or Google, through
// Better Auth's HTTP routes under /api/auth (no client library: a few
// fetch calls keep the studio's initial JS small). Who is signed in and the
// credits come with GET /api/chat (chat-store `server`).
import { create } from 'zustand';
import type { MessageKey } from '../lib/i18n';
import { useStudio } from '../lib/store';
import { fetchServerStatus, useChat } from './chat-store';

export type SignInStep = 'email' | 'code';

interface AccountState {
  /** The sign-in sheet is open. */
  open: boolean;
  /** Where the sheet grows from (and flows back into). */
  anchor: HTMLElement | null;
  /** Desktop: under the title (the project menu) or above the input (a quota note). */
  origin: 'menu' | 'input';
  step: SignInStep;
  email: string;
  /** When a new code may be asked for (ms epoch). */
  resendAt: number;
  busy: boolean;
  /** A calm sentence shown inside the sheet. */
  error: string | null;
  /** Bumped on a wrong code: the boxes shake and clear. */
  wrong: number;
}

export const useAccount = create<AccountState>(() => ({ open: false, anchor: null, origin: 'menu', step: 'email', email: '', resendAt: 0, busy: false, error: null, wrong: 0 }));

/** Seconds between two codes for one address (the server also limits per hour). */
export const RESEND_SECONDS = 45;

export function openSignIn(anchor: HTMLElement | null, origin: 'menu' | 'input' = 'menu'): void {
  useAccount.setState({ open: true, anchor, origin, error: null, busy: false });
  // From a credits note in the recent strip: the strip makes way (one glass surface at a time).
  if (origin === 'input' && !useStudio.getState().pinned) useStudio.getState().setRecent(false);
}

export function closeSignIn(): void {
  useAccount.setState({ open: false, busy: false });
}

/** Back to the email step (to change the address). */
export function editEmail(): void {
  useAccount.setState({ step: 'email', error: null });
}

type ErrorCode = 'invalid-email' | 'too-many' | 'not-sent' | 'network' | 'wrong-code' | 'expired' | 'google';

/** What went wrong, as a key of the messages (`account.err.*`). */
export const errorKey = (c: ErrorCode) => `account.err.${c}` as MessageKey;

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
    let data: Record<string, unknown> | null = null;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      /* empty body */
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Step 1: email a code. Retries once on a server error (a cold start may fail). */
export async function sendCode(emailRaw: string, t: (k: MessageKey) => string): Promise<boolean> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL.test(email)) {
    useAccount.setState({ error: t(errorKey('invalid-email')) });
    return false;
  }
  useAccount.setState({ busy: true, error: null, email });
  let r = await post('/email-otp/send-verification-otp', { email, type: 'sign-in' });
  if (!r.ok && (r.status === 0 || r.status >= 500)) r = await post('/email-otp/send-verification-otp', { email, type: 'sign-in' });
  if (!r.ok) {
    const code = r.status === 429 ? 'too-many' : r.status === 400 ? 'invalid-email' : r.status === 0 ? 'network' : 'not-sent';
    useAccount.setState({ busy: false, error: t(errorKey(code)) });
    return false;
  }
  useAccount.setState({ busy: false, step: 'code', resendAt: Date.now() + RESEND_SECONDS * 1000 });
  return true;
}

/** Step 2: the code. On success the sheet closes and the studio learns who is signed in. */
export async function verifyCode(code: string, t: (k: MessageKey) => string): Promise<boolean> {
  const { email } = useAccount.getState();
  useAccount.setState({ busy: true, error: null });
  const r = await post('/sign-in/email-otp', { email, otp: code });
  if (!r.ok) {
    const msg = String((r.data as { code?: string } | null)?.code ?? '');
    const kind: ErrorCode = r.status === 0 ? 'network' : /TOO_MANY|EXPIRED/i.test(msg) || r.status === 403 ? 'expired' : r.status === 429 ? 'too-many' : 'wrong-code';
    useAccount.setState((s) => ({ busy: false, error: t(errorKey(kind)), wrong: kind === 'wrong-code' || kind === 'expired' ? s.wrong + 1 : s.wrong }));
    return false;
  }
  await signedIn();
  return true;
}

async function signedIn(): Promise<void> {
  await fetchServerStatus();
  useAccount.setState({ busy: false, open: false, step: 'email', error: null });
}

const DRAFT_KEY = 'opensu.signin.draft';

/**
 * Google: a popup keeps the drawing and the draft where they are; it lands
 * on /auth-done (public/auth-done.html), which tells this window and closes. If popups are
 * blocked, the page goes to Google and comes back here (the draft is kept
 * in sessionStorage for that trip).
 */
export async function continueWithGoogle(t: (k: MessageKey) => string): Promise<void> {
  useAccount.setState({ busy: true, error: null });
  const popup = window.open('about:blank', 'opensu-google', 'popup,width=480,height=640');
  const back = `${location.pathname}${location.search}`;
  const r = await post('/sign-in/social', { provider: 'google', callbackURL: popup ? '/auth-done' : back, errorCallbackURL: popup ? '/auth-done' : back, disableRedirect: true });
  const url = typeof r.data?.url === 'string' ? r.data.url : null;
  if (!r.ok || !url) {
    popup?.close();
    useAccount.setState({ busy: false, error: t(errorKey(r.status === 0 ? 'network' : 'google')) });
    return;
  }
  if (!popup) {
    try {
      sessionStorage.setItem(DRAFT_KEY, useChat.getState().draft);
    } catch {
      /* private mode: the draft is lost on this trip */
    }
    location.href = url;
    return;
  }
  popup.location.href = url;
  const done = await new Promise<string | null>((resolve) => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || (e.data as { type?: string } | null)?.type !== 'opensu-auth') return;
      cleanup();
      resolve(((e.data as { error?: string }).error as string | undefined) ?? '');
    };
    const timer = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        resolve(null);
      }
    }, 500);
    const cleanup = () => {
      window.removeEventListener('message', onMsg);
      clearInterval(timer);
    };
    window.addEventListener('message', onMsg);
  });
  if (done === '') await signedIn();
  else useAccount.setState({ busy: false, error: done === null ? null : t(errorKey('google')) });
}

/** After a redirect trip to Google: put the draft back. */
export function restoreDraftAfterRedirect(): void {
  try {
    const d = sessionStorage.getItem(DRAFT_KEY);
    if (d === null) return;
    sessionStorage.removeItem(DRAFT_KEY);
    if (d && !useChat.getState().draft) useChat.getState().setDraft(d);
  } catch {
    /* nothing to restore */
  }
}

export async function signOut(): Promise<void> {
  await post('/sign-out', {});
  await fetchServerStatus();
}
