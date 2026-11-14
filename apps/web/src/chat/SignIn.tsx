// The sign-in sheet (task 019). One flow for new and returning people:
// an email, then the 6-digit code; or Google. Desktop: a glass panel that
// flows out of the control that opened it (the account entry of the
// project menu, or the "sign in" of a credits note) and back; phone: the
// inset bottom sheet with detents. One field per step, one primary action,
// a short line of what happens next; errors are calm sentences in the
// sheet. Nothing navigates away from the drawing; the message draft stays.
import { type ClipboardEvent, type FormEvent, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, CloseIcon, GoogleLogo } from '../components/icons';
import { cx, GlassPopover, GlassSheet } from '../glass';
import { type MessageKey, useT } from '../lib/i18n';
import { closeSignIn, continueWithGoogle, editEmail, RESEND_SECONDS, sendCode, useAccount, verifyCode } from './account';
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
        <input
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
          className="lg-field lg-code tnum h-14 w-0 min-w-0 flex-1 text-center text-[24px] font-semibold text-ink outline-none disabled:opacity-50 [&:focus-visible]:outline-none"
          data-testid={`otp-${i}`}
        />
      ))}
    </div>
  );
}

function Spinner() {
  return <span className="inline-block size-4 animate-[lg-spin_0.8s_linear_infinite] rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />;
}

/** The primary action: one per step (ginkgo yellow, like send). */
function Primary({ children, busy, disabled, testId }: { children: string; busy?: boolean; disabled?: boolean; testId?: string }) {
  return (
    <button type="submit" disabled={disabled || busy} className={cx('hit lg-focus flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent transition-[filter,opacity] duration-150', disabled ? 'opacity-50' : 'hover:brightness-95')} data-testid={testId}>
      {busy && <Spinner />}
      {children}
    </button>
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

function SignInBody({ phone }: { phone?: boolean }) {
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
    // Retried until it takes (a slow first frame can keep the sheet hidden longer).
    const ids = [60, 150, 300, 500, 800, 1200].map((ms) => window.setTimeout(() => document.activeElement !== field.current && focus(), ms));
    return () => ids.forEach(clearTimeout);
  }, [step]);

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) void sendCode(value, tk(t));
  };
  const head = (title: string, back?: () => void) => (
    <div className="flex items-center gap-1">
      {back && (
        <button type="button" onClick={back} aria-label={t('account.change')} className="hit lg-plate -ml-2 grid size-8 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink">
          <ChevronLeftIcon width={18} height={18} />
        </button>
      )}
      <h2 className="min-w-0 flex-1 truncate text-[19px] font-semibold tracking-[-0.01em]" id="signin-title">{title}</h2>
      <button type="button" onClick={closeSignIn} aria-label={t('account.close')} className="hit lg-plate -mr-1.5 grid size-8 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink" data-testid="signin-close">
        <CloseIcon width={16} height={16} />
      </button>
    </div>
  );
  const errorLine = error && (
    <p className="text-[13.5px] leading-5 text-ink" role="alert" data-testid="signin-error">
      {error}
    </p>
  );

  if (step === 'code') {
    return (
      <div className={cx('flex flex-col gap-4', phone ? 'px-5 pt-1 pb-6' : 'p-[22px]')} data-testid="signin-code">
        {head(t('account.codeTitle'), editEmail)}
        <p className="-mt-2 truncate text-[13.5px] leading-5 text-ink-2">{t('account.codeSent', { email })}</p>
        <CodeBoxes key={email} wrong={wrong} disabled={busy} onComplete={(c) => void verifyCode(c, tk(t))} label={(n) => (n ? t('account.digit', { n }) : t('account.code'))} />
        {errorLine || <p className="text-[13px] leading-5 text-ink-2">{busy ? <Spinner /> : t('account.codeNext')}</p>}
        <div className="flex items-center justify-between">
          {left > 0 ? (
            <span className="tnum text-[13px] text-ink-2" data-testid="signin-countdown">{t('account.resendIn', { s: left })}</span>
          ) : (
            <button type="button" onClick={() => void sendCode(email, tk(t))} disabled={busy} className="hit lg-plate -ml-2 h-8 rounded-full px-2 text-[13.5px] font-medium text-ink" data-testid="signin-resend">
              {t('account.resend')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cx('flex flex-col gap-4', phone ? 'px-5 pt-1 pb-6' : 'p-[22px]')} data-testid="signin-email">
      {head(t('account.title'))}
      <p className="-mt-2 text-[13.5px] leading-5 text-ink-2">{t('account.why')}</p>
      {emailOn && (
        <form onSubmit={submitEmail} className="flex flex-col gap-3" noValidate>
          <label className="lg-field flex h-12 items-center px-4">
            <span className="sr-only">{t('account.email')}</span>
            <input
              ref={field}
              type="email"
              name="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('account.email')}
              className="h-full w-full bg-transparent text-[16px] font-medium text-ink outline-none placeholder:text-ink-2 [&:focus-visible]:outline-none"
              data-testid="signin-email-input"
            />
          </label>
          {errorLine || <p className="text-[13px] leading-5 text-ink-2">{t('account.emailNext')}</p>}
          <Primary busy={busy} testId="signin-continue">{t('account.continue')}</Primary>
        </form>
      )}
      {emailOn && google && (
        <div className="flex items-center gap-3 text-[12px] text-ink-2" aria-hidden="true">
          <span className="lg-sep h-px flex-1" />
          {t('account.or')}
          <span className="lg-sep h-px flex-1" />
        </div>
      )}
      {google && (
        // Google's dark theme (glass.css .google-btn): standard "G" unmodified, 12 px before it, 10 px after, 12 px after the text.
        <button type="button" onClick={() => void continueWithGoogle(tk(t))} disabled={busy} className="hit google-btn flex h-12 w-full items-center justify-center rounded-full pr-3 pl-3 text-[15px] font-medium" data-testid="signin-google">
          <GoogleLogo width={20} height={20} className="mr-2.5 shrink-0" />
          <span className="truncate">{t('account.google')}</span>
        </button>
      )}
      {!emailOn && errorLine}
    </div>
  );
}

const MENU_TRIGGER = '[data-testid=project-menu]';
const INPUT = '[data-testid=prompt]';

/**
 * Hosts the sheet. Desktop: a popover that grows out of the opening
 * control (a fixed stand-in at its box, since a menu row closes with its
 * menu) and flows back into the house name (menu) or that control.
 */
export function SignInHost({ phone }: { phone?: boolean }) {
  const t = useT();
  const open = useAccount((s) => s.open);
  const origin = useAccount((s) => s.origin);
  const from = useAccount((s) => s.anchor);
  const [shown, setShown] = useState(open);
  const ghost = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (open) {
      setShown(true);
      setRect(from?.isConnected ? from.getBoundingClientRect() : null);
    }
  }, [open, from]);
  // A press outside the panel closes it (desktop).
  useEffect(() => {
    if (!open || phone) return;
    const down = (e: PointerEvent) => {
      if (panel.current?.contains(e.target as Node)) return;
      if (useAccount.getState().busy) return;
      closeSignIn();
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [open, phone]);
  const anchor = () => {
    if (open) return ghost.current;
    if (origin === 'menu') return document.querySelector<HTMLElement>(MENU_TRIGGER);
    // Back into the input (where the draft waits), or the control if it is still there.
    return from?.isConnected ? from : document.querySelector<HTMLElement>(INPUT) ?? ghost.current;
  };
  if (!shown) return null;
  const onClosed = () => {
    setShown(false);
    if (origin === 'menu') document.querySelector<HTMLElement>(MENU_TRIGGER)?.focus({ preventScroll: true });
    // Desktop: back to the draft (on a phone this would raise the keyboard).
    else if (!phone) document.querySelector<HTMLElement>('[data-testid=prompt-bar]')?.focus({ preventScroll: true });
  };

  if (phone) {
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    return (
      <>
        <div className={cx('pointer-events-auto absolute inset-0 z-40 bg-black/10 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')} onClick={closeSignIn} aria-hidden="true" />
        <GlassSheet
          open={open}
          large={Math.round(vh * 0.92)}
          onClose={closeSignIn}
          onClosed={onClosed}
          ariaLabel={t('account.title')}
          testId="signin-sheet"
          className="z-50"
          style={{ left: 8, right: 8, bottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="signin-title">
            <SignInBody phone />
          </div>
        </GlassSheet>
      </>
    );
  }
  const width = 380;
  return (
    <>
      {rect && <div ref={ghost} className="pointer-events-none fixed" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} aria-hidden="true" />}
      <GlassPopover
        ref={panel}
        open={open}
        anchor={anchor}
        kind="text"
        onClosed={onClosed}
        ariaRole="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        className="absolute z-50"
        style={origin === 'menu' ? { top: 74, left: 24, width } : { bottom: 96, left: `calc(50% - ${width / 2}px)`, width }}
        data-testid="signin-sheet"
      >
        <SignInBody />
      </GlassPopover>
    </>
  );
}
