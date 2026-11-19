// The tooltip's Base UI tree (task 031), loaded when the page is idle (task 032: not needed to draw a page).
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { usePortalHost } from './surface';
import { lastNavKey, TOOLTIP_DELAY, type TooltipProps } from './tooltip';

/**
 * The one tooltip (task 025): the name of a control, below it, after one
 * delay, on its own plate and ink (readable on paper, on glass and inside
 * dark panels: it never takes the panel's ink). Visual only: the control
 * keeps its own accessible name. No tooltip shows for a control whose own
 * surface is open, nor for the tools of a toolbar while one of its panels
 * is open (it would lie under the panel). `children`: one element that
 * takes props and a ref (a button).
 */
export default function TooltipBase({ label, children, side = 'bottom' }: TooltipProps) {
  const host = usePortalHost();
  return (
    <BaseTooltip.Root
      onOpenChange={(open, details) => {
        // Escape closes a tooltip and goes on to the studio's own rule (close a panel, leave walk mode): a tooltip
        // is not a surface that should take the key for itself (task 033).
        if (!open && details.reason === 'escape-key') details.allowPropagation();
        if (!open) return;
        if (details.reason === 'trigger-focus' && performance.now() - lastNavKey() > 400) return details.cancel();
        const t = details.trigger as HTMLElement | undefined;
        const own = !!t && (t.matches('[aria-expanded=true], [data-on]') || !!t.querySelector('[aria-expanded=true], [data-on]'));
        const bar = t?.closest('[role=toolbar]');
        if (own || bar?.querySelector('[aria-expanded=true]')) details.cancel();
      }}
    >
      <BaseTooltip.Trigger delay={TOOLTIP_DELAY} render={children} />
      <BaseTooltip.Portal container={host ?? undefined}>
        <BaseTooltip.Positioner side={side} sideOffset={10} collisionPadding={8} positionMethod="fixed" className="z-[60]">
          <BaseTooltip.Popup className="lg-tip" data-slot="tooltip-content" aria-hidden="true">
            {label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
