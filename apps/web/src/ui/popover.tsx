// Popover: every surface that opens from a control and is not a menu
// (task 029; shadcn/ui's Popover / Dialog shape): Popover, PopoverHeader,
// PopoverTitle, PopoverDescription, PopoverBody, PopoverFooter,
// PopoverAction. The parts own the inside: one header (title size, the
// close and back buttons), one inset, one gap between sections, one action
// row with one primary style, one footnote. On desktop the surface floats
// at the module gap from its anchor and grows away from it (anchored.tsx);
// on phones the same parts open as a Sheet (the one responsive rule, in
// the base). Callers compose the parts and lay out their own content
// inside the body; they never set padding, a title size or a radius.
import { type ReactNode, type Ref, useState } from 'react';
import { CloseGlyph, BackGlyph } from './glyphs';
import { AnchoredSurface } from './anchored';
import type { Placement } from './anchor';
import { Button } from './button';
import { IconButton } from './icon-button';
import { GLASS } from './material';
import type { Rect } from './registry';
import { Sheet } from './sheet';
import { cx } from './surface';
import { usePhone } from './use-phone';

export type PopoverSize = keyof typeof GLASS.panelWidth;

export interface PopoverProps {
  open: boolean;
  /** The control it stands at (desktop). */
  anchor: () => HTMLElement | null;
  placement?: Placement;
  /** What it grows out of when not the anchor (a menu row that closed, the share button beside the name). */
  from?: () => HTMLElement | Rect | null;
  /** One of the named widths. */
  size?: PopoverSize;
  /** A cap on the height (it scrolls beyond), besides the room on its side. */
  maxHeight?: string;
  /** Phones: the sheet was dragged away or its backdrop tapped. */
  onClose: () => void;
  onClosed?: () => void;
  onBox?: (b: { left: number; top: number; right: number; bottom: number } | null) => void;
  /** `dialog` (modal, labelled by its title) or `group` (a tool's panel). */
  role?: 'dialog' | 'group';
  labelledBy?: string;
  label?: string;
  id?: string;
  testId?: string;
  /** Force the phone form (a host that already knows). */
  phone?: boolean;
  /** The surface element (focus management, outside presses). */
  ref?: Ref<HTMLElement>;
  children: ReactNode;
}

export function Popover({ open, anchor, placement = 'below-start', from, size = 'dialog', maxHeight, onClose, onClosed, onBox, role = 'dialog', labelledBy, label, id, testId, phone: force, ref, children }: PopoverProps) {
  const auto = usePhone();
  const phone = force ?? auto;
  const [vh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  const a11y = { 'aria-modal': role === 'dialog' ? ('true' as const) : undefined, 'aria-labelledby': labelledBy, 'aria-label': label };
  if (phone) {
    return (
      <>
        <div className={cx('pointer-events-auto absolute inset-0 z-40 bg-black/10 transition-opacity duration-300', open ? 'opacity-100' : 'pointer-events-none opacity-0')} onClick={onClose} aria-hidden="true" />
        <Sheet open={open} large={Math.round(vh * 0.92)} onClose={onClose} onClosed={onClosed} ariaLabel={label} testId={testId} className="z-50" style={{ left: 8, right: 8, bottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          <div role={role} id={id} {...a11y} ref={ref as Ref<HTMLDivElement>}>
            <SheetContent>{children}</SheetContent>
          </div>
        </Sheet>
      </>
    );
  }
  return (
    <AnchoredSurface
      ref={ref}
      open={open}
      anchor={anchor}
      placement={placement}
      from={from}
      kind="text"
      onClosed={onClosed}
      onBox={onBox}
      ariaRole={role}
      id={id}
      {...a11y}
      style={{ width: GLASS.panelWidth[size], maxHeight }}
      className="flex flex-col overflow-y-auto overscroll-contain"
      data-testid={testId}
      data-popover={size}
      data-panel={role === 'group' && open ? '' : undefined}
    >
      <div className="lg-panel">{children}</div>
    </AnchoredSurface>
  );
}

/** The inside of a sheet that holds popover parts (the phone tool sheets): the phone inset. */
export function SheetContent({ children, panel, ref }: { children: ReactNode; panel?: boolean; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className="lg-panel" data-phone="" data-panel={panel ? '' : undefined}>
      {children}
    </div>
  );
}

/** The header: an optional back button, the title, the close button. */
export function PopoverHeader({ children, onClose, closeLabel, closeTestId, back }: { children: ReactNode; onClose?: () => void; closeLabel?: string; closeTestId?: string; back?: { label: string; onClick: () => void; testId?: string } }) {
  return (
    <header className="lg-panel-head" data-panel-head="">
      {back && (
        <IconButton label={back.label} tip={false} size={32} onClick={back.onClick} data-testid={back.testId} data-panel-back="">
          <BackGlyph />
        </IconButton>
      )}
      {children}
      {onClose && (
        <IconButton label={closeLabel ?? ''} tip={false} size={32} onClick={onClose} data-testid={closeTestId} data-panel-close="">
          <CloseGlyph />
        </IconButton>
      )}
    </header>
  );
}

/** The title (one size for every surface). Without a visible title, pass `hidden`: it names the surface for screen readers only. */
export function PopoverTitle({ children, id, hidden }: { children: ReactNode; id?: string; hidden?: boolean }) {
  return (
    <h2 className={cx('lg-panel-title', hidden && 'sr-only')} id={id} data-panel-title="">
      {children}
    </h2>
  );
}

/** One line under the title: what the surface is for. */
export function PopoverDescription({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="lg-panel-sub" data-testid={testId}>
      {children}
    </p>
  );
}

/** The content: sections one gap apart. */
export function PopoverBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('lg-panel-body', className)}>{children}</div>;
}

/** The action row at the bottom (one primary action, then plain secondary ones) and an optional footnote under it. */
export function PopoverFooter({ children, note }: { children?: ReactNode; note?: ReactNode }) {
  return (
    <>
      {children && <div className="lg-panel-actions">{children}</div>}
      {note && <p className="lg-panel-foot">{note}</p>}
    </>
  );
}

/**
 * An action of the footer: `primary` is the one prominent action, full
 * width (ginkgo yellow; Apple's sheets put a single primary action at the
 * bottom); `secondary` is plain, full width.
 */
export function PopoverAction({ kind = 'primary', ...rest }: Parameters<typeof Button>[0] & { kind?: 'primary' | 'secondary' }) {
  return kind === 'primary' ? <Button variant="accent" size="lg" full strong type={rest.onClick ? 'button' : 'submit'} data-primary-action="" {...rest} /> : <Button variant="plain" size="md" full {...rest} />;
}
