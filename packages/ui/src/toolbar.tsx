// Toolbar: one glass capsule of tool buttons (an icon in a fixed slot, its name as a tooltip, the value of a tool in use).
import { Toolbar } from '@base-ui/react/toolbar';
import { type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cx, Glass } from './surface';
import { Tooltip } from './tooltip';

/** One capsule holding several icon buttons (a toolbar group): Base UI's Toolbar (one tab stop, arrows move along). */
export function ToolbarGroup({ label, className, children, testId, ref }: { label: string; className?: string; children: ReactNode; testId?: string; ref?: Ref<HTMLElement> }) {
  return (
    <Toolbar.Root
      aria-label={label}
      loopFocus
      render={(props) => {
        const { role: _role, ref: inner, ...rest } = props as typeof props & { role?: string; ref?: Ref<HTMLElement> };
        return (
          <Glass
            {...rest}
            ref={(el: HTMLElement | null) => {
              for (const r of [inner, ref]) {
                if (typeof r === 'function') r(el);
                else if (r) (r as { current: HTMLElement | null }).current = el;
              }
            }}
            ariaRole="toolbar"
            press
            className={cx('pointer-events-auto flex h-12 items-center gap-0.5 px-1.5', className)}
            data-testid={testId}
          />
        );
      }}
    >
      {children}
    </Toolbar.Root>
  );
}

/**
 * A tool inside a group: an icon in a fixed slot, its name as a tooltip
 * below on hover (nothing changes width, nothing moves). A tool in use
 * shows its value in the icon's place (e.g. the sun time). `named`: the
 * name beside the icon (first visit, until the first use). `text`: the
 * button reads as text only (walking: "漫游 ×"). `on`: selected (a plate).
 */
export function ToolbarButton({ icon, label, reading: value, named, text, on, className, ref, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; label: string; reading?: string | null; named?: boolean; text?: string; on?: boolean; ref?: Ref<HTMLButtonElement> }) {
  const btn = (
    <Toolbar.Button
      ref={ref}
      type="button"
      aria-label={value ? `${label}: ${value}` : label}
      data-on={on ? '' : undefined}
      className={cx('lg-plate tnum inline-flex h-9 items-center justify-center gap-1.5 text-[13px] font-semibold whitespace-nowrap', named || text ? 'min-w-11 px-3' : 'w-11', className)}
      {...rest}
    >
      {text ? <span>{text}</span> : value ? <span className="max-w-[42px] truncate tracking-[-0.01em]">{value}</span> : icon}
      {named && !text && <span className="font-medium">{label}</span>}
    </Toolbar.Button>
  );
  return named || text ? btn : <Tooltip label={value ? `${label} ${value}` : label}>{btn}</Tooltip>;
}
