// Floating surfaces (task 031; placement itself is Base UI's): where a
// Popover or Menu stands is given as a `Placement`, turned here into Base
// UI's `side` and `align`; the anchor a surface measures from; and the one
// rule for what lies under an open surface (`coveredBy`).
import { GLASS } from './material';

export type Side = 'below' | 'above' | 'left' | 'right';
export type Align = 'start' | 'center' | 'end';
/** Side of the anchor and alignment along it (Base UI flips or shifts it only to stay on screen). */
export type Placement = `${Side}-${Align}`;

const SIDE = { below: 'bottom', above: 'top', left: 'left', right: 'right' } as const;

/** Base UI's side and align for a placement. */
export function sideAlign(p: Placement): { side: (typeof SIDE)[Side]; align: Align } {
  const [s, a] = p.split('-') as [Side, Align];
  return { side: SIDE[s], align: a };
}

/** A box the positioner measures (Floating UI's virtual element). */
export interface AnchorBox {
  getBoundingClientRect: () => DOMRect;
  contextElement?: Element;
}

/**
 * What a surface is placed against (task 029: every surface floats at the
 * module's gap from its control). A control inside a glass bar (a tool of
 * the toolbar, the key picker in the input) is measured from the bar's
 * edge, aligned with the control, so the surface (and its first frame,
 * which grows from this edge) never lies over the bar.
 */
export function anchorBox(get: () => HTMLElement | null): () => AnchorBox | HTMLElement | null {
  return () => {
    const a = get();
    if (!a || !a.isConnected) return null;
    const bar = a.closest<HTMLElement>('.lg[data-kind=control]');
    // Not in a bar: the element itself, so Base UI follows its size and position as they change.
    if (!bar || bar === a || bar.getBoundingClientRect().height > 64) return a;
    return {
      contextElement: a,
      getBoundingClientRect: () => {
        const r = a.getBoundingClientRect();
        const b = bar.getBoundingClientRect();
        return new DOMRect(r.left, b.top, r.width, b.height);
      },
    };
  };
}

/** The positioner's props every floating surface shares: the module's gap, the screen inset. */
export const FLOATING = { sideOffset: GLASS.anchorGap, collisionPadding: GLASS.screenInset, positionMethod: 'fixed' } as const;

interface Floating {
  rect: () => DOMRect | null;
  anchor: () => HTMLElement | null;
  menu: boolean;
}
const floating = new Map<number, Floating>();
const listeners = new Set<() => void>();
let nextId = 1;
const emit = () => listeners.forEach((f) => f());

/** An open floating surface (Popover and Menu register themselves while open). */
export function registerFloating(f: Floating): { update: () => void; remove: () => void } {
  const id = nextId++;
  floating.set(id, f);
  emit();
  return {
    update: emit,
    remove: () => {
      floating.delete(id);
      emit();
    },
  };
}

/** Some floating surface (a menu, a popover) is open. */
export const floatingOpen = (): boolean => floating.size > 0;

export function subscribeFloating(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The one rule for what lies under an open surface: a floating surface that
 * lies over `el` (a text surface) makes it step aside (it fades out and is
 * inert) while it is open, unless it is a pop-up menu opened from inside
 * `el` (Apple's menus float over their own window). Nothing else restyles
 * what is under a surface.
 */
export function coveredBy(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  for (const f of floating.values()) {
    const a = f.anchor();
    if (f.menu && a && el.contains(a)) continue;
    const s = f.rect();
    if (!s) continue;
    if (s.left < r.right && s.right > r.left && s.top < r.bottom && s.bottom > r.top) return true;
  }
  return false;
}
