// The phone sheet's implementation on Vaul's Drawer (task 031), loaded on
// first use (sheet.tsx): an inset
// glass sheet with a grabber that rises from the bottom, over the bars and
// a scrim (iOS: nothing rides on top of a sheet). Vaul gives the drag, the
// flick and the scrim tap that dismiss it, the open and close slide, Escape
// and focus (through Radix Dialog, which Vaul is built on).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { glassRegistry } from './registry';
import { cx, Glass, useMergedRef, usePortalHost } from './surface';

/** The grabber's strip, px. */
const SHEET_GRAB = 22;
/** The gap of the inset sheet from the screen's bottom edge, px (its slide starts this much further down). */
const SHEET_INSET = 8;
/** An upward drag on the sheet of this many px takes it to the large detent; a downward one of this many brings it back. */
const DETENT_DRAG = 48;
/** Vaul's slide, ms (its TRANSITIONS.DURATION). */
const SLIDE_MS = 500;

import type { SheetProps } from './sheet';

/**
 * An inset glass sheet (radius 34, a small gap from the screen edges). Two
 * detents: fit (its content, capped) and large; a drag down or a flick
 * dismisses it, a drag up takes it to the large detent (Vaul's rubber band
 * past the top), a drag down from large back to fit. Closed, it is inert at
 * once (it does not wait for its slide to finish).
 */
export default function SheetVaul({ open, large, fixed, onClose, onClosed, modal = true, className, style, children, testId, ariaLabel, ariaLabelledBy, role, id, dataKind, onHeight, ref }: SheetProps) {
  // Mounted already open (its first use loads it), it would skip its slide: closed first, open right after.
  const [entered, setEntered] = useState(false);
  useEffect(() => setEntered(true), []);
  const host = usePortalHost();
  const el = useRef<HTMLElement | null>(null);
  const merged = useMergedRef(el, ref);
  const content = useRef<HTMLDivElement>(null);
  const [big, setBig] = useState(false);
  const [fit, setFit] = useState<number>(fixed ?? 0);
  const drag = useRef<{ y: number } | null>(null);
  const cb = useRef({ onHeight });
  cb.current = { onHeight };
  // The fit detent follows the content (another tool's panel, a longer list); the content mounts with Vaul's portal.
  const size = useRef({ large, fixed });
  size.current = { large, fixed };
  const ro = useRef<ResizeObserver | null>(null);
  const contentRef = useCallback((c: HTMLDivElement | null) => {
    content.current = c;
    ro.current?.disconnect();
    ro.current = null;
    if (!c) return;
    const measure = () => {
      const { large: l, fixed: f } = size.current;
      setFit(f ?? Math.min(l, Math.ceil(c.offsetHeight) + SHEET_GRAB));
    };
    measure();
    ro.current = new ResizeObserver(measure);
    ro.current.observe(c);
  }, []);
  useLayoutEffect(() => {
    if (fixed !== undefined) setFit(fixed);
    else if (content.current) setFit(Math.min(large, Math.ceil(content.current.offsetHeight) + SHEET_GRAB));
  }, [fixed, large]);
  useEffect(() => () => ro.current?.disconnect(), []);
  useLayoutEffect(() => {
    if (!open) setBig(false);
  }, [open]);
  const height = fixed ?? (big ? large : fit);
  useLayoutEffect(() => {
    cb.current.onHeight?.(open && height > 0 ? height : null);
  }, [open, height]);
  const kick = () => glassRegistry.kick();
  // It has left once Vaul's slide is over. Vaul reports that only for changes it made itself (a drag, the scrim,
  // Escape), not for the caller's `open`; a timer of the slide's length covers both and needs no frames.
  const closedCb = useRef(onClosed);
  closedCb.current = onClosed;
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const t = window.setTimeout(() => closedCb.current?.(), SLIDE_MS);
    return () => clearTimeout(t);
  }, [open]);
  return (
    <Drawer.Root
      open={open && entered}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      modal={modal}
      onAnimationEnd={kick}
      onDrag={kick}
      onRelease={kick}
      noBodyStyles
      repositionInputs={false}
    >
      <Drawer.Portal container={host ?? undefined}>
        {modal && <Drawer.Overlay className="lg-scrim fixed inset-0 z-40" data-testid={testId ? `${testId}-scrim` : undefined} />}
        <Drawer.Content
          asChild
          aria-describedby={undefined}
          // Radix dismisses on any press or focus outside. A docked (non-modal) sheet never closes that way: the
          // controls around it work while it stays (the phone tool bar opens a tool's sheet in its place, and the
          // press that did so must not close the sheet it just became). A modal sheet closes on its scrim only.
          onInteractOutside={(e) => {
            const t = e.target;
            if (!modal || !(t instanceof Element && t.closest('.lg-scrim'))) e.preventDefault();
          }}
          onPointerDown={(e) => {
            if (fixed === undefined) drag.current = { y: e.clientY };
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (!d) return;
            const dy = e.clientY - d.y;
            if (!big && dy < -DETENT_DRAG && fit < large) setBig(true);
            else if (big && dy > DETENT_DRAG && dy < (large - fit) * 0.9) setBig(false);
          }}
        >
          <Glass
            ref={merged}
            as="section"
            kind="text"
            radius={34}
            ariaRole={role}
            id={id}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-modal={modal && open ? 'true' : undefined}
            inert={!open || undefined}
            className={cx('lg-sheet pointer-events-auto fixed flex flex-col overflow-hidden', modal ? 'z-50' : 'z-10', className)}
            style={{ height, ['--initial-transform' as string]: `calc(100% + ${SHEET_INSET}px + env(safe-area-inset-bottom))`, ...style }}
            data-testid={testId}
            data-slot="sheet-content"
            data-sheet={dataKind}
            data-detent={fixed !== undefined ? 'fixed' : big ? 'large' : 'fit'}
            data-open={open ? '' : undefined}
          >
            <Drawer.Handle preventCycle className="lg-grab" data-testid="sheet-grab" aria-hidden="true" />
            <div className={cx('min-h-0 flex-1 overscroll-contain', big || fit >= large ? 'overflow-y-auto' : 'overflow-hidden')}>
              <div ref={contentRef}>{children}</div>
            </div>
          </Glass>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
