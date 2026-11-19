// The Menu's Base UI tree (task 031), loaded with the first open (menu.tsx):
// Menu.Root, Portal, Positioner, Popup, and the Item and Separator parts
// the rows use; touch scrubbing.
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { type Ref, useEffect, useRef, useState } from 'react';
import { anchorBox, FLOATING, sideAlign } from './floating';
import { GLASS } from './material';
import type { MenuProps } from './menu';
import { MenuParts } from './parts-context';
import { cx, Glass, usePortalHost } from './surface';
import { useFloatingBox } from './use-floating-box';

const parts = { Item: BaseMenu.Item, Separator: BaseMenu.Separator };

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

export default function MenuBase({ open, anchor, onClose, label, placement = 'below-start', onClosed, onBox, style, className, onKeyDown, finalFocus, testId, ref, children }: MenuProps) {
  // Base UI does not animate a Root that mounts already open; these mount when they first open (lazily, or per
  // panel), so the first render is closed and the surface opens right after, through its starting style.
  const [entered, setEntered] = useState(false);
  useEffect(() => setEntered(true), []);
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
      open={open && entered}
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
                  data-slot="menu-content"
                  data-anchored=""
                  data-placement={placement}
                />
              );
            }}
          >
            <MenuParts.Provider value={parts}>
              <div className="flex flex-col p-1.5">{children}</div>
            </MenuParts.Provider>
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
