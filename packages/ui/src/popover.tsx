// Popover: every surface that opens from a control and is not a menu
// (task 029; task 031: on Base UI's Popover, shadcn/ui's part names):
// Popover, PopoverHeader, PopoverTitle, PopoverDescription, PopoverBody,
// PopoverFooter, PopoverAction. The parts own the inside: one header (a
// title and a close button, the same on every surface), one inset, one gap
// between sections, one action row with one primary style, one footnote.
// On desktop Base UI places the surface at the module gap from its anchor
// (side, align, flip and shift), manages focus and dismissal (Escape, a
// press outside), and drives the open and close motion through
// `data-starting-style` / `data-ending-style` from `--transform-origin`
// (glass.css `.lg-pop`); on phones the same parts open as a Sheet (the one
// responsive rule, in the package). Callers compose the parts and lay out
// their own content inside the body; they never set padding, a title size
// or a radius.
import { Popover as BasePopover } from '@base-ui/react/popover';
import { createContext, type ReactNode, type Ref, useContext, useState } from 'react';
import { CloseGlyph, BackGlyph } from './glyphs';
import { anchorBox, FLOATING, type Placement, sideAlign } from './floating';
import { Button } from './button';
import { IconButton } from './icon-button';
import { GLASS } from './material';
import { Sheet } from './sheet';
import { cx, Glass, usePortalHost } from './surface';
import { type Box, useFloatingBox } from './use-floating-box';
import { usePhone } from './use-phone';

export type PopoverSize = keyof typeof GLASS.panelWidth;
type FocusTarget = BasePopover.Popup.Props['initialFocus'];

/** Why a surface closes (Base UI's reasons, plus a drag or a backdrop tap on the phone sheet). */
export type CloseReason = 'escape-key' | 'outside-press' | 'focus-out' | 'close-press' | 'sheet' | (string & {});

export interface PopoverProps {
  open: boolean;
  /** The control it stands at (desktop). */
  anchor: () => HTMLElement | null;
  placement?: Placement;
  /** One of the named widths. */
  size?: PopoverSize;
  /** A cap on the height (it scrolls beyond), besides the room on its side. */
  maxHeight?: string;
  /** Base UI asks to close it (Escape, a press outside, focus leaving it; on phones the sheet dragged away or its backdrop tapped). */
  onClose: (reason?: CloseReason) => void;
  /** It has left (after its closing motion). */
  onClosed?: () => void;
  /** Its box while open (viewport px), null when closed. */
  onBox?: (b: Box | null) => void;
  /** `dialog` (focus stays inside while open) or `group` (a tool's panel). */
  role?: 'dialog' | 'group';
  /** A press outside closes it (default). A tool's panel that stays open while the drawing is used passes false (focus leaving it does not close it either). */
  closeOnOutsidePress?: boolean;
  /** Where focus goes when it opens / closes (Base UI's `initialFocus` and `finalFocus`). */
  initialFocus?: FocusTarget;
  finalFocus?: BasePopover.Popup.Props['finalFocus'];
  labelledBy?: string;
  label?: string;
  id?: string;
  testId?: string;
  /** Force the phone form (a host that already knows). */
  phone?: boolean;
  /** The surface element. */
  ref?: Ref<HTMLElement>;
  children: ReactNode;
}

/** Inside a desktop popover: the header's close button is Base UI's Close part (it completes the dialog's focus handling). */
const InPopover = createContext(false);

export function Popover({ open, anchor, placement = 'below-start', size = 'dialog', maxHeight, onClose, onClosed, onBox, role = 'dialog', closeOnOutsidePress = true, initialFocus, finalFocus, labelledBy, label, id, testId, phone: force, ref, children }: PopoverProps) {
  const auto = usePhone();
  const phone = force ?? auto;
  const [vh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  const host = usePortalHost();
  const boxRef = useFloatingBox(open && !phone, anchor, false, onBox);
  if (phone) {
    // The phone form (task 031: on Vaul): a sheet that rises over the bars and a scrim; nothing rides on it.
    return (
      <Sheet
        ref={ref}
        open={open}
        large={Math.round(vh * 0.92)}
        onClose={() => onClose('sheet')}
        onClosed={onClosed}
        role={role}
        id={id}
        ariaLabel={label}
        ariaLabelledBy={labelledBy}
        testId={testId}
        style={{ left: 8, right: 8, bottom: 'max(8px, env(safe-area-inset-bottom))' }}
      >
        <SheetContent>{children}</SheetContent>
      </Sheet>
    );
  }
  const { side, align } = sideAlign(placement);
  return (
    <BasePopover.Root
      open={open}
      modal={role === 'dialog' ? 'trap-focus' : false}
      onOpenChange={(next, details) => {
        if (next) return;
        const target = (details.event as Event | undefined)?.target as Node | null | undefined;
        // The anchor toggles its surface itself (a press on it is not a press outside).
        if (details.reason === 'outside-press' && target && anchor()?.contains(target)) return details.cancel();
        if (!closeOnOutsidePress && (details.reason === 'outside-press' || details.reason === 'focus-out')) return details.cancel();
        // The header's close button calls the header's own handler.
        if (details.reason === 'close-press') return;
        onClose(details.reason);
      }}
      onOpenChangeComplete={(o) => {
        if (!o) onClosed?.();
      }}
    >
      <BasePopover.Portal container={host ?? undefined}>
        <BasePopover.Positioner ref={boxRef} anchor={anchorBox(anchor)} side={side} align={align} {...FLOATING} className="z-50">
          <BasePopover.Popup
            initialFocus={initialFocus}
            finalFocus={finalFocus}
            render={(props, state) => {
              const { role: _role, style, className, ...rest } = props as typeof props & { role?: string };
              return (
                <Glass
                  {...rest}
                  ref={(el: HTMLElement | null) => {
                    if (el) (el as HTMLElement & { __anchor?: () => HTMLElement | null }).__anchor = anchor;
                    if (typeof ref === 'function') ref(el);
                    else if (ref) (ref as { current: HTMLElement | null }).current = el;
                    const r = (props as { ref?: Ref<HTMLElement> }).ref;
                    if (typeof r === 'function') r(el);
                    else if (r) (r as { current: HTMLElement | null }).current = el;
                  }}
                  kind="text"
                  radius={GLASS.radiusPanel}
                  layer={1}
                  ariaRole={role}
                  id={id}
                  aria-label={label}
                  aria-labelledby={labelledBy}
                  // Closed (still leaving): out of reach at once, without waiting for its last frames.
                  aria-modal={role === 'dialog' && state.open ? 'true' : undefined}
                  inert={!state.open || undefined}
                  className={cx('lg-pop pointer-events-auto flex flex-col overflow-y-auto overscroll-contain', className)}
                  style={{ ...style, width: GLASS.panelWidth[size], maxHeight: maxHeight ? `min(${maxHeight}, var(--available-height))` : 'var(--available-height)' }}
                  data-testid={testId}
                  data-anchored=""
                  data-popover={size}
                  data-placement={placement}
                  data-panel={role === 'group' && state.open ? '' : undefined}
                />
              );
            }}
          >
            <InPopover.Provider value>
              <div className="lg-panel">{children}</div>
            </InPopover.Provider>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
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

/** The header: an optional back button, the title, the close button (every surface has one). */
export function PopoverHeader({ children, onClose, closeLabel, closeTestId, back }: { children: ReactNode; onClose: () => void; closeLabel: string; closeTestId?: string; back?: { label: string; onClick: () => void; testId?: string } }) {
  const inPopover = useContext(InPopover);
  const close = (
    <IconButton label={closeLabel} tip={false} size={32} onClick={onClose} data-testid={closeTestId} data-panel-close="">
      <CloseGlyph />
    </IconButton>
  );
  return (
    <header className="lg-panel-head" data-panel-head="">
      {back && (
        <IconButton label={back.label} tip={false} size={32} onClick={back.onClick} data-testid={back.testId} data-panel-back="">
          <BackGlyph />
        </IconButton>
      )}
      {children}
      {inPopover ? <BasePopover.Close render={close} /> : close}
    </header>
  );
}

/** The title (one size for every surface). */
export function PopoverTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 className="lg-panel-title" id={id} data-panel-title="">
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
 * width (the accent; Apple's sheets put a single primary action at the
 * bottom); `secondary` is plain, full width.
 */
export function PopoverAction({ kind = 'primary', ...rest }: Parameters<typeof Button>[0] & { kind?: 'primary' | 'secondary' }) {
  return kind === 'primary' ? <Button variant="accent" size="lg" full strong type={rest.onClick ? 'button' : 'submit'} data-primary-action="" {...rest} /> : <Button variant="plain" size="md" full {...rest} />;
}
