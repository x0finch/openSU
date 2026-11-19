// Separator: an inset hairline between rows or groups (never a box).
import { cx } from './surface';

/** An inset hairline between rows or groups of a panel. */
export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cx('lg-sep mx-3 my-1', className)} />;
}

