// SVG string helpers and the mm -> px view transform.
import type { Pt, Rect } from './geom';

export const f = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export function attrs(a: Record<string, string | number | undefined | null>): string {
  return Object.entries(a)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? f(v) : String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
    .join('');
}

/** Model mm (Y north) -> SVG px (Y down). */
export class View {
  constructor(readonly s: number, readonly x0: number, readonly y1: number, readonly ox: number, readonly oy: number) {}
  x(x: number) { return this.ox + (x - this.x0) * this.s; }
  y(y: number) { return this.oy + (this.y1 - y) * this.s; }
  p(p: Pt): Pt { return [this.x(p[0]), this.y(p[1])]; }
  len(mm: number) { return mm * this.s; }
  rect(r: Rect): Rect { return { x0: this.x(r.x0), x1: this.x(r.x1), y0: this.y(r.y1), y1: this.y(r.y0) }; }
}

export function pathOfRings(rings: readonly (readonly Pt[])[], v: View): string {
  return rings.map((r) => `M${r.map((p) => `${f(v.x(p[0]))},${f(v.y(p[1]))}`).join('L')}Z`).join('');
}

export const rectEl = (r: Rect, a: Record<string, string | number | undefined>) =>
  `<rect${attrs({ x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0, ...a })}/>`;

export const line = (x1: number, y1: number, x2: number, y2: number, a: Record<string, string | number | undefined> = {}) =>
  `<line${attrs({ x1, y1, x2, y2, ...a })}/>`;
