// The sign-in invitation (task 029): once a signed-out visitor has
// something worth keeping (their first successful change to the house
// through the assistant), one quiet glass notice above the prompt says what
// signing in gives them, with "登录" and a close button. Not a dialog
// (Apple's HIG: delay sign-in until people have used the app; do not
// interrupt with alerts for something that is not urgent).
//
// Rules: shown at most once per browser (recorded when it appears; it then
// stays in that page until closed or signed in); after it was closed (or
// shown and left), not again for 14 days; never once signed in on this
// browser. Hidden for the moment (not ended) while the assistant works,
// while walking, while another surface is open, or while the quota note
// (with its own sign-in) is the latest reply. Never with sign-in off or in
// view-only mode. It lies over the drawing and never moves the house.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { floatingOpen, Notice, NoticeAction, subscribeFloating } from '../ui';
import { useT } from '../lib/i18n';
import { useShareUi } from '../lib/share';
import { useStudio } from '../lib/store';
import { useViewOnly } from '../lib/view-only';
import { openSignIn, useAccount } from './account';
import { useChat } from './chat-store';
import { useKeys } from './keys';

const KEY = 'opensu.invite.v1';
/** After it was closed (or shown and left), this long before it may show again. */
export const INVITE_QUIET_MS = 14 * 24 * 3600 * 1000;

/** What this browser remembers: when it was last shown or closed, and whether someone signed in here. */
type Seen = { at?: number; done?: boolean };
function read(): Seen {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Seen | null;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function write(v: Seen): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* private mode: it may show again in the next page */
  }
}

/** The invitation is up in this page (it may be hidden for the moment, see `useInviteVisible`). */
const useInvite = create<{ up: boolean }>(() => ({ up: false }));

const authOn = () => {
  const s = useChat.getState().server;
  return !!(s?.auth?.email || s?.auth?.google);
};

/**
 * Raises the invitation after a successful change by the assistant (the
 * turn has ended: never while a reply streams), and ends it for good once
 * someone signs in. Called once by the studio.
 */
export function useSignInInvite(): void {
  const viewOnly = useViewOnly();
  useEffect(() => {
    if (viewOnly) return;
    return useChat.subscribe((s, p) => {
      if (s.server?.user && !p.server?.user) {
        write({ done: true });
        useInvite.setState({ up: false });
        return;
      }
      if (!p.running || s.running || useInvite.getState().up) return;
      const turn = [...s.items].reverse().find((i) => i.role === 'assistant' && !i.manual);
      if (!turn?.changes?.length || turn.error || turn.gaveUp || turn.aborted) return;
      if (!authOn() || s.server?.user) return;
      const r = read();
      if (r.done || (r.at && Date.now() - r.at < INVITE_QUIET_MS)) return;
      write({ at: Date.now() });
      useInvite.setState({ up: true });
    });
  }, [viewOnly]);
}

function dismiss(): void {
  write({ at: Date.now() });
  useInvite.setState({ up: false });
}

/** Up, and nothing else needs the moment: no turn running, no other surface open, no quota note, not walking. */
export function useInviteVisible(): boolean {
  const up = useInvite((s) => s.up);
  const viewOnly = useViewOnly();
  const signedOut = useChat((s) => !s.server?.user && !!(s.server?.auth?.email || s.server?.auth?.google));
  const running = useChat((s) => s.running);
  const quotaNote = useChat((s) => [...s.items].reverse().find((i) => i.role === 'assistant')?.error?.kind === 'quota');
  const settings = useChat((s) => s.settingsOpen);
  const studioBusy = useStudio((s) => s.walk || !!s.tray || !!s.sitePanel || s.recent || s.pinned);
  const account = useAccount((s) => s.open || s.menu);
  const keySheet = useKeys((s) => !!s.sheet);
  const share = useShareUi((s) => s.open);
  const [floating, setFloating] = useState(floatingOpen);
  useEffect(() => subscribeFloating(() => setFloating(floatingOpen())), []);
  return up && !viewOnly && signedOut && !running && !quotaNote && !settings && !studioBusy && !account && !keySheet && !share && !floating;
}

/** The notice itself: one line on desktop, up to two on phones; "登录" and close at the end. */
export function SignInInvite({ phone }: { phone?: boolean }) {
  const t = useT();
  return (
    <Notice
      phone={phone}
      onClose={dismiss}
      closeLabel={t('account.close')}
      testId="signin-invite"
      textTestId="signin-invite-text"
      actions={
        <NoticeAction filled onClick={(e) => openSignIn(e.currentTarget, 'input')} data-testid="signin-invite-signin">
          {t('account.signIn')}
        </NoticeAction>
      }
    >
      {t('account.invite')}
    </Notice>
  );
}
