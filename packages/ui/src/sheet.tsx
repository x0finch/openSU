// Sheet: the phone form of a surface (task 031: on Vaul's Drawer). Vaul and
// the Radix Dialog it is built on are phone-only code: the implementation
// (sheet-vaul.tsx) loads on the first sheet, so desktop pages do not carry it.
import { type CSSProperties, lazy, type ReactNode, type Ref, Suspense } from 'react';

const SheetVaul = lazy(() => import('./sheet-vaul'));

/** Loads the sheet's code ahead of its first use (a phone layout calls it once it knows). */
export function preloadSheet(): void {
  void import('./sheet-vaul');
}

export interface SheetProps {
  open: boolean;
  /** The large detent's height, px. The fit detent is the content's height, capped by it (the content scrolls beyond). */
  large: number;
  /** A fixed height instead of the content's (the pinned conversation); no large detent. */
  fixed?: number;
  /** Vaul asks to close it: dragged or flicked down, the scrim tapped, Escape. */
  onClose: () => void;
  /** It has left (after its closing slide). */
  onClosed?: () => void;
  /** Modal (default): a scrim under it, focus kept inside, the rest out of reach. Non-modal: a docked sheet (the pinned conversation). */
  modal?: boolean;
  className?: string;
  /** Where it stands (left, right, width, bottom): the caller's layout. */
  style?: CSSProperties;
  children: ReactNode;
  testId?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  role?: string;
  id?: string;
  /** What the sheet holds (`data-sheet`; not `data-kind`, which is the glass role and picks the tint). */
  dataKind?: string;
  /** Its height while open (settled, px), null when closed: what the caller keeps clear of. */
  onHeight?: (h: number | null) => void;
  ref?: Ref<HTMLElement>;
}

/**
 * An inset glass sheet (radius 34, a small gap from the screen edges) that
 * rises from the bottom over the bars and a scrim. Two detents: fit (its
 * content, capped) and large; a drag down or a flick dismisses it, a drag up
 * takes it to the large detent. Closed, it is inert at once.
 */
export function Sheet(props: SheetProps) {
  return (
    <Suspense fallback={null}>
      <SheetVaul {...props} />
    </Suspense>
  );
}
