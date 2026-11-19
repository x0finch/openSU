// Toast: a small capsule above the input that leaves by itself.
import type { ReactNode } from 'react';
import { cx, Glass, type GlassProps } from './surface';

/** A small capsule above the input that disappears by itself (the caller times it); `action`: a button at its end, concentric with it. */
export function Toast({ children, action, className, ...rest }: Omit<GlassProps, 'kind'> & { action?: ReactNode }) {
  return (
    <Glass ariaRole="status" className={cx('pointer-events-auto inline-flex h-10 items-center text-[13px] font-medium', action ? 'gap-3 pr-1.5 pl-4' : 'px-4', className)} {...rest}>
      {children}
      {action}
    </Glass>
  );
}

