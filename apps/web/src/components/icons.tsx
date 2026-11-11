// Small hand-drawn line icons (24 px grid, 1.4 px strokes, currentColor).
import type { SVGProps } from 'react';
import type { ViewId } from '../lib/views';

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...p }: P) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {children}
    </svg>
  );
}

/** Camera wedge: a small filled triangle at (x, y) pointing along angle `deg` (0 = east, 90 = south). */
function wedge(x: number, y: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const pt = (d: number, s: number) => {
    const px = x - Math.cos(a) * d - Math.sin(a) * s;
    const py = y - Math.sin(a) * d + Math.cos(a) * s;
    return `${px.toFixed(2)} ${py.toFixed(2)}`;
  };
  return `M${pt(0, 0)}L${pt(4.2, 2.6)}L${pt(4.2, -2.6)}Z`;
}

/**
 * Plan square (north up). The camera wedge sits outside the corner it looks
 * from, and the two facades it sees are drawn heavy.
 */
function AxoIcon({ corner, ...p }: P & { corner: 'ne' | 'nw' | 'se' | 'sw' }) {
  const sx = corner.endsWith('e') ? 1 : -1;
  const sy = corner.startsWith('s') ? 1 : -1;
  const c = (dx: number, dy: number) => `${(12 + dx).toFixed(2)} ${(12 + dy).toFixed(2)}`;
  // Heavy L along the two visible facades.
  const l = `M${c(-sx * 5, sy * 5)}L${c(sx * 5, sy * 5)}L${c(sx * 5, -sy * 5)}`;
  const deg = (Math.atan2(-sy, -sx) * 180) / Math.PI;
  return (
    <Svg {...p}>
      <path d="M7 7h10v10H7z" strokeWidth={1.2} />
      <path d={l} strokeWidth={2.4} />
      <path d={wedge(12 + sx * 6.4, 12 + sy * 6.4, deg)} fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Plan square with the viewed facade heavy and the camera wedge facing it. */
function ElevationIcon({ side, ...p }: P & { side: 'n' | 'e' | 's' | 'w' }) {
  const rot = { s: 0, w: 90, n: 180, e: 270 }[side];
  return (
    <Svg {...p}>
      <g transform={`rotate(${rot} 12 12)`}>
        <path d="M7 15V5h10v10" strokeWidth={1.2} />
        <path d="M6.3 15h11.4" strokeWidth={2.4} />
        <path d={wedge(12, 17.4, -90)} fill="currentColor" stroke="none" />
      </g>
    </Svg>
  );
}

function EyeLevelIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M3.5 12s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5Z" strokeWidth={1.3} />
      <circle cx={12} cy={12} r={2.4} fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function ViewIcon({ id, ...p }: P & { id: ViewId }) {
  switch (id) {
    case 'axo-ne': return <AxoIcon corner="ne" {...p} />;
    case 'axo-nw': return <AxoIcon corner="nw" {...p} />;
    case 'axo-se': return <AxoIcon corner="se" {...p} />;
    case 'axo-sw': return <AxoIcon corner="sw" {...p} />;
    case 'eye-sw': return <EyeLevelIcon {...p} />;
    case 'elev-north': return <ElevationIcon side="n" {...p} />;
    case 'elev-east': return <ElevationIcon side="e" {...p} />;
    case 'elev-south': return <ElevationIcon side="s" {...p} />;
    case 'elev-west': return <ElevationIcon side="w" {...p} />;
  }
}

export function SunIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx={12} cy={12} r={3.6} />
      <path d="M12 3.5v1.8M12 18.7v1.8M3.5 12h1.8M18.7 12h1.8M6 6l1.3 1.3M16.7 16.7 18 18M6 18l1.3-1.3M16.7 7.3 18 6" />
    </Svg>
  );
}

export function SparkIcon({ accent, ...p }: P & { accent?: boolean }) {
  return (
    <Svg {...p}>
      <path d="M12 4.5c.6 3.9 2.4 5.9 6.5 6.5-4.1.6-5.9 2.6-6.5 6.5-.6-3.9-2.4-5.9-6.5-6.5 4.1-.6 5.9-2.6 6.5-6.5Z" fill={accent ? 'var(--color-accent)' : 'none'} />
      <path d="M18.5 16.5c.2 1.2.8 1.8 2 2-1.2.2-1.8.8-2 2-.2-1.2-.8-1.8-2-2 1.2-.2 1.8-.8 2-2Z" strokeWidth={1.1} />
    </Svg>
  );
}

export function CloseIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="m7 7 10 10M17 7 7 17" />
    </Svg>
  );
}

export function PlusIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 6.5v11M6.5 12h11" />
    </Svg>
  );
}

export function MinusIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M6.5 12h11" />
    </Svg>
  );
}

export function FitIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4" />
      <path d="M9.5 9.5h5v5h-5z" strokeWidth={1.1} />
    </Svg>
  );
}

export function ResetViewIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M5.5 12a6.5 6.5 0 1 0 2-4.7" />
      <path d="M5 4.5v3.3h3.3" />
    </Svg>
  );
}

export function ChevronRightIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="m10 7 5 5-5 5" />
    </Svg>
  );
}

export function SendIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 18.5v-13M6.5 11 12 5.5l5.5 5.5" />
    </Svg>
  );
}

export function ArrowRightIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />
    </Svg>
  );
}

/** The openSU mark: a pitched roof over a plan square, drawn in two strokes. */
export function Mark(p: P) {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" aria-hidden="true" {...p}>
      <path d="M3.5 10.5 13 4.5l7.5 4.6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9.5h13V9.4" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
      <rect x={9.6} y={13.2} width={4.6} height={6.3} fill="var(--color-accent)" />
    </svg>
  );
}
