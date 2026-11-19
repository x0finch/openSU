// Tooltip: the one tooltip (task 025), on Base UI's Tooltip (task 031). Its Base UI tree is in tooltip-base.tsx and
// loads when the page is idle (task 032: the first paint does not need it); until then a control shows no tooltip.
import { type ComponentType, type ReactElement, type ReactNode, useEffect, useSyncExternalStore } from 'react';

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
export const lastNavKey = (): number => navKeyAt;

/** One delay for every tooltip; moving from one to the next shows it at once (Base UI's group timeout). */
export const TOOLTIP_DELAY = 350;

export type TooltipProps = { label: ReactNode; children: ReactElement; side?: 'top' | 'bottom' };

let Impl: ComponentType<TooltipProps> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Fetches the tooltip's Base UI tree (the glass layer calls it when the page is idle). */
export function preloadTooltip(): Promise<void> {
  loading ??= import('./tooltip-base').then((m) => {
    Impl = m.default;
    for (const f of listeners) f();
  });
  return loading;
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

/**
 * The one tooltip (task 025): the name of a control, below it, after one
 * delay, on its own plate and ink (readable on paper, on glass and inside
 * dark panels: it never takes the panel's ink). Visual only: the control
 * keeps its own accessible name. No tooltip shows for a control whose own
 * surface is open, nor for the tools of a toolbar while one of its panels
 * is open (it would lie under the panel). `children`: one element that
 * takes props and a ref (a button).
 */
export function Tooltip(props: TooltipProps) {
  const ready = useSyncExternalStore(subscribe, () => Impl !== null, () => false);
  // Pages outside the glass layer (which preloads it when idle) fetch it once something with a tooltip is shown.
  useEffect(() => void (ready || preloadTooltip()), [ready]);
  if (!ready || !Impl) return props.children;
  return <Impl {...props} />;
}
