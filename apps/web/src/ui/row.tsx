// Row: a full-width tappable row inside a panel.
import { type ButtonHTMLAttributes } from 'react';
import { cx } from './surface';
import { Separator } from './separator';

/** A row inside a panel: label, value, optional action. Rows are separated by Separator. */
export function Row({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx('lg-plate flex min-h-11 w-full items-center gap-2.5 rounded-[14px] px-3 text-left text-[14.5px] font-medium', className)} {...rest}>
      {children}
    </button>
  );
}
