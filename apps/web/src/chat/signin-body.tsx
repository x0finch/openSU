// The sign-in sheet's content (task 019), loaded on first use or when the page is idle (task 032).
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GoogleLogo } from '../components/icons';
import { CodeField, Input, PopoverAction, PopoverBody, PopoverDescription, PopoverFooter, PopoverHeader, PopoverTitle, Separator, Spinner } from '@opensu/ui';
import { GoogleButton } from './GoogleButton';
import { type MessageKey, useT } from '../lib/i18n';
import { closeSignIn, continueWithGoogle, editEmail, sendCode, useAccount, verifyCode } from './account';
import { useChat } from './chat-store';

type T = ReturnType<typeof useT>;
const tk = (t: T) => (k: MessageKey) => t(k);

/** Six boxes, as in iOS verification-code entry (Base UI's OTP Field, through the base's CodeField). */
export function CodeBoxes({ onComplete, disabled, wrong, label }: { onComplete: (code: string) => void; disabled?: boolean; wrong: number; label: (n: number) => string }) {
  const [code, setCode] = useState('');
  const row = useRef<HTMLDivElement>(null);
  const first = () => row.current?.querySelector<HTMLInputElement>('input[data-testid=otp-0]');
  // The first box is focused on arrival (again once a hidden sheet shows).
  useLayoutEffect(() => {
    const focus = () => first()?.focus({ preventScroll: true });
    focus();
    const ids = [60, 150, 300, 500, 800, 1200].map((ms) => window.setTimeout(() => !row.current?.contains(document.activeElement) && focus(), ms));
    return () => ids.forEach(clearTimeout);
  }, []);
  // A wrong code: the row shakes, then clears (as the iOS passcode does), focus back to the first box.
  useEffect(() => {
    if (!wrong) return;
    const el = row.current;
    if (el) {
      el.classList.remove('otp-shake');
      void el.offsetWidth;
      el.classList.add('otp-shake');
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(() => {
      setCode('');
      first()?.focus({ preventScroll: true });
    }, reduced ? 0 : 450);
    return () => clearTimeout(id);
  }, [wrong]);
  return (
    <CodeField
      rowRef={row}
      value={code}
      onValueChange={setCode}
      onComplete={onComplete}
      disabled={disabled}
      label={label}
      onAnimationEnd={() => row.current?.classList.remove('otp-shake')}
      data-testid="otp-boxes"
    />
  );
}

function useCountdown(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [until, now]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

export default function SignInBody() {
  const t = useT();
  const step = useAccount((s) => s.step);
  const email = useAccount((s) => s.email);
  const busy = useAccount((s) => s.busy);
  const error = useAccount((s) => s.error);
  const wrong = useAccount((s) => s.wrong);
  const resendAt = useAccount((s) => s.resendAt);
  const google = useChat((s) => !!s.server?.auth?.google);
  const emailOn = useChat((s) => !!s.server?.auth?.email);
  const [value, setValue] = useState(email);
  const field = useRef<HTMLInputElement>(null);
  const left = useCountdown(resendAt);
  useLayoutEffect(() => {
    if (step !== 'email') return;
    // The phone sheet is hidden for its first frame; focus once it shows.
    const focus = () => field.current?.focus({ preventScroll: true });
    focus();
    // Retried until it takes: the sheet stays hidden until its first spring frame, and under load (a phone
    // drawing its first 3D frame) that frame can come seconds later; a fixed list of retries up to 1.2 s
    // missed it (task 027: the flaky "focused on arrival" check). Stops once focused, or once the person
    // has put focus somewhere else themselves.
    const started = performance.now();
    const id = window.setInterval(() => {
      const a = document.activeElement;
      const elsewhere = a && a !== document.body && a !== field.current && !a.closest('[data-testid=signin-sheet]');
      if (a === field.current || (elsewhere && a.matches('input, textarea')) || performance.now() - started > 6000) clearInterval(id);
      else focus();
    }, 80);
    return () => clearInterval(id);
  }, [step]);

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) void sendCode(value, tk(t));
  };
  const head = (title: string, back?: () => void) => (
    <PopoverHeader onClose={closeSignIn} closeLabel={t('account.close')} closeTestId="signin-close" back={back ? { label: t('account.change'), onClick: back } : undefined}>
      <PopoverTitle id="signin-title">{title}</PopoverTitle>
    </PopoverHeader>
  );
  const errorLine = error && (
    <p className="text-[13.5px] leading-5 text-ink" role="alert" data-testid="signin-error">
      {error}
    </p>
  );

  if (step === 'code') {
    return (
      <div className="contents" data-testid="signin-code">
        {head(t('account.codeTitle'), editEmail)}
        <PopoverDescription>
          <span className="block truncate">{t('account.codeSent', { email })}</span>
        </PopoverDescription>
        <PopoverBody>
          <CodeBoxes key={email} wrong={wrong} disabled={busy} onComplete={(c) => void verifyCode(c, tk(t))} label={(n) => (n ? t('account.digit', { n }) : t('account.code'))} />
          {errorLine || <p className="text-[13px] leading-5 text-ink-2">{busy ? <Spinner /> : t('account.codeNext')}</p>}
        </PopoverBody>
        <PopoverFooter
          note={
            left > 0 ? (
              <span className="tnum" data-testid="signin-countdown">{t('account.resendIn', { s: left })}</span>
            ) : undefined
          }
        >
          {left <= 0 && (
            <PopoverAction kind="secondary" onClick={() => void sendCode(email, tk(t))} disabled={busy} data-testid="signin-resend">
              {t('account.resend')}
            </PopoverAction>
          )}
        </PopoverFooter>
      </div>
    );
  }

  return (
    <form onSubmit={submitEmail} noValidate className="contents" data-testid="signin-email">
      {head(t('account.title'))}
      <PopoverDescription>{t('account.why')}</PopoverDescription>
      {emailOn && (
        <PopoverBody>
          <Input
            ref={field}
            size="lg"
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('account.email')}
            aria-label={t('account.email')}
            data-testid="signin-email-input"
          />
          {errorLine || <p className="-mt-1 text-[13px] leading-5 text-ink-2">{t('account.emailNext')}</p>}
        </PopoverBody>
      )}
      <PopoverFooter>
        {emailOn && (
          <PopoverAction busy={busy} data-testid="signin-continue">
            {t('account.continue')}
          </PopoverAction>
        )}
        {emailOn && google && (
          <div className="flex items-center gap-3 text-[12px] text-ink-2" aria-hidden="true">
            <Separator className="mx-0 my-0 flex-1" />
            {t('account.or')}
            <Separator className="mx-0 my-0 flex-1" />
          </div>
        )}
        {google && (
          // Google's own button (its brand rules: the standard "G" unmodified, its dark theme).
          <GoogleButton onClick={() => void continueWithGoogle(tk(t))} disabled={busy} label={t('account.google')} logo={<GoogleLogo width={20} height={20} />} data-testid="signin-google" />
        )}
      </PopoverFooter>
      {!emailOn && errorLine}
    </form>
  );
}

