// Assistant icons, drawn like components/icons.tsx (24 px grid, 1.4 px strokes).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...p }: P) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {children}
    </svg>
  );
}

export function SlidersIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M5 8h8M17 8h2M5 16h2M11 16h8" />
      <circle cx="15" cy="8" r="2" />
      <circle cx="9" cy="16" r="2" />
    </Svg>
  );
}

export function UndoIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M8.5 7 5 10.5 8.5 14" />
      <path d="M5 10.5h9a4.5 4.5 0 0 1 0 9h-3" />
    </Svg>
  );
}

export function RedoIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M15.5 7 19 10.5 15.5 14" />
      <path d="M19 10.5h-9a4.5 4.5 0 0 0 0 9h3" />
    </Svg>
  );
}

export function RetryIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M18.5 12a6.5 6.5 0 1 1-2-4.7" />
      <path d="M17.5 4.5v3.3h-3.3" />
    </Svg>
  );
}

export function StopIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="7.5" y="7.5" width="9" height="9" rx="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function NoteIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5M12 8h.01" strokeWidth={1.6} />
    </Svg>
  );
}

export function PlanCheckIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4.5 9.5 12 4.5l7.5 5V19a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5z" />
      <path d="m9 13.5 2 2 4-4" />
    </Svg>
  );
}

export function ComposeIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V12" />
      <path d="m17.5 4.5 2 2-7 7H10.5v-2z" />
    </Svg>
  );
}

export function ChevronDownIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="m7 10 5 5 5-5" />
    </Svg>
  );
}

export function ChevronUpIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="m7 14 5-5 5 5" />
    </Svg>
  );
}
