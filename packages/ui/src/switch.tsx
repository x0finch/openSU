// Switch: on / off (the track fills with the glass ink), on Base UI's Switch.
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { cx } from './surface';

/**
 * An on / off switch inside a panel (HIG toggles; task 028's "anyone with
 * the link can view"): a track that fills with the glass ink when on and a
 * knob that slides across. No accent colour (the one bold colour is kept
 * for the sun, play, send and the working glow). Name it with `label`, or
 * with a <label htmlFor={id}> on the row it sits in.
 */
export function Switch({ checked, onChange, label, className, disabled, id, ...rest }: { checked: boolean; onChange: (on: boolean) => void; label?: string; className?: string; disabled?: boolean; id?: string } & Record<`data-${string}`, string | undefined>) {
  return (
    <BaseSwitch.Root
      nativeButton
      render={<button type="button" id={id} />}
      checked={checked}
      onCheckedChange={(on) => onChange(on)}
      disabled={disabled}
      aria-label={label}
      className={cx('hit lg-switch', className)}
      {...rest}
    >
      <BaseSwitch.Thumb className="lg-switch-knob" />
    </BaseSwitch.Root>
  );
}
