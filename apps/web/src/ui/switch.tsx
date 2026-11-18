// Switch: on / off (the track fills with the glass ink).
import { type ButtonHTMLAttributes } from 'react';
import { cx } from './surface';

/**
 * An on / off switch inside a panel (HIG toggles; task 028's "anyone with
 * the link can view"): a track that fills with the glass ink when on and a
 * knob that slides across. No accent colour (the one bold colour is kept
 * for the sun, play, send and the working glow). Name it with `label`, or
 * with a <label htmlFor> on the row it sits in.
 */
export function Switch({ checked, onChange, label, className, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & { checked: boolean; onChange: (on: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx('hit lg-switch', className)} {...rest}>
      <span className="lg-switch-knob" aria-hidden="true" />
    </button>
  );
}
