// Tooltip: the one tooltip, on Base UI's Tooltip (task 031).
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { type ReactElement, type ReactNode } from 'react';
import { usePortalHost } from './surface';

/**
 * Focus that the code moves (a surface closing gives focus back to its
 * button) shows no tooltip; only focus that came from Tab or an arrow key
 * does (task 026). Base UI opens a tooltip on any `:focus-visible` focus,
 * which includes focus moved by code after a key press (Escape), so the
 * package keeps this one check of the last navigation key.
 */
let navKeyAt = -1e9;
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) navKeyAt = performance.now();
  }, true);
}

/** One delay for every tooltip; moving from one to the next shows it at once (Base UI's group timeout). */
export const TOOLTIP_DELAY = 350;

/**
 * The one tooltip (task 025): the name of a control, below it, after one
 * delay, on its own plate and ink (readable on paper, on glass and inside
 * dark panels: it never takes the panel's ink). Visual only: the control
 * keeps its own accessible name. No tooltip shows for a control whose own
 * surface is open, nor for the tools of a toolbar while one of its panels
 * is open (it would lie under the panel). `children`: one element that
 * takes props and a ref (a button).
 */
export function Tooltip({ label, children, side = 'bottom' }: { label: ReactNode; children: ReactElement; side?: 'top' | 'bottom' }) {
  const host = usePortalHost();
  return (
    <BaseTooltip.Root
      onOpenChange={(open, details) => {
        if (!open) return;
        if (details.reason === 'trigger-focus' && performance.now() - navKeyAt > 400) return details.cancel();
        const t = details.trigger as HTMLElement | undefined;
        const own = !!t && (t.matches('[aria-expanded=true], [data-on]') || !!t.querySelector('[aria-expanded=true], [data-on]'));
        const bar = t?.closest('[role=toolbar]');
        if (own || bar?.querySelector('[aria-expanded=true]')) details.cancel();
      }}
    >
      <BaseTooltip.Trigger delay={TOOLTIP_DELAY} render={children} />
      <BaseTooltip.Portal container={host ?? undefined}>
        <BaseTooltip.Positioner side={side} sideOffset={10} collisionPadding={8} positionMethod="fixed" className="z-[60]">
          <BaseTooltip.Popup className="lg-tip" aria-hidden="true">
            {label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
