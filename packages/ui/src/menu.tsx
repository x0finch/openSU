// Menu: pop-up menus on Base UI's Menu (task 031): Menu, MenuItem,
// MenuLabel (an identity header row, a status line, an allowance),
// MenuSeparator. Base UI places it at the module gap from its anchor,
// moves focus and the highlight with the arrow keys, and closes it on
// Escape, a press outside or focus leaving; rows of one height and inset;
// touch scrubbing is ours (a finger slides across the rows and lifts on one).
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { type ButtonHTMLAttributes, type CSSProperties, type KeyboardEventHandler, type ReactNode, type Ref, useEffect, useRef } from 'react';
import { anchorBox, FLOATING, type Placement, sideAlign } from './floating';
import { GLASS } from './material';
import { cx, Glass, usePortalHost } from './surface';
import { type Box, useFloatingBox } from './use-floating-box';

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

export interface MenuProps {
  open: boolean;
  /** The control it stands at. */
  anchor: () => HTMLElement | null;
  /** Base UI asks to close it (Escape, a press outside, focus leaving it); `viaKey`: by the keyboard (focus goes back to the anchor). */
  onClose: (viaKey: boolean) => void;
  /** Its accessible name. */
  label: string;
  placement?: Placement;
  /** It has left (after its closing motion). */
  onClosed?: () => void;
  /** Its box while open (viewport px), null when closed. */
  onBox?: (b: Box | null) => void;
  style?: Pick<CSSProperties, 'width' | 'minWidth' | 'maxWidth' | 'maxHeight'>;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  /** Where focus goes when it closes (Base UI's `finalFocus`; default: back where it was). */
  finalFocus?: BaseMenu.Popup.Props['finalFocus'];
  testId?: string;
  ref?: Ref<HTMLElement | null>;
  children: ReactNode;
}

/** A menu: rows separated by inset hairlines; touch scrubbing. */
export function Menu({ open, anchor, onClose, label, placement = 'below-start', onClosed, onBox, style, className, onKeyDown, finalFocus, testId, ref, children }: MenuProps) {
  const el = useRef<HTMLElement | null>(null);
  const host = usePortalHost();
  useMenuScrub(open, el);
  const boxRef = useFloatingBox(open, anchor, true, onBox);
  const { side, align } = sideAlign(placement);
  // A menu opened from inside a text surface (the pinned conversation) stays within it when it fits.
  const within = () => {
    const a = anchor();
    const s = a?.closest<HTMLElement>('.lg[data-kind=text]');
    return s && s !== a ? s : undefined;
  };
  const boundary = within();
  return (
    <BaseMenu.Root
      open={open}
      modal={false}
      onOpenChange={(next, details) => {
        if (next) return;
        const target = (details.event as Event | undefined)?.target as Node | null | undefined;
        // The anchor toggles its menu itself.
        if (details.reason === 'outside-press' && target && anchor()?.contains(target)) return details.cancel();
        onClose(details.reason === 'escape-key');
      }}
      onOpenChangeComplete={(o) => {
        if (!o) onClosed?.();
      }}
    >
      <BaseMenu.Portal container={host ?? undefined}>
        <BaseMenu.Positioner ref={boxRef} anchor={anchorBox(anchor)} side={side} align={align} {...FLOATING} collisionBoundary={boundary ?? 'clipping-ancestors'} className="z-50">
          <BaseMenu.Popup
            finalFocus={finalFocus}
            render={(props, state) => {
              const { style: s, className: c, ...rest } = props;
              return (
                <Glass
                  {...rest}
                  ref={(node: HTMLElement | null) => {
                    el.current = node;
                    if (node) (node as HTMLElement & { __anchor?: () => HTMLElement | null }).__anchor = anchor;
                    if (typeof ref === 'function') ref(node);
                    else if (ref) (ref as { current: HTMLElement | null }).current = node;
                    const r = (props as { ref?: Ref<HTMLElement> }).ref;
                    if (typeof r === 'function') r(node);
                    else if (r) (r as { current: HTMLElement | null }).current = node;
                  }}
                  kind="text"
                  radius={GLASS.radiusMenu}
                  layer={1}
                  ariaRole="menu"
                  aria-label={label}
                  inert={!state.open || undefined}
                  onKeyDown={(e) => {
                    rest.onKeyDown?.(e as never);
                    onKeyDown?.(e);
                  }}
                  className={cx('lg-pop pointer-events-auto touch-none overflow-y-auto overscroll-contain outline-none', c, className)}
                  style={{ ...s, maxHeight: 'var(--available-height)', ...style }}
                  data-testid={testId}
                  data-anchored=""
                  data-placement={placement}
                />
              );
            }}
          >
            <div className="flex flex-col p-1.5">{children}</div>
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

/** A row of a menu (a native button; Base UI moves the highlight and focus). It does not close the menu: the caller does when the row acts. */
export function MenuItem({ children, icon, detail, danger, className, onClick, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; detail?: ReactNode; danger?: boolean }) {
  return (
    <BaseMenu.Item
      {...(rest as object)}
      nativeButton
      closeOnClick={false}
      disabled={disabled}
      onClick={onClick as never}
      render={<button type="button" />}
      className={cx('lg-plate flex h-10 w-full items-center gap-2.5 rounded-[16px] px-3 text-left text-[14px] font-medium focus-visible:outline-none data-[highlighted]:bg-[var(--lg-row-active)]', danger && 'text-danger', className)}
    >
      {icon && <span className="grid size-5 shrink-0 place-items-center text-ink-2">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detail !== undefined && <span className="max-w-[52%] shrink-0 truncate text-[13px] font-normal text-ink-2">{detail}</span>}
    </BaseMenu.Item>
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
export function MenuSeparator({ className }: { className?: string }) {
  return <BaseMenu.Separator className={cx('lg-sep mx-3 my-1', className)} />;
}
