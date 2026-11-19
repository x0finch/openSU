// Separator: an inset hairline between rows or groups (never a box), on Base UI's Separator.
import { Separator as BaseSeparator } from '@base-ui/react/separator';
import { cx } from './surface';

/** An inset hairline between rows or groups of a panel. */
export function Separator({ className }: { className?: string }) {
  return <BaseSeparator className={cx('lg-sep mx-3 my-1', className)} data-slot="separator" />;
}
