import type { SVGProps } from 'react';

/** A walking figure (24 px grid, like the other line icons). */
export function WalkIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx={13} cy={4.6} r={1.7} fill="currentColor" stroke="none" />
      <path d="M12.2 8.2 10.4 13l2.9 2.6.9 5" />
      <path d="M10.4 13 8.6 20.4" />
      <path d="M12.2 8.2 15.4 11.6l2.6.6" />
      <path d="M12.2 8.2 9 9.8 7.4 12.4" />
    </svg>
  );
}
