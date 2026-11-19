// Skeleton: a quiet bar standing in for text that is still loading.
import { cx } from './surface';

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx('inline-block rounded-sm bg-wash', className)} aria-hidden="true" />;
}
