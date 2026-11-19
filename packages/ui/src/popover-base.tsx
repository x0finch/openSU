// The desktop Popover's Base UI tree (task 031), loaded with the first open
// (popover.tsx): Popover.Root, Portal, Positioner, Popup, and the Close part
// the header's close button becomes.
import { Popover as BasePopover } from '@base-ui/react/popover';
import { type Ref, useEffect, useState } from 'react';
import { anchorBox, FLOATING, sideAlign } from './floating';
import { GLASS } from './material';
import { PopoverParts } from './parts-context';
import type { PopoverProps } from './popover';
import { cx, Glass, usePortalHost } from './surface';
import { useFloatingBox } from './use-floating-box';

const parts = { Close: BasePopover.Close };

export default function PopoverBase({ open, anchor, placement = 'below-start', size = 'dialog', maxHeight, onClose, onClosed, onBox, role = 'dialog', closeOnOutsidePress = true, initialFocus, finalFocus, labelledBy, label, id, testId, ref, children }: PopoverProps) {
  // Base UI does not animate a Root that mounts already open; these mount when they first open (lazily, or per
  // panel), so the first render is closed and the surface opens right after, through its starting style.
  const [entered, setEntered] = useState(false);
  useEffect(() => setEntered(true), []);
  const host = usePortalHost();
  const boxRef = useFloatingBox(open, anchor, false, onBox);
  const { side, align } = sideAlign(placement);
  return (
    <BasePopover.Root
      open={open && entered}
      modal={role === 'dialog' ? 'trap-focus' : false}
      onOpenChange={(next, details) => {
        if (next) return;
        const target = (details.event as Event | undefined)?.target as Node | null | undefined;
        // The anchor toggles its surface itself (a press on it is not a press outside).
        if (details.reason === 'outside-press' && target && anchor()?.contains(target)) return details.cancel();
        if (!closeOnOutsidePress && (details.reason === 'outside-press' || details.reason === 'focus-out')) return details.cancel();
        // The header's close button calls the header's own handler.
        if (details.reason === 'close-press') return;
        onClose(details.reason);
      }}
      onOpenChangeComplete={(o) => {
        if (!o) onClosed?.();
      }}
    >
      <BasePopover.Portal container={host ?? undefined}>
        <BasePopover.Positioner ref={boxRef} anchor={anchorBox(anchor)} side={side} align={align} {...FLOATING} className="z-50">
          <BasePopover.Popup
            initialFocus={initialFocus}
            finalFocus={finalFocus}
            render={(props, state) => {
              const { role: _role, style, className, ...rest } = props as typeof props & { role?: string };
              return (
                <Glass
                  {...rest}
                  ref={(el: HTMLElement | null) => {
                    if (el) (el as HTMLElement & { __anchor?: () => HTMLElement | null }).__anchor = anchor;
                    if (typeof ref === 'function') ref(el);
                    else if (ref) (ref as { current: HTMLElement | null }).current = el;
                    const r = (props as { ref?: Ref<HTMLElement> }).ref;
                    if (typeof r === 'function') r(el);
                    else if (r) (r as { current: HTMLElement | null }).current = el;
                  }}
                  kind="text"
                  radius={GLASS.radiusPanel}
                  ariaRole={role}
                  id={id}
                  aria-label={label}
                  aria-labelledby={labelledBy}
                  // Closed (still leaving): out of reach at once, without waiting for its last frames.
                  aria-modal={role === 'dialog' && state.open ? 'true' : undefined}
                  inert={!state.open || undefined}
                  className={cx('lg-pop pointer-events-auto flex flex-col overflow-y-auto overscroll-contain', className)}
                  style={{ ...style, width: GLASS.panelWidth[size], maxHeight: maxHeight ? `min(${maxHeight}, var(--available-height))` : 'var(--available-height)' }}
                  data-testid={testId}
                  data-slot="popover-content"
                  data-anchored=""
                  data-popover={size}
                  data-placement={placement}
                  data-panel={role === 'group' && state.open ? '' : undefined}
                />
              );
            }}
          >
            <PopoverParts.Provider value={parts}>
              <div className="lg-panel">{children}</div>
            </PopoverParts.Provider>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
