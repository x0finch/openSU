// Grid cells and rectilinear cell-set geometry. Everything on a level lives on
// the global axis grid, so spaces are sets of grid cells and all boundaries
// are unions of unit grid edges. Pure functions, no DOM.
import type { CellRect, House } from './schema';

export type Point = [number, number];

export interface Grid {
  /** Sorted unique X positions (mm). */
  xs: number[];
  /** Sorted unique Y positions (mm). */
  ys: number[];
  /** Grid line id -> index into xs / ys. */
  xIndex: Map<string, number>;
  yIndex: Map<string, number>;
  /** One id per position index (the first authored id at that position). */
  xIds: string[];
  yIds: string[];
  /** Number of cell columns / rows. */
  nx: number;
  ny: number;
}

export function buildGrid(house: Pick<House, 'grid'>): Grid {
  const build = (lines: { id: string; pos: number }[]) => {
    const positions = [...new Set(lines.map((l) => l.pos))].sort((a, b) => a - b);
    const index = new Map<string, number>();
    const ids: string[] = new Array<string>(positions.length).fill('');
    for (const l of lines) {
      const i = positions.indexOf(l.pos);
      if (!index.has(l.id)) index.set(l.id, i);
      if (ids[i] === '') ids[i] = l.id;
    }
    return { positions, index, ids };
  };
  const x = build(house.grid.x);
  const y = build(house.grid.y);
  return {
    xs: x.positions,
    ys: y.positions,
    xIndex: x.index,
    yIndex: y.index,
    xIds: x.ids,
    yIds: y.ids,
    nx: Math.max(0, x.positions.length - 1),
    ny: Math.max(0, y.positions.length - 1),
  };
}

/** Cell key for column i, row j. */
export function cellKey(grid: Grid, i: number, j: number): number {
  return j * grid.nx + i;
}

export function cellIJ(grid: Grid, key: number): [number, number] {
  return [key % grid.nx, Math.floor(key / grid.nx)];
}

export interface RectIndex {
  i0: number; i1: number; j0: number; j1: number;
}

/** Index range of a cell rect, normalised so i0 <= i1, or null when an id is
 *  unknown. Zero-size rects come back with i0 === i1 or j0 === j1. */
export function rectIndex(grid: Grid, r: CellRect): RectIndex | null {
  const a = grid.xIndex.get(r.x0);
  const b = grid.xIndex.get(r.x1);
  const c = grid.yIndex.get(r.y0);
  const d = grid.yIndex.get(r.y1);
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  return { i0: Math.min(a, b), i1: Math.max(a, b), j0: Math.min(c, d), j1: Math.max(c, d) };
}

/** Set of grid cells covered by a union of rects (unknown ids are skipped). */
export function cellsOf(grid: Grid, rects: readonly CellRect[]): Set<number> {
  const out = new Set<number>();
  for (const r of rects) {
    const ri = rectIndex(grid, r);
    if (!ri) continue;
    for (let j = ri.j0; j < ri.j1; j++) for (let i = ri.i0; i < ri.i1; i++) out.add(cellKey(grid, i, j));
  }
  return out;
}

export function cellArea(grid: Grid, key: number): number {
  const [i, j] = cellIJ(grid, key);
  return (grid.xs[i + 1]! - grid.xs[i]!) * (grid.ys[j + 1]! - grid.ys[j]!);
}

export function setArea(grid: Grid, cells: ReadonlySet<number>): number {
  let a = 0;
  for (const k of cells) a += cellArea(grid, k);
  return a;
}

export function bboxOf(grid: Grid, cells: ReadonlySet<number>): { x0: number; x1: number; y0: number; y1: number } | null {
  if (cells.size === 0) return null;
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (const k of cells) {
    const [i, j] = cellIJ(grid, k);
    i0 = Math.min(i0, i); i1 = Math.max(i1, i + 1);
    j0 = Math.min(j0, j); j1 = Math.max(j1, j + 1);
  }
  return { x0: grid.xs[i0]!, x1: grid.xs[i1]!, y0: grid.ys[j0]!, y1: grid.ys[j1]! };
}

/** Number of 4-connected components of a cell set. */
export function componentCount(grid: Grid, cells: ReadonlySet<number>): number {
  const seen = new Set<number>();
  let count = 0;
  for (const start of cells) {
    if (seen.has(start)) continue;
    count++;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const k = stack.pop()!;
      const [i, j] = cellIJ(grid, k);
      const nbs: [number, number][] = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
      for (const [a, b] of nbs) {
        if (a < 0 || b < 0 || a >= grid.nx || b >= grid.ny) continue;
        const n = cellKey(grid, a, b);
        if (cells.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
  }
  return count;
}

/** Largest axis-aligned rectangle made of whole cells of the set, in mm
 *  (used for "short side" minimum-size checks on non-rectangular spaces). */
export function largestRect(grid: Grid, cells: ReadonlySet<number>): { w: number; h: number } {
  let best = { w: 0, h: 0, area: 0 };
  for (let j0 = 0; j0 < grid.ny; j0++) {
    for (let i0 = 0; i0 < grid.nx; i0++) {
      if (!cells.has(cellKey(grid, i0, j0))) continue;
      // Grow columns first, then rows.
      let maxI = grid.nx;
      for (let j1 = j0 + 1; j1 <= grid.ny; j1++) {
        let i = i0;
        while (i < maxI && cells.has(cellKey(grid, i, j1 - 1))) i++;
        maxI = i;
        if (maxI === i0) break;
        const w = grid.xs[maxI]! - grid.xs[i0]!;
        const h = grid.ys[j1]! - grid.ys[j0]!;
        if (w * h > best.area) best = { w, h, area: w * h };
      }
    }
  }
  return { w: best.w, h: best.h };
}

/**
 * Boundary rings of a cell set in mm. Outer rings are counter-clockwise,
 * holes clockwise; collinear vertices are removed. Cells touching only at a
 * corner give separate rings. Rings start at their lowest-left vertex and are
 * sorted by that vertex, so the output is deterministic.
 */
export function rings(grid: Grid, cells: ReadonlySet<number>): Point[][] {
  const has = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < grid.nx && j < grid.ny && cells.has(cellKey(grid, i, j));
  // Directed unit edges with the cell on the left, in index space.
  const W = grid.nx + 1;
  const vkey = (i: number, j: number) => j * W + i;
  const out = new Map<number, number[]>(); // from vertex -> list of to vertices
  const add = (a: number, b: number) => {
    const l = out.get(a);
    if (l) l.push(b); else out.set(a, [b]);
  };
  for (const k of [...cells].sort((a, b) => a - b)) {
    const [i, j] = cellIJ(grid, k);
    if (!has(i, j - 1)) add(vkey(i, j), vkey(i + 1, j));
    if (!has(i + 1, j)) add(vkey(i + 1, j), vkey(i + 1, j + 1));
    if (!has(i, j + 1)) add(vkey(i + 1, j + 1), vkey(i, j + 1));
    if (!has(i - 1, j)) add(vkey(i, j + 1), vkey(i, j));
  }
  const vij = (v: number): [number, number] => [v % W, Math.floor(v / W)];
  const result: Point[][] = [];
  const starts = [...out.keys()].sort((a, b) => a - b);
  for (const s of starts) {
    while ((out.get(s)?.length ?? 0) > 0) {
      const loop: number[] = [s];
      let prev = s;
      let cur = out.get(s)!.shift()!;
      while (cur !== s) {
        loop.push(cur);
        const cands = out.get(cur) ?? [];
        if (cands.length === 0) break; // malformed; should not happen
        let pick = 0;
        if (cands.length > 1) {
          // Pinch vertex: prefer the left turn so diagonal cells stay apart.
          const [pi, pj] = vij(prev);
          const [ci, cj] = vij(cur);
          const din: Point = [ci - pi, cj - pj];
          let bestScore = -Infinity;
          cands.forEach((c, idx) => {
            const [ni, nj] = vij(c);
            const dout: Point = [ni - ci, nj - cj];
            const cross = din[0] * dout[1] - din[1] * dout[0];
            const dot = din[0] * dout[0] + din[1] * dout[1];
            const score = cross > 0 ? 2 : dot > 0 ? 1 : 0;
            if (score > bestScore) { bestScore = score; pick = idx; }
          });
        }
        const next = cands.splice(pick, 1)[0]!;
        prev = cur;
        cur = next;
      }
      // Drop collinear vertices.
      const pts = loop.map(vij);
      const simplified: [number, number][] = [];
      for (let n = 0; n < pts.length; n++) {
        const a = pts[(n - 1 + pts.length) % pts.length]!;
        const b = pts[n]!;
        const c = pts[(n + 1) % pts.length]!;
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (cross !== 0) simplified.push(b);
      }
      // Rotate to start at the lowest (then left-most) vertex.
      let first = 0;
      simplified.forEach((p, idx) => {
        const f = simplified[first]!;
        if (p[1] < f[1] || (p[1] === f[1] && p[0] < f[0])) first = idx;
      });
      const rotated = [...simplified.slice(first), ...simplified.slice(0, first)];
      result.push(rotated.map(([i, j]) => [grid.xs[i]!, grid.ys[j]!] as Point));
    }
  }
  result.sort((a, b) => a[0]![1] - b[0]![1] || a[0]![0] - b[0]![0]);
  return result;
}

/** Greedy decomposition of a cell set into index rects (row-major, each
 *  rect grown east first, then north). Deterministic. */
export function cellRects(grid: Grid, cells: ReadonlySet<number>): RectIndex[] {
  const left = new Set(cells);
  const out: RectIndex[] = [];
  for (const k of [...cells].sort((a, b) => a - b)) {
    if (!left.has(k)) continue;
    const [i0, j0] = cellIJ(grid, k);
    let i1 = i0 + 1;
    while (i1 < grid.nx && left.has(cellKey(grid, i1, j0))) i1++;
    let j1 = j0 + 1;
    const rowFull = (j: number) => {
      for (let i = i0; i < i1; i++) if (!left.has(cellKey(grid, i, j))) return false;
      return true;
    };
    while (j1 < grid.ny && rowFull(j1)) j1++;
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) left.delete(cellKey(grid, i, j));
    out.push({ i0, i1, j0, j1 });
  }
  return out;
}

/** Cell set as grid-id ranges, e.g. "6-7/F-K + 3-5/F-H". */
export function cellsLabel(grid: Grid, cells: ReadonlySet<number>): string {
  if (cells.size === 0) return '(none)';
  return cellRects(grid, cells)
    .map((r) => `${grid.xIds[r.i0]}-${grid.xIds[r.i1]}/${grid.yIds[r.j0]}-${grid.yIds[r.j1]}`)
    .join(' + ');
}

/** Signed area (mm²): positive for counter-clockwise rings. */
export function signedArea(ring: readonly Point[]): number {
  let s = 0;
  for (let n = 0; n < ring.length; n++) {
    const a = ring[n]!;
    const b = ring[(n + 1) % ring.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}
