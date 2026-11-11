// Shared lookups over a resolved house: grid cells, cell owners per level,
// elevations, wall bands. Millimetres throughout.
import type { ResolvedHouse, ResolvedLevel, ResolvedSpace, ResolvedWall } from '@opensu/model';
import { Massing } from './massing';
import { Parts } from './mesh';

export type Rect = [number, number, number, number]; // x0, y0, x1, y1

export interface LevelInfo {
  level: ResolvedLevel;
  index: number;
  elev: number;
  top: number;
  /** owner[i * ny + j] = space on grid cell (i, j), or null. */
  owner: (ResolvedSpace | null)[];
  /** Wall footprints (extended at the ends), for inside tests. */
  bands: Rect[];
}

export function pointInRings(rings: readonly (readonly [number, number])[][], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Greedy merge of cells (keys i * ny + j) into [i0, i1, j0, j1) rectangles. */
export function mergeCells(cells: Iterable<number>, ny: number): [number, number, number, number][] {
  const set = new Set(cells);
  const sorted = [...set].sort((a, b) => a - b);
  const used = new Set<number>();
  const out: [number, number, number, number][] = [];
  for (const k of sorted) {
    if (used.has(k)) continue;
    const i0 = Math.floor(k / ny), j0 = k % ny;
    let j1 = j0 + 1;
    while (j1 < ny && set.has(i0 * ny + j1) && !used.has(i0 * ny + j1)) j1++;
    let i1 = i0 + 1;
    for (;;) {
      let ok = true;
      for (let j = j0; j < j1; j++) {
        const kk = i1 * ny + j;
        if (!set.has(kk) || used.has(kk)) { ok = false; break; }
      }
      if (!ok) break;
      i1++;
    }
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) used.add(i * ny + j);
    out.push([i0, i1, j0, j1]);
  }
  return out;
}

export class Ctx {
  readonly xs: number[];
  readonly ys: number[];
  readonly nx: number;
  readonly ny: number;
  readonly levels: LevelInfo[];
  readonly parts = new Parts();
  readonly massing = new Massing();
  /** Hash of the house for deterministic seeds. */
  readonly seed: number;

  constructor(readonly house: ResolvedHouse) {
    this.xs = house.grid.x.map((g) => g.pos).sort((a, b) => a - b);
    this.ys = house.grid.y.map((g) => g.pos).sort((a, b) => a - b);
    this.nx = this.xs.length - 1;
    this.ny = this.ys.length - 1;
    this.levels = house.levels.map((level, index) => {
      const owner: (ResolvedSpace | null)[] = new Array(this.nx * this.ny).fill(null);
      for (let i = 0; i < this.nx; i++) {
        for (let j = 0; j < this.ny; j++) {
          const cx = (this.xs[i]! + this.xs[i + 1]!) / 2;
          const cy = (this.ys[j]! + this.ys[j + 1]!) / 2;
          owner[i * this.ny + j] = level.spaces.find((s) => pointInRings(s.rings, cx, cy)) ?? null;
        }
      }
      return { level, index, elev: level.elevation, top: level.elevation + level.height, owner, bands: level.walls.map((w) => wallRect(w)) };
    });
    let h = 2166136261;
    for (const ch of house.name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    this.seed = h;
  }

  cellIndexAt(x: number, y: number): [number, number] | null {
    const i = this.xs.findIndex((v, k) => k < this.nx && v <= x && x < this.xs[k + 1]!);
    const j = this.ys.findIndex((v, k) => k < this.ny && v <= y && y < this.ys[k + 1]!);
    return i < 0 || j < 0 ? null : [i, j];
  }

  /** Space on a level at a plan point (null outside every space). */
  spaceAt(li: number, x: number, y: number): ResolvedSpace | null {
    const lv = this.levels[li];
    const c = this.cellIndexAt(x, y);
    return lv && c ? lv.owner[c[0] * this.ny + c[1]]! : null;
  }

  /** Plan rectangles of a set of cells. */
  rects(cells: Iterable<number>): Rect[] {
    return mergeCells(cells, this.ny).map(([i0, i1, j0, j1]) => [this.xs[i0]!, this.ys[j0]!, this.xs[i1]!, this.ys[j1]!]);
  }

  cellsOf(li: number, pred: (s: ResolvedSpace) => boolean): number[] {
    const out: number[] = [];
    this.levels[li]!.owner.forEach((s, k) => { if (s && pred(s)) out.push(k); });
    return out;
  }

  levelIndex(id: string): number {
    return this.levels.findIndex((l) => l.level.id === id);
  }

  /** Level whose storey contains z (the top level above its top). */
  levelAtZ(z: number): LevelInfo {
    for (const l of this.levels) if (z < l.top) return l;
    return this.levels[this.levels.length - 1]!;
  }
}

/** Wall footprint: centre line +- half thickness, ends extended by half thickness. */
export function wallRect(w: ResolvedWall): Rect {
  const h = w.thickness / 2;
  if (w.orient === 'NS') return [w.a[0] - h, Math.min(w.a[1], w.b[1]) - h, w.a[0] + h, Math.max(w.a[1], w.b[1]) + h];
  return [Math.min(w.a[0], w.b[0]) - h, w.a[1] - h, Math.max(w.a[0], w.b[0]) + h, w.a[1] + h];
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const r: Rect = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] - r[0] > 0.5 && r[3] - r[1] > 0.5 ? r : null;
}

export function grow(r: Rect, d: number): Rect {
  return [r[0] - d, r[1] - d, r[2] + d, r[3] + d];
}
