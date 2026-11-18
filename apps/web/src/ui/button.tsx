// Button: every button of the app (task 029, part 3; shadcn/ui's Button
// shape: one component, variants as props). Inside glass a button rests on
// the module plate (`.lg-plate`, the only hover state on glass); on paper
// pages it uses the paper styles. Callers choose a variant and a size and
// lay the button out (margins, flex); they never set its radius, hover,
// focus ring or shadow.
import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { GlassButton } from './glass-button';
import { Spinner } from './spinner';
import { cx } from './surface';
import { Tooltip } from './tooltip';

export type ButtonVariant =
  /** A standalone glass capsule over the drawing (icon, or icon and label). */
  | 'glass'
  /** Inside glass: text on the plate, which shows on hover and press. */
  | 'plain'
  /** Inside glass: resting on a wash (a secondary action that must read as a button). */
  | 'tinted'
  /** Inside glass: quiet ink (a close or back button, a disclosure). */
  | 'quiet'
  /** The one primary action: ginkgo yellow (send, the primary action of a panel). */
  | 'accent'
  /** Ink on paper or glass: a strong action that is not the primary one (stop, apply). */
  | 'ink'
  /** Paper pages: a quiet button on the page (hover wash). */
  | 'paper'
  /** Paper pages: a secondary button resting on a wash. */
  | 'paper-tinted'
  /** Paper pages: the main call to action (ink; a ginkgo arrow chip with `arrow`). */
  | 'paper-ink'
  /** Text only, the colour lifts on hover (a details toggle). */
  | 'link'
  /** Ink written on the drawing (the house name that opens its menu): it dims on hover. */
  | 'canvas';

/** Height and type: xs 28, sm 32, md 40, lg 48 (glass: `size` is the height in px). */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1',
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-[14px] gap-1.5',
  lg: 'h-12 px-5 text-[15px] gap-2',
};
const ICON: Record<ButtonSize, string> = { xs: 'size-7', sm: 'size-8', md: 'size-10', lg: 'size-12' };

const VARIANT: Record<Exclude<ButtonVariant, 'glass'>, string> = {
  plain: 'lg-plate text-ink',
  tinted: 'lg-plate text-ink',
  quiet: 'lg-plate text-ink-2 hover:text-ink',
  accent: 'lg-focus rounded-full bg-accent text-on-accent transition-[filter,opacity] duration-150 enabled:hover:brightness-95',
  ink: 'lg-focus rounded-full bg-ink text-on-ink transition-opacity enabled:hover:opacity-90',
  paper: 'rounded-ui text-ink transition-colors hover:bg-wash',
  'paper-tinted': 'rounded-full bg-wash text-ink transition-colors hover:bg-hairline',
  'paper-ink': 'group rounded-ui bg-ink text-white transition-[background-color] hover:bg-black',
  link: 'rounded-[6px] text-ink-2 transition-colors hover:text-ink',
  canvas: 'rounded-[10px] text-canvas-ink transition-opacity hover:opacity-75',
};

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Glass variant: the height in px (default 48). */
  height?: number;
  /** An icon before the label; alone (no children) the button is a circle. */
  icon?: ReactNode;
  /** The accessible name (and, with `tip`, the tooltip) of an icon button. */
  label?: string;
  tip?: boolean;
  /** Full width (a panel's action). */
  full?: boolean;
  /** Weight of the label: semibold for a primary-looking action. */
  strong?: boolean;
  /** A secondary action that turns into a confirmation (red text). */
  danger?: boolean;
  busy?: boolean;
  /** A row: left-aligned text, the row radius (a list of choices inside a panel). */
  row?: boolean;
  /** A tile: the tile radius (a grid of choices inside a panel). */
  tile?: boolean;
  /** Selected or open: the plate's pressed fill (a row of a group, an open pop-up button). */
  selected?: boolean;
  /** Chosen in a set of tiles or toggles: ink fill, light text (the views panel). */
  inverted?: boolean;
  /** A round icon button of this diameter in px (instead of the size's). */
  dim?: number;
};

/** Utility groups a caller may override for layout (its own height, padding, gap, type size or weight): the base's class of that group gives way. */
const GROUPS: RegExp[] = [/^shrink/, /^(h|min-h)-/, /^(px|pl|pr)-/, /^(py|pt|pb)-/, /^gap-/, /^text-(\[\d|xs|sm|base|lg|2xs)/, /^font-(normal|medium|semibold|bold)/, /^(size|w)-/];
function merge(base: string, extra?: string): string {
  if (!extra) return base;
  const mine = extra.split(/\s+/).filter(Boolean).map((c) => c.replace(/!$/, ''));
  const keep = base.split(/\s+/).filter((c) => !GROUPS.some((g) => g.test(c) && mine.some((m) => g.test(m) || (g.source.startsWith('^(h|') && /^size-/.test(m)))));
  return cx(keep.join(' '), extra);
}

function classes({ variant = 'plain', size = 'md', icon, children, full, strong, danger, row, tile, inverted }: Common & { children?: ReactNode }): string {
  const round = !!icon && !children;
  return cx(
    'hit inline-flex shrink-0 items-center justify-center whitespace-nowrap disabled:opacity-50',
    strong ? 'font-semibold' : 'font-medium',
    VARIANT[variant as Exclude<ButtonVariant, 'glass'>],
    round ? cx(ICON[size], 'rounded-full px-0') : SIZE[size],
    variant === 'tinted' && 'lg-plate',
    full && 'w-full',
    danger && 'text-danger',
    row && 'w-full justify-start rounded-[14px] text-left',
    tile && 'rounded-[8px]',
    inverted && 'bg-ink! text-on-ink!',
  );
}

export function Button({ variant = 'plain', size = 'md', height, icon, label, tip, full, strong, danger, busy, row, tile, selected, inverted, dim, className, children, ref, ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  if (variant === 'glass') return <GlassButton icon={icon} label={label} size={height ?? 48} tip={tip} className={className} ref={ref} {...rest}>{children}</GlassButton>;
  const btn = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      {...rest}
      disabled={rest.disabled || busy}
      data-filled={variant === 'tinted' ? '' : undefined}
      data-on={selected ? '' : undefined}
      style={dim ? { width: dim, height: dim, ...rest.style } : rest.style}
      className={merge(classes({ variant, size, icon, children, full, strong, danger, row, tile, inverted }), className)}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
  return tip && label ? <Tooltip label={label}>{btn}</Tooltip> : btn;
}

/** A link that looks like a button (paper pages, not-found pages): the same variants. */
export function ButtonLink({ variant = 'paper', size = 'md', icon, full, strong, className, children, ...rest }: Common & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} className={merge(classes({ variant, size, icon, children, full, strong }), className)}>
      {icon}
      {children}
    </a>
  );
}

/** The class of a button of `variant` and `size`, for a router link that must render its own element. */
export const buttonClass = (o: Common & { children?: ReactNode; className?: string }) => merge(classes(o), o.className);

/**
 * "Continue with Google": Google's own button (its brand rules: the
 * standard "G" unmodified, 12 px before it, 10 px after, 12 px after the
 * text; its dark theme, glass.css `.google-btn`). The logo comes from the
 * caller's icon set.
 */
export function GoogleButton({ label, logo, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; logo: ReactNode }) {
  return (
    <button type="button" {...rest} className={cx('hit google-btn flex h-12 w-full items-center justify-center rounded-full pr-3 pl-3 text-[15px] font-medium', className)}>
      <span className="mr-2.5 inline-flex shrink-0">{logo}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/** The ginkgo chip with an arrow at the end of a paper call to action; it nudges forward on hover. */
export function ButtonArrow({ children }: { children: ReactNode }) {
  return <span className="grid size-6 place-items-center rounded-full bg-accent text-ink transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5">{children}</span>;
}
