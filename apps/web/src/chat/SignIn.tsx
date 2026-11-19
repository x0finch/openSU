// The sign-in sheet (task 019). One flow for new and returning people:
// an email, then the 6-digit code; or Google. Desktop: a glass panel that
// flows out of the control that opened it (the account row of the project
// menu, the share button, the account button on /projects, or the "sign
// in" of a credits note or the invitation) and back; phones: the inset
// bottom sheet (the base Popover's phone form). One field per step, one primary action,
// a short line of what happens next; errors are calm sentences in the
// sheet. Nothing navigates away from the drawing; the message draft stays.
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { Popover, usePhone } from '@opensu/ui';
import { useT } from '../lib/i18n';
import { closeSignIn, useAccount } from './account';


const SignInBody = lazy(() => import('./signin-body'));

const MENU_TRIGGER = '[data-testid=project-menu]';
const HOUSE_NAME = '[data-house-name]';
const INPUT = '[data-testid=prompt]';
const ACCOUNT = '[data-account-button]';

/**
 * Hosts the sheet. Desktop: a popover at the house name (from its menu),
 * at the account button (/projects) or above the input; it grows away from
 * that anchor and goes back to it.
 */
export function SignInHost() {
  const t = useT();
  const phone = usePhone();
  const open = useAccount((s) => s.open);
  const origin = useAccount((s) => s.origin);
  const from = useAccount((s) => s.anchor);
  const [shown, setShown] = useState(open);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (open) setShown(true);
  }, [open]);
  // Where it stands: under the house name (from its menu or the share button beside it), at the account button (/projects), else above the input, where the draft waits.
  const anchor = () => (origin === 'account' && from?.isConnected ? from : document.querySelector<HTMLElement>(origin === 'menu' ? HOUSE_NAME : origin === 'account' ? ACCOUNT : INPUT));
  if (!shown) return null;
  const onClosed = () => {
    setShown(false);
    if (origin === 'menu') (from?.isConnected ? from : document.querySelector<HTMLElement>(MENU_TRIGGER))?.focus({ preventScroll: true });
    else if (origin === 'account') (document.querySelector<HTMLElement>(ACCOUNT) ?? (from?.isConnected ? from : null))?.focus({ preventScroll: true });
    // Desktop: back to the draft (on a phone this would raise the keyboard).
    else if (!phone) document.querySelector<HTMLElement>('[data-testid=prompt-bar]')?.focus({ preventScroll: true });
  };
  return (
    <Popover
      ref={panel}
      open={open}
      anchor={anchor}
      placement={origin === 'menu' ? 'below-start' : origin === 'account' ? 'below-end' : 'above-center'}
      size="dialog"
      // Base UI closes it (Escape, a press outside); not while a code is being checked.
      onClose={(reason) => {
        if (reason === 'outside-press' && useAccount.getState().busy) return;
        closeSignIn();
      }}
      onClosed={onClosed}
      labelledBy="signin-title"
      label={t('account.title')}
      testId="signin-sheet"
    >
      <Suspense fallback={null}>
        <SignInBody />
      </Suspense>
    </Popover>
  );
}
