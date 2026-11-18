// Spinner: a small ring that turns (a busy button, a loading line).
import { cx } from './surface';

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <span className={cx('inline-block shrink-0 animate-[lg-spin_0.8s_linear_infinite] rounded-full border-2 border-current border-t-transparent', className)} style={{ width: size, height: size }} aria-hidden="true" />;
}
