// Menu: pop-up menus on Base UI's Menu (task 031; its tree, menu-base.tsx,
// loads with the first open): Menu, MenuItem,
// MenuLabel (an identity header row, a status line, an allowance),
// MenuSeparator. Base UI places it at the module gap from its anchor,
// moves focus and the highlight with the arrow keys, and closes it on
// Escape, a press outside or focus leaving; rows of one height and inset;
// touch scrubbing is ours (a finger slides across the rows and lifts on one).
import type { Menu as BaseMenu } from '@base-ui/react/menu';
import { type ButtonHTMLAttributes, type CSSProperties, type KeyboardEventHandler, lazy, type ReactNode, type Ref, Suspense, useContext, useState } from 'react';
import { type Placement } from './floating';
import { MenuParts } from './parts-context';
import { cx } from './surface';
import { type Box } from './use-floating-box';

const MenuBase = lazy(() => import('./menu-base'));

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

/** A menu: rows separated by inset hairlines; touch scrubbing. Base UI's tree loads with the first open (menu-base.tsx). */
export function Menu(props: MenuProps) {
  const [used, setUsed] = useState(props.open);
  if (props.open && !used) setUsed(true);
  if (!used) return null;
  return (
    <Suspense fallback={null}>
      <MenuBase {...props} />
    </Suspense>
  );
}

/** A row of a menu (a native button; Base UI moves the highlight and focus). It does not close the menu: the caller does when the row acts. */
export function MenuItem({ children, icon, detail, danger, className, onClick, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; detail?: ReactNode; danger?: boolean }) {
  const parts = useContext(MenuParts);
  if (!parts) return null;
  return (
    <parts.Item
      {...(rest as object)}
      nativeButton
      closeOnClick={false}
      disabled={disabled}
      onClick={onClick as never}
      render={<button type="button" data-slot="menu-item" />}
      className={cx('lg-plate flex h-10 w-full items-center gap-2.5 rounded-[16px] px-3 text-left text-[14px] font-medium focus-visible:outline-none data-[highlighted]:bg-[var(--lg-row-active)]', danger && 'text-danger', className)}
    >
      {icon && <span className="grid size-5 shrink-0 place-items-center text-ink-2">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detail !== undefined && <span className="max-w-[52%] shrink-0 truncate text-[13px] font-normal text-ink-2">{detail}</span>}
    </parts.Item>
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
  const parts = useContext(MenuParts);
  if (!parts) return null;
  return <parts.Separator className={cx('lg-sep mx-3 my-1', className)} data-slot="menu-separator" />;
}
