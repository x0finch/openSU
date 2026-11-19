// Field and Input: a text field inside glass (a quiet well with a hairline
// that brightens on focus; the caret is the accent), on Base UI's Field and
// Input (task 031): `Field` gives its label and hint to the input inside it.
import { Field as BaseField } from '@base-ui/react/field';
import { Input as BaseInput } from '@base-ui/react/input';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
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

/** The six boxes of a sign-in code: one per digit. */
export function CodeInput({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <BaseInput ref={ref} {...(rest as object)} className={cx('lg-field lg-code tnum h-14 w-0 min-w-0 flex-1 text-center text-[24px] font-semibold text-ink outline-none disabled:opacity-50 [&:focus-visible]:outline-none', className)} />;
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

