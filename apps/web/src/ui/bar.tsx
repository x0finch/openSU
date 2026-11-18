// Bar: a glass capsule holding a row of content (the gallery's status and
// downloads, the walk pill held sideways). Its insets follow what stands
// at each end: text sits further in than a round control, which stays
// concentric with the capsule's end.
import type { ReactNode } from 'react';
import { cx, Glass } from './surface';

export function Bar({ start = 'control', end = 'control', label, role, className, children, testId }: { start?: 'text' | 'control'; end?: 'text' | 'control'; label?: string; role?: string; className?: string; children: ReactNode; testId?: string }) {
  return (
    <Glass ariaRole={role} aria-label={label} className={cx('pointer-events-auto flex h-12 items-center gap-1', start === 'text' ? 'pl-5' : 'pl-1.5', end === 'text' ? 'pr-4' : 'pr-1.5', className)} data-testid={testId}>
      {children}
    </Glass>
  );
}
