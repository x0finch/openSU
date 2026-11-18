// Menu: pop-up menus (rows of one height and inset, touch scrubbing), MenuItem, MenuLabel (an identity header row), MenuSeparator.
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef } from 'react';
import { place } from './anchor';
import { cx, useMergedRef } from './surface';
import { type AnchoredProps, AnchoredSurface } from './anchored';

/**
 * Touch scrubbing (2b.3): while a finger is down (also the press that
 * opened the menu), the row under it is highlighted; lifting the finger on
 * a row after moving selects it.
 */
function useMenuScrub(open: boolean, menu: { current: HTMLElement | null }): void {
  useEffect(() => {
    if (!open) return;
    let active: number | null = null;
    let start = { x: 0, y: 0 };
    let moved = false;
    let lit: HTMLElement | null = null;
    const light = (el: HTMLElement | null) => {
      if (lit === el) return;
      lit?.removeAttribute('data-scrub');
      lit = el;
      lit?.setAttribute('data-scrub', '');
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      active = e.pointerId;
      start = { x: e.clientX, y: e.clientY };
      moved = false;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (active === null) {
        // The press that opened the menu is still down: adopt it.
        active = e.pointerId;
        start = { x: e.clientX, y: e.clientY };
      }
      if (e.pointerId !== active) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) moved = true;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const hit = under?.closest<HTMLElement>('[role=menuitem]') ?? null;
      // Over a gap between rows (a separator) the last row stays lit; outside the menu nothing is.
      if (hit && menu.current?.contains(hit)) light(hit);
      else if (!under || !menu.current?.contains(under)) light(null);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = null;
      const hit = lit;
      light(null);
      if (moved && hit) {
        e.preventDefault();
        hit.click();
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      light(null);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, [open, menu]);
}

/** A menu: a popover with menu semantics; rows separated by inset hairlines; touch scrubbing. */
export function Menu({ label, children, ref, ...rest }: AnchoredProps & { label: string }) {
  const el = useRef<HTMLElement | null>(null);
  const merged = useMergedRef(el, ref);
  useMenuScrub(rest.open, el);
  return (
    <AnchoredSurface ref={merged} ariaRole="menu" aria-label={label} kind="text" radius={22} {...rest} className={cx('touch-none', rest.className)}>
      <div className="flex flex-col p-1.5">{children}</div>
    </AnchoredSurface>
  );
}

export function MenuItem({ children, icon, detail, danger, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; detail?: ReactNode; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={cx('lg-plate flex h-10 w-full items-center gap-2.5 rounded-[16px] px-3 text-left text-[14px] font-medium focus-visible:bg-[var(--lg-row-active)] focus-visible:outline-none', danger && 'text-danger', className)} {...rest}>
      {icon && <span className="grid size-5 shrink-0 place-items-center text-ink-2">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detail !== undefined && <span className="max-w-[52%] shrink-0 truncate text-[13px] font-normal text-ink-2">{detail}</span>}
    </button>
  );
}

/**
 * A row that is not a choice: who is signed in (the account menu's head),
 * a menu's status line, an allowance. `title` over an optional `sub` line,
 * or a label and its value (`detail`).
 */
export function MenuLabel({ title, sub, detail, small, testId, subTestId, flag }: { title?: ReactNode; sub?: ReactNode; detail?: ReactNode; small?: ReactNode; testId?: string; subTestId?: string; flag?: string }) {
  if (small !== undefined) return <p className="px-3 pt-1 pb-1.5 text-[12px] leading-4 text-ink-2" data-testid={testId} data-failed={flag}>{small}</p>;
  if (detail !== undefined) {
    return (
      <div className="flex h-10 items-center gap-2.5 px-3 text-[14px] font-medium" data-testid={testId}>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="tnum shrink-0 text-[13px] font-normal text-ink-2">{detail}</span>
      </div>
    );
  }
  return (
    <div className="flex min-h-12 flex-col justify-center px-3 py-1.5" data-testid={testId}>
      <span className="truncate text-[14px] leading-5 font-semibold">{title}</span>
      {sub && <span className="truncate text-[12.5px] leading-[18px] text-ink-2" data-testid={subTestId}>{sub}</span>}
    </div>
  );
}

/** The hairline between groups of rows. */
export { Separator as MenuSeparator } from './separator';
