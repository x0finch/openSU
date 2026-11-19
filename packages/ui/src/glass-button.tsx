// The glass capsule button (internal): `Button variant="glass"` renders it.
import { type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cx, Glass } from './surface';
import { Tooltip } from './tooltip';

/** A standalone glass button: circular (icon) or a capsule (icon and label). `tip`: its label as the module's tooltip. */
export function GlassButton({ icon, children, label, size = 48, accent, tip, className, glassClassName, ref, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; label?: string; size?: number; accent?: boolean; tip?: boolean; glassClassName?: string; group?: number; ref?: Ref<HTMLButtonElement> }) {
  const round = !children;
  if (tip && label) return <Tooltip label={label}><GlassButton icon={icon} label={label} size={size} accent={accent} className={className} glassClassName={glassClassName} ref={ref} {...rest}>{children}</GlassButton></Tooltip>;
  return (
    <Glass press className={cx('pointer-events-auto inline-flex', glassClassName)} style={{ height: size, minWidth: size }}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cx('hit lg-focus inline-flex h-full flex-1 items-center justify-center gap-2 rounded-full text-[14px] font-medium whitespace-nowrap', round ? 'w-full' : 'px-4', accent && 'text-on-accent', className)}
        {...rest}
      >
        {icon}
        {children}
      </button>
    </Glass>
  );
}

