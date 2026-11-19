// Field and Input: a text field inside glass (a quiet well with a hairline
// that brightens on focus; the caret is the accent), on Base UI's Field and
// Input (task 031): `Field` gives its label and hint to the input inside it.
import { Field as BaseField } from '@base-ui/react/field';
import { Input as BaseInput } from '@base-ui/react/input';
import { OTPField as BaseOTP } from '@base-ui/react/otp-field';
import type { HTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './surface';

export function Input({ size = 'md', mono, className, icon, ref, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: 'sm' | 'md' | 'lg'; mono?: boolean; icon?: ReactNode; ref?: Ref<HTMLInputElement> }) {
  return (
    <label className={cx('lg-field flex min-w-0 items-center gap-2', size === 'lg' ? 'h-12 px-4' : size === 'md' ? 'h-11 px-3.5' : 'h-10 px-3', className)}>
      {icon}
      <BaseInput
        ref={ref}
        {...(rest as object)}
        className={cx('h-full w-full min-w-0 truncate bg-transparent font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-2 [&:focus-visible]:outline-none', mono && 'tnum', size === 'lg' ? 'text-[16px]' : size === 'md' ? 'text-[14px]' : 'text-[13.5px]')}
      />
    </label>
  );
}

/**
 * A one-time code in boxes (iOS's verification-code entry), on Base UI's OTP Field: typing, paste, the keyboard's
 * one-time-code suggestion, backspace and arrows are Base UI's. `label(n)`: the field's name (0) and each box's (n).
 */
export function CodeField({ length = 6, value, onValueChange, onComplete, disabled, label, className, rowRef, ...rest }: { length?: number; value: string; onValueChange: (v: string) => void; onComplete: (v: string) => void; disabled?: boolean; label: (n: number) => string; className?: string; rowRef?: Ref<HTMLDivElement> } & Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'>) {
  return (
    <BaseOTP.Root
      ref={rowRef}
      length={length}
      value={value}
      onValueChange={(v) => onValueChange(v)}
      onValueComplete={(v) => onComplete(v)}
      disabled={disabled}
      validationType="numeric"
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-label={label(0)}
      className={cx('flex justify-between gap-2', className)}
      {...(rest as object)}
    >
      {Array.from({ length }, (_, i) => (
        <BaseOTP.Input key={i} aria-label={label(i + 1)} data-testid={`otp-${i}`} className="lg-field lg-code tnum h-14 w-0 min-w-0 flex-1 text-center text-[24px] font-semibold text-ink outline-none disabled:opacity-50 [&:focus-visible]:outline-none" />
      ))}
    </BaseOTP.Root>
  );
}

/** A labelled field: the label above, the input (an `Input` inside), an optional hint under it. */
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <BaseField.Root className="block" data-slot="field">
      <BaseField.Label className="mb-1.5 block text-[12px] font-medium text-ink-2">{label}</BaseField.Label>
      {children}
      {hint && <BaseField.Description className="mt-1.5 block text-[12px] leading-4 text-ink-2">{hint}</BaseField.Description>}
    </BaseField.Root>
  );
}

