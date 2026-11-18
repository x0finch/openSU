// Small helpers of the base components.
import { type Rect } from './registry';

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const toRect = (r: DOMRect): Rect => ({ x: r.left, y: r.top, width: r.width, height: r.height });

