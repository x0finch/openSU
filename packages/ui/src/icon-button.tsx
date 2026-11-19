// IconButton: a round icon button inside glass, on the module plate.
import { type ButtonHTMLAttributes } from 'react';
import { cx } from './surface';
import { Tooltip } from './tooltip';

/**
 * A round icon button inside glass (a header's new conversation, a panel's
 * close): the module's plate, a circle of the row's height.
 */
export function IconButton({ label, size = 32, tip = true, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: number; tip?: boolean }) {
  const btn = (
    <button type="button" aria-label={label} className={cx('hit lg-plate grid shrink-0 place-items-center text-ink-2 hover:text-ink', className)} style={{ width: size, height: size }} {...rest}>
      {children}
    </button>
  );
  return tip ? <Tooltip label={label}>{btn}</Tooltip> : btn;
}
