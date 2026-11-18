// Field and Input: a text field inside glass (a quiet well with a hairline
// that brightens on focus; the caret is yellow). `Field` adds a label above
// and a hint under it.
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './surface';

export function Input({ size = 'md', mono, className, icon, ref, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: 'sm' | 'md' | 'lg'; mono?: boolean; icon?: ReactNode; ref?: Ref<HTMLInputElement> }) {
  return (
    <label className={cx('lg-field flex min-w-0 items-center gap-2', size === 'lg' ? 'h-12 px-4' : size === 'md' ? 'h-11 px-3.5' : 'h-10 px-3', className)}>
      {icon}
      <input
        ref={ref}
        {...rest}
        className={cx('h-full w-full min-w-0 truncate bg-transparent font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-2 [&:focus-visible]:outline-none', mono && 'tnum', size === 'lg' ? 'text-[16px]' : size === 'md' ? 'text-[14px]' : 'text-[13.5px]')}
      />
    </label>
  );
}

/** The six boxes of a sign-in code: one per digit. */
export function CodeInput({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...rest} className={cx('lg-field lg-code tnum h-14 w-0 min-w-0 flex-1 text-center text-[24px] font-semibold text-ink outline-none disabled:opacity-50 [&:focus-visible]:outline-none', className)} />;
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] leading-4 text-ink-2">{hint}</span>}
    </div>
  );
}

/** A name typed in place on paper (the house name in the studio, a card's name on /projects). */
export function NameInput({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...rest} className={cx('min-w-0 rounded-[8px] bg-page px-1.5 font-semibold outline outline-1 outline-ink-3 focus:outline-2 focus:outline-ink', className)} />;
}
