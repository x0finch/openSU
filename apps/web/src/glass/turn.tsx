// An assistant turn on glass (task 018): one component, two densities, from
// the same data.
//
// Compact (the floating latest exchange above the input): while the turn
// runs, one live line that replaces itself; when done, the final text with
// one line "做了 N 步修改 ›" above it that expands the list of change
// summaries. The intermediate sentences are never shown here.
//
// Full (the pinned conversation): the timeline, in order: each sentence,
// the change it led to, then the final text. Open while it is the latest
// turn; an older turn collapses to its final text plus the same line.
//
// The expand / collapse follows the shared spring and stays clipped inside
// the glass surface; with reduced motion the content fades instead. The
// line is a button with aria-expanded. Content (rich text, buttons) comes
// from the caller; this file owns the structure and the motion.
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import { cx } from './Glass';
import { Spring, SPRINGS } from './spring';

/** One line of the timeline: a sentence (rendered by the caller) or a change. */
export type GlassTurnEntry = { type: 'text'; content: ReactNode } | { type: 'change'; summary: string };

export interface GlassTurnProps {
  density: 'compact' | 'full';
  /** Compact, while the turn runs: the one live line. Full: shown under the timeline while it runs. */
  live?: ReactNode;
  /** Intermediate sentences and changes, in order (full density). */
  entries: GlassTurnEntry[];
  /** Change summaries, in order (compact density's list; their count names the line). */
  changes: string[];
  /** The final text (or, while a full turn runs, the text streaming in). */
  final?: ReactNode;
  /** The line's words, e.g. "做了 3 步修改". Without it (no changes) there is no line. */
  label?: string;
  /** Next to the label: a state badge (e.g. "已撤销"). */
  badge?: ReactNode;
  /** At the line's trailing end: undo / redo. */
  trailing?: ReactNode;
  /** Open when the user has not chosen (full: the latest turn). */
  defaultOpen?: boolean;
  /** The changes were undone: the list reads struck through. */
  undone?: boolean;
  /** Extra content at the end of the expanded region (technical details). */
  extra?: ReactNode;
  className?: string;
}

/**
 * A region that opens and closes with the shared spring: its height
 * follows the spring (clipped), its content fades in over the second half.
 * Reduced motion: no height motion, a fade.
 */
export function GlassDisclosureRegion({ open, id, children, className }: { open: boolean; id?: string; children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const openRef = useRef(open);
  openRef.current = open;
  const springs = useRef<{ h: Spring; fade: Spring } | null>(null);
  const paint = () => {
    const o = outer.current, i = inner.current, s = springs.current;
    if (!o || !i || !s) return;
    const settled = !s.h.moving && !s.fade.moving;
    if (s.h.reduced) {
      o.style.height = openRef.current || !settled ? '' : '0px';
      i.style.opacity = String(Math.max(0, Math.min(1, s.fade.value)));
    } else {
      const v = s.h.value;
      // Open and at rest: natural height, so a live timeline can keep growing.
      o.style.height = openRef.current && settled ? '' : `${Math.max(0, i.offsetHeight * v).toFixed(1)}px`;
      i.style.opacity = String(Math.max(0, Math.min(1, (v - 0.35) / 0.65)));
    }
    if (!openRef.current && settled && s.h.value <= 0.001) setMounted(false);
  };
  if (!springs.current) springs.current = { h: new Spring(open ? 1 : 0, SPRINGS.morph, paint), fade: new Spring(open ? 1 : 0, SPRINGS.fade, paint) };
  useLayoutEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  useLayoutEffect(() => {
    if (!mounted) return;
    const s = springs.current!;
    s.h.set(open ? 1 : 0);
    s.fade.set(open ? 1 : 0, { always: true });
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);
  useLayoutEffect(() => () => {
    springs.current?.h.stop();
    springs.current?.fade.stop();
  }, []);
  if (!mounted) return null;
  return (
    <div ref={outer} id={id} className="overflow-hidden" data-open={open ? '' : undefined}>
      <div ref={inner} className={className}>
        {children}
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cx('shrink-0 transition-transform duration-200', open && 'rotate-90')}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

function ChangeMark({ undone }: { undone?: boolean }) {
  return <span className={cx('absolute top-[9px] left-0.5 size-1.5 rounded-full', undone ? 'bg-ink-3' : 'bg-accent')} aria-hidden="true" />;
}

/** One change summary as a timeline or list line. */
function ChangeLine({ summary, undone }: { summary: string; undone?: boolean }) {
  return (
    <li className={cx('relative pl-3.5 text-[13px] leading-5 font-medium', undone ? 'text-ink-2 line-through decoration-ink-3' : 'text-ink')} data-testid="turn-change">
      <ChangeMark undone={undone} />
      {summary}
    </li>
  );
}

/** An assistant turn in the compact or the full density (see the file comment). */
export function GlassTurn({ density, live, entries, changes, final, label, badge, trailing, defaultOpen = false, undone, extra, className }: GlassTurnProps) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? defaultOpen;
  const id = useId();
  const compact = density === 'compact';

  // Compact while running: one line, nothing else.
  if (compact && live) {
    return (
      <div className={className} data-testid="turn" data-density={density} data-live="">
        {live}
      </div>
    );
  }

  const line = label ? (
    <div className="-ml-1.5 flex min-h-8 items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => setChosen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="lg-plate inline-flex h-8 min-w-0 items-center gap-1 px-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
        data-testid="turn-toggle"
      >
        <span className="truncate">{label}</span>
        <Chevron open={open} />
      </button>
      {badge}
      <span className="flex-1" />
      {trailing && <div className="flex shrink-0 items-center">{trailing}</div>}
    </div>
  ) : null;

  const timeline = compact ? (
    <ul className="space-y-0.5 pt-0.5 pb-2">
      {changes.map((c, i) => (
        <ChangeLine key={i} summary={c} undone={undone} />
      ))}
    </ul>
  ) : (
    <ol className="space-y-2 pt-1 pb-2.5" data-testid="turn-timeline">
      {entries.map((e, i) =>
        e.type === 'change' ? (
          <ChangeLine key={i} summary={e.summary} undone={undone} />
        ) : (
          <li key={i} className="text-ink-2 [&_*]:text-ink-2" data-testid="turn-sentence">
            {e.content}
          </li>
        ),
      )}
    </ol>
  );

  // A full turn with sentences but no changes (a rejected edit, a lookup): its timeline, always open.
  const bare = !label && !compact && entries.length > 0;
  return (
    <div className={className} data-testid="turn" data-density={density} data-open={label ? (open ? 'true' : 'false') : undefined}>
      {line}
      {label && (
        <GlassDisclosureRegion open={open} id={id}>
          {timeline}
          {extra}
        </GlassDisclosureRegion>
      )}
      {bare && timeline}
      {final}
      {!compact && live}
    </div>
  );
}
