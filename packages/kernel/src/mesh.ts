// Planar-polygon mesh builder. Works in millimetres; `finish` converts to
// metres once. Every polygon keeps its outline loop so feature edges can be
// derived analytically (see edges.ts), never from the triangulation.
import type { MaterialSlot, PartRole } from './types';

export type V3 = [number, number, number];

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};

/** Newell normal (unit) of a planar polygon, counter-clockwise seen from the front. */
export function newell(pts: readonly V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm([x, y, z]);
}

/** Outline loop of one planar polygon (for feature-edge extraction). */
export interface Loop {
  pts: V3[];
  n: V3;
  part: number;
  material: MaterialSlot;
  /** Massing faces on the outside of the building (floor lines). */
  exterior: boolean;
}

export interface PartSpec {
  id: string;
  level?: string;
  role: PartRole;
  material: MaterialSlot;
  castsEdges?: boolean;
}

export class PartBuilder {
  readonly pos: number[] = [];
  readonly idx: number[] = [];
  readonly loops: Loop[] = [];
  constructor(readonly spec: PartSpec, readonly index: number) {}

  /** Convex planar polygon, counter-clockwise seen from the front. */
  polygon(pts: readonly V3[], exterior = false): void {
    const clean = dedupe(pts);
    if (clean.length < 3) return;
    const n = newell(clean);
    if (n[0] === 0 && n[1] === 0 && n[2] === 0) return;
    const base = this.pos.length / 3;
    for (const p of clean) this.pos.push(p[0], p[1], p[2]);
    for (let i = 1; i < clean.length - 1; i++) {
      // Skip slivers (collinear fan triangles).
      const a = clean[0]!, b = clean[i]!, c = clean[i + 1]!;
      if (len(cross(sub(b, a), sub(c, a))) < 1e-3) continue;
      this.idx.push(base, base + i, base + i + 1);
    }
    this.loops.push({ pts: clean, n, part: this.index, material: this.spec.material, exterior });
  }

  /** Axis-aligned box (all six faces). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const c = (x: number, y: number, z: number): V3 => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
    this.polygon([c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1)]);
    this.polygon([c(0, 0, 0), c(0, 1, 0), c(1, 1, 0), c(1, 0, 0)]);
    this.polygon([c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1)]);
    this.polygon([c(1, 0, 0), c(1, 1, 0), c(1, 1, 1), c(1, 0, 1)]);
    this.polygon([c(1, 1, 0), c(0, 1, 0), c(0, 1, 1), c(1, 1, 1)]);
    this.polygon([c(0, 1, 0), c(0, 0, 0), c(0, 0, 1), c(0, 1, 1)]);
  }

  get triangles(): number {
    return this.idx.length / 3;
  }
}

function dedupe(pts: readonly V3[]): V3[] {
  const out: V3[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01 && Math.abs(q[2] - p[2]) < 0.01) continue;
    out.push(p);
  }
  while (out.length > 1) {
    const a = out[0]!, b = out[out.length - 1]!;
    if (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01 && Math.abs(a[2] - b[2]) < 0.01) out.pop();
    else break;
  }
  return out;
}

/** Registry of parts, created on first use, in a deterministic order. */
export class Parts {
  readonly list: PartBuilder[] = [];
  private readonly byId = new Map<string, PartBuilder>();

  get(spec: PartSpec): PartBuilder {
    let p = this.byId.get(spec.id);
    if (!p) {
      p = new PartBuilder(spec, this.list.length);
      this.byId.set(spec.id, p);
      this.list.push(p);
    }
    return p;
  }
}
