// The sign-in sheet's content (task 019), loaded on first use or when the page is idle (task 032).
import { type ClipboardEvent, type FormEvent, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GoogleLogo } from '../components/icons';
import { CodeInput, Input, PopoverAction, PopoverBody, PopoverDescription, PopoverFooter, PopoverHeader, PopoverTitle, Separator, Spinner } from '@opensu/ui';
import { GoogleButton } from './GoogleButton';
import { type MessageKey, useT } from '../lib/i18n';
import { closeSignIn, continueWithGoogle, editEmail, sendCode, useAccount, verifyCode } from './account';
import { useChat } from './chat-store';

type T = ReturnType<typeof useT>;
const tk = (t: T) => (k: MessageKey) => t(k);

/** Six boxes, as in iOS verification-code entry. */
export function CodeBoxes({ onComplete, disabled, wrong, label }: { onComplete: (code: string) => void; disabled?: boolean; wrong: number; label: (n: number) => string }) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const row = useRef<HTMLDivElement>(null);
  const done = useRef(onComplete);
  done.current = onComplete;
  // The first box is focused on arrival (again once a hidden sheet shows).
  useLayoutEffect(() => {
    const focus = () => refs.current[0]?.focus({ preventScroll: true });
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
      setDigits(['', '', '', '', '', '']);
      refs.current[0]?.focus({ preventScroll: true });
    }, reduced ? 0 : 450);
    return () => clearTimeout(id);
  }, [wrong]);

  const fill = (from: number, chars: string) => {
    const only = chars.replace(/\D/g, '');
    if (!only) return;
    // A whole code (paste or the keyboard's one-time-code suggestion) fills every box.
    const start = only.length >= 6 ? 0 : from;
    const next = [...digits];
    for (let i = 0; i < only.length && start + i < 6; i++) next[start + i] = only[i]!;
    setDigits(next);
    const end = Math.min(5, start + only.length);
    refs.current[next.every(Boolean) ? 5 : end]?.focus({ preventScroll: true });
    if (next.every(Boolean)) done.current(next.join(''));
  };
  const onKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...digits];
      // Backspace clears this box, or goes back and clears the previous one.
      if (next[i]) next[i] = '';
      else if (i > 0) {
        next[i - 1] = '';
        refs.current[i - 1]?.focus();
      }
      setDigits(next);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < 5) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
  };
  const onPaste = (i: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    fill(i, e.clipboardData.getData('text'));
  };
  return (
    <div ref={row} className="flex justify-between gap-2" role="group" aria-label={label(0)} onAnimationEnd={() => row.current?.classList.remove('otp-shake')} data-testid="otp-boxes">
      {digits.map((d, i) => (
        <CodeInput
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              const next = [...digits];
              next[i] = '';
              setDigits(next);
            } else fill(i, v.slice(d ? 1 : 0) || v);
          }}
          onKeyDown={onKey(i)}
          onPaste={onPaste(i)}
          onFocus={(e) => e.target.select()}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={6}
          aria-label={label(i + 1)}
          data-testid={`otp-${i}`}
        />
      ))}
    </div>
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

