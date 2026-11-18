// Anchored surfaces (task 025): where a pop-up menu or a panel stands
// relative to the control it belongs to, and what it does to the glass
// under it. Everything that opens at an anchor is placed here and nowhere
// else (`GlassPopover` calls `place`).
//
// Placement follows Apple's pop-up menus: at the anchor, aligned to its
// leading edge (or the side the caller names), flipped to the other side
// or shifted along the anchor only to stay on screen, never further from
// the anchor than the module's gap. Inside a glass surface (the pinned
// conversation) a menu stays within that surface's width when it fits.
// One attachment (task 029): every surface floats at the module's gap from
// its anchor, toolbar panels included.
import { GLASS } from './material';
import type { Rect } from './registry';

export type Side = 'below' | 'above' | 'left' | 'right';
export type Align = 'start' | 'center' | 'end';
export type Placement = `${Side}-${Align}`;

export interface Placed {
  x: number;
  y: number;
  /** The room on the chosen side: the surface scrolls beyond it. */
  maxHeight: number;
  side: Side;
}

const flipOf: Record<Side, Side> = { below: 'above', above: 'below', left: 'right', right: 'left' };

/**
 * Where a surface of `size` stands at anchor `a` (viewport px). `within`:
 * the glass surface the anchor sits in; the surface stays inside its width
 * (or height, beside it) when it fits.
 */
export function place(a: Rect, size: { w: number; h: number }, placement: Placement, view: { w: number; h: number }, within?: Rect | null): Placed {
  const [side0, align] = placement.split('-') as [Side, Align];
  const gap = GLASS.anchorGap;
  const m = GLASS.screenInset;
  const room = (s: Side) =>
    s === 'below' ? view.h - m - (a.y + a.height + gap) : s === 'above' ? a.y - gap - m : s === 'right' ? view.w - m - (a.x + a.width + gap) : a.x - gap - m;
  const vertical = (s: Side) => s === 'below' || s === 'above';
  const need = (s: Side) => (vertical(s) ? size.h : size.w);
  // Flip only when the surface does not fit and the other side has more room.
  let side = side0;
  if (need(side) > room(side) && room(flipOf[side]) > room(side)) side = flipOf[side];
  const r = Math.max(0, room(side));
  const extent = Math.min(need(side), r);
  // The cross axis: aligned to the anchor, then shifted into the bounds.
  const along = (start: number, len: number, mine: number, lo: number, hi: number) => {
    let v = align === 'start' ? start : align === 'end' ? start + len - mine : start + len / 2 - mine / 2;
    if (mine <= hi - lo) v = Math.min(hi - mine, Math.max(lo, v));
    else v = lo;
    return v;
  };
  if (vertical(side)) {
    let lo: number = m, hi = view.w - m;
    if (within && size.w <= within.width) {
      lo = Math.max(lo, within.x);
      hi = Math.min(hi, within.x + within.width);
    }
    const x = along(a.x, a.width, size.w, lo, hi);
    const y = side === 'below' ? a.y + a.height + gap : a.y - gap - extent;
    return { x, y, maxHeight: r, side };
  }
  let lo: number = m, hi = view.h - m;
  if (within && size.h <= within.height) {
    lo = Math.max(lo, within.y);
    hi = Math.min(hi, within.y + within.height);
  }
  const y = along(a.y, a.height, Math.min(size.h, view.h - 2 * m), lo, hi);
  const x = side === 'right' ? a.x + a.width + gap : a.x - gap - Math.min(size.w, r);
  return { x, y, maxHeight: view.h - 2 * m, side };
}

interface Floating {
  rect: () => Rect | null;
  anchor: () => HTMLElement | null;
  menu: boolean;
}
const floating = new Map<number, Floating>();
const listeners = new Set<() => void>();
let nextId = 1;
const emit = () => listeners.forEach((f) => f());

/** An open floating surface (the popover registers itself while open). */
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
 * lies over `el` (the pinned conversation) makes it step aside (it fades
 * out and is inert) while it is open, unless it is a pop-up menu opened
 * from inside `el` (Apple's menus float over their own window). Nothing
 * else restyles what is under a surface.
 */
export function coveredBy(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  for (const f of floating.values()) {
    const a = f.anchor();
    if (f.menu && a && el.contains(a)) continue;
    const s = f.rect();
    if (!s) continue;
    if (s.x < r.right && s.x + s.width > r.left && s.y < r.bottom && s.y + s.height > r.top) return true;
  }
  return false;
}
