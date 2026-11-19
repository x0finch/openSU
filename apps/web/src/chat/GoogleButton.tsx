// "Continue with Google" (task 019; moved out of the base in task 031: it
// carries Google's brand rules, which no other app would use unchanged).
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@opensu/ui';

/**
 * "Continue with Google": Google's own button (its brand rules: the
 * standard "G" unmodified, 12 px before it, 10 px after, 12 px after the
 * text; its dark theme, styles.css `.google-btn`). The logo comes from the
 * caller's icon set.
 */
export function GoogleButton({ label, logo, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; logo: ReactNode }) {
  return (
    <button type="button" {...rest} className={cx('hit google-btn flex h-12 w-full items-center justify-center rounded-full pr-3 pl-3 text-[15px] font-medium', className)}>
      <span className="mr-2.5 inline-flex shrink-0">{logo}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
