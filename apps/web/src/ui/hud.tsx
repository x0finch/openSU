// HudPanel: the glass pinned to the screen while walking (the hint pill,
// the map, the level chips, the joystick, the time of day). `kind`:
// control (a capsule) or text (a rounded panel, radius 26, or 22 when
// `small`); `inset`: none, xs (4), sm (6), md (12), pill (16 x 8) or row (a
// control at the start, concentric, text at the end). Where
// it stands is the caller's layout. HudInset: the paper well inside it
// that holds the map.
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import { cx, Glass } from './surface';

const INSET = { none: '', xs: 'p-1', sm: 'p-1.5', md: 'p-3', pill: 'px-4 py-2', row: 'flex items-center gap-2 py-1.5 pr-4 pl-1.5' } as const;

export function HudPanel({ kind = 'text', small, inset = 'md', interactive = true, className, style, children, testId, ariaRole, ref, ...rest }: Omit<HTMLAttributes<HTMLElement>, 'role'> & { kind?: 'text' | 'control'; small?: boolean; inset?: keyof typeof INSET; interactive?: boolean; className?: string; style?: CSSProperties; children?: ReactNode; testId?: string; ariaRole?: string; ref?: Ref<HTMLElement> }) {
  return (
    <Glass ref={ref} kind={kind} radius={kind === 'text' ? (small ? 22 : 26) : 'capsule'} ariaRole={ariaRole} className={cx(interactive ? 'pointer-events-auto' : 'pointer-events-none', INSET[inset], className)} style={style} data-testid={testId} {...rest}>
      {children}
    </Glass>
  );
}

export function HudInset({ children, style, label }: { children: ReactNode; style?: CSSProperties; label: string }) {
  return (
    <div className="relative overflow-hidden rounded-[16px] bg-page" style={style} role="img" aria-label={label}>
      {children}
    </div>
  );
}

/** The joystick's knob (moved by the caller through its transform). */
export function HudKnob({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return <div ref={ref} className="lg-knob size-12" />;
}
