// Paper surfaces (task 029; UI_STYLE rule 11: not everything is glass).
// Tile: a project or template card on /projects (a picture in a hairline
// frame; interactive tiles darken their frame on hover). PaperSheet: a
// sheet of paper (white, a soft shadow; it lifts on hover). PageDots.
import { Button as BaseButton } from '@base-ui/react/button';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './surface';

const TILE = 'relative block aspect-[4/3] overflow-hidden rounded-[14px] border border-hairline bg-wash transition-colors';

export function TileLink({ className, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} className={cx(TILE, 'hover:border-ink-3', className)}>
      {children}
    </a>
  );
}

export function TileButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <BaseButton type="button" {...rest} className={cx(TILE, 'grid w-full place-items-center text-ink-2 enabled:hover:border-ink-3 enabled:hover:text-ink disabled:text-ink-3', className)}>
      {children}
    </BaseButton>
  );
}

/** A tile inside a link that holds more than the tile (a template card). */
export function Tile({ children, interactive = true }: { children: ReactNode; interactive?: boolean }) {
  return <span className={cx(TILE, interactive && 'hover:border-ink-3')}>{children}</span>;
}

/** A round outline mark inside a tile ("+"). */
export function TileMark({ children }: { children: ReactNode }) {
  return <span className="grid size-11 place-items-center rounded-full border border-current">{children}</span>;
}

/**
 * A gallery sheet: a button that opens the viewer (`ready`: it has its
 * picture and lifts on hover), and an optional `corner` control that shows
 * while the sheet is hovered or focused (download).
 */
export function PaperSheet({ ready, corner, className, children, ref, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { ready: boolean; corner?: ReactNode; ref?: Ref<HTMLButtonElement> }) {
  return (
    <div className="group relative">
      <BaseButton
        ref={ref}
        type="button"
        {...rest}
        className={cx(
          'relative block aspect-[3/4] w-full overflow-hidden rounded-[6px] bg-white shadow-hair transition-[box-shadow,transform] duration-300 ease-out-soft',
          ready && 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_28px_rgba(0,0,0,0.07)] hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(0,0,0,0.06),0_14px_36px_rgba(0,0,0,0.10)]',
          className,
        )}
      >
        {children}
      </BaseButton>
      {corner && <span className="absolute top-2 right-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">{corner}</span>}
    </div>
  );
}

/** Page dots (the phone gallery viewer). */
export function PageDots({ count, index, keys }: { count: number; index: number; keys?: string[] } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={keys?.[i] ?? i} className={cx('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-ink' : 'w-1.5 bg-hairline')} />
      ))}
    </div>
  );
}
