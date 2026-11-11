// Column CSG for everything that is box-like in plan: walls, slabs, decks,
// kerbs, fences, canopies, steps, paving. Solids are axis-aligned in plan
// with a flat bottom and a planar top (sloped under mono roofs); voids are
// boxes that cut solids with given tags (openings, gates).
//
// The plan is split into columns at every solid / void boundary. Each
// column holds disjoint z segments, each owned by the highest-priority
// solid covering it. Boundary faces are then emitted between columns
// (vertical) and at segment ends (horizontal) and merged into large
// rectangles. By construction there are no overlapping coplanar faces, no
// gaps at corners and no internal faces.
import { type PartSpec, Parts, type V3 } from './mesh';

export interface Plane { a: number; b: number; c: number }
export const flat = (z: number): Plane => ({ a: z, b: 0, c: 0 });
export const evalPlane = (p: Plane, x: number, y: number) => p.a + p.b * x + p.c * y;
const planeKey = (p: Plane) => `${Math.round(p.a * 100)},${Math.round(p.b * 1e7)},${Math.round(p.c * 1e7)}`;

export interface Solid {
  x0: number; y0: number; x1: number; y1: number;
  z0: number;
  top: Plane;
  part: PartSpec;
  /** Higher wins where solids overlap. */
  prio: number;
  /** Voids cut solids whose tag they list. */
  tag: string;
  /** The top lies on a roof underside: no top face (the roof covers it). */
  roofTop?: boolean;
  /** Part that receives the up-facing top face instead of `part` (floor finish on a slab). */
  topPart?: PartSpec;
}

export interface Void {
  x0: number; y0: number; x1: number; y1: number;
  z0: number; z1: number;
  tags: readonly string[];
}

interface Bound { p: Plane; v: number; roof: boolean }
interface Seg { bot: Bound; top: Bound; solid: Solid }

const r1 = (v: number) => Math.round(v * 10) / 10;

function uniqueSorted(values: number[]): number[] {
  const s = [...new Set(values.map(r1))].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (out.length === 0 || v - out[out.length - 1]! > 0.4) out.push(v);
  return out;
}

function lowerIndex(arr: readonly number[], v: number): number {
  // Index of the breakpoint nearest to v.
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < v - 0.45) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface MassingOptions {
  /** Ground level: no bottom faces at or below it. */
  ground: number;
  /** True when a point lies inside the building (used to tag exterior faces). */
  inside: (x: number, y: number, z: number) => boolean;
  /** Part for an up-facing top face at height z over plan point (x, y), overriding the solid's (e.g. floor finish in a doorway). */
  topPart?: (solid: Solid, z: number, x: number, y: number) => PartSpec | undefined;
  /** Part for a down-facing bottom face (e.g. a ceiling under a terrace slab). */
  bottomPart?: (solid: Solid, z: number, x: number, y: number) => PartSpec | undefined;
}

/** Column grid kept after `emit` for section queries. */
interface Grid { xs: number[]; ys: number[]; segs: Seg[][] }

export class Massing {
  readonly solids: Solid[] = [];
  readonly voids: Void[] = [];
  private grid: Grid | null = null;

  add(s: Solid): void {
    if (s.x1 - s.x0 < 0.5 || s.y1 - s.y0 < 0.5) return;
    this.solids.push(s);
  }

  cut(v: Void): void {
    if (v.x1 - v.x0 < 0.5 || v.y1 - v.y0 < 0.5 || v.z1 - v.z0 < 0.5) return;
    this.voids.push(v);
  }

  /** Segments of the column containing the plan point (for tests and queries). */
  probe(x: number, y: number): { z0: number; z1: number; part: string }[] {
    const ss = this.solids.filter((s) => s.x0 <= x && x <= s.x1 && s.y0 <= y && y <= s.y1);
    const vs = this.voids.filter((v) => v.x0 <= x && x <= v.x1 && v.y0 <= y && y <= v.y1);
    return columnSegments(ss, vs, x, y).map((s) => ({ z0: s.bot.v, z1: s.top.v, part: s.solid.part.id }));
  }

  emit(parts: Parts, opts: MassingOptions): void {
    const xs = uniqueSorted(this.solids.flatMap((s) => [s.x0, s.x1]).concat(this.voids.flatMap((v) => [v.x0, v.x1])));
    const ys = uniqueSorted(this.solids.flatMap((s) => [s.y0, s.y1]).concat(this.voids.flatMap((v) => [v.y0, v.y1])));
    const nx = xs.length - 1;
    const ny = ys.length - 1;
    const solidLists: number[][] = Array.from({ length: nx * ny }, () => []);
    const voidLists: number[][] = Array.from({ length: nx * ny }, () => []);
    const fill = (lists: number[][], x0: number, x1: number, y0: number, y1: number, k: number) => {
      const i0 = lowerIndex(xs, x0), i1 = lowerIndex(xs, x1);
      const j0 = lowerIndex(ys, y0), j1 = lowerIndex(ys, y1);
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) lists[i * ny + j]!.push(k);
    };
    this.solids.forEach((s, k) => fill(solidLists, s.x0, s.x1, s.y0, s.y1, k));
    this.voids.forEach((v, k) => fill(voidLists, v.x0, v.x1, v.y0, v.y1, k));

    const segs: Seg[][] = new Array(nx * ny);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const k = i * ny + j;
        const cx = (xs[i]! + xs[i + 1]!) / 2;
        const cy = (ys[j]! + ys[j + 1]!) / 2;
        segs[k] = columnSegments(solidLists[k]!.map((n) => this.solids[n]!), voidLists[k]!.map((n) => this.voids[n]!), cx, cy);
      }
    }
    this.grid = { xs, ys, segs };
    const col = (i: number, j: number): Seg[] => (i < 0 || j < 0 || i >= nx || j >= ny ? [] : segs[i * ny + j]!);

    // ---- horizontal faces, merged into rectangles per (part, plane, side)
    const hGroups = new Map<string, { part: PartSpec; plane: Plane; up: boolean; cells: number[] }>();
    const addH = (solid: Solid, plane: Plane, up: boolean, cell: number) => {
      let part = up && solid.topPart ? solid.topPart : solid.part;
      const over = up ? opts.topPart : opts.bottomPart;
      if (over) {
        const x = (xs[Math.floor(cell / ny)]! + xs[Math.floor(cell / ny) + 1]!) / 2, y = (ys[cell % ny]! + ys[(cell % ny) + 1]!) / 2;
        part = over(solid, evalPlane(plane, x, y), x, y) ?? part;
      }
      const key = `${part.id}|${up ? 'u' : 'd'}|${planeKey(plane)}`;
      let g = hGroups.get(key);
      if (!g) hGroups.set(key, (g = { part, plane, up, cells: [] }));
      g.cells.push(cell);
    };
    for (let k = 0; k < nx * ny; k++) {
      const list = segs[k]!;
      list.forEach((s, n) => {
        const next = list[n + 1];
        const prev = list[n - 1];
        if ((!next || next.bot.v > s.top.v + 0.5) && !s.top.roof) addH(s.solid, s.top.p, true, k);
        if ((!prev || prev.top.v < s.bot.v - 0.5) && s.bot.v > opts.ground + 0.5) addH(s.solid, s.bot.p, false, k);
      });
    }
    for (const g of hGroups.values()) {
      const pb = parts.get(g.part);
      for (const [i0, i1, j0, j1] of mergeRects(g.cells, ny)) {
        const x0 = xs[i0]!, x1 = xs[i1]!, y0 = ys[j0]!, y1 = ys[j1]!;
        const P = (x: number, y: number): V3 => [x, y, evalPlane(g.plane, x, y)];
        const quad = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
        pb.polygon(g.up ? quad : quad.reverse());
      }
    }

    // ---- vertical faces between neighbouring columns
    interface VFrag { from: number; to: number; piece: Piece }
    const vGroups = new Map<string, { axis: 'x' | 'y'; line: number; sign: 1 | -1; piece: Piece; frags: VFrag[] }>();
    const addV = (axis: 'x' | 'y', line: number, sign: 1 | -1, from: number, to: number, piece: Piece) => {
      const key = `${axis}|${line}|${sign}|${piece.solid.part.id}|${planeKey(piece.bot.p)}|${planeKey(piece.top.p)}`;
      let g = vGroups.get(key);
      if (!g) vGroups.set(key, (g = { axis, line, sign, piece, frags: [] }));
      g.frags.push({ from, to, piece });
    };
    for (let i = -1; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const A = col(i, j), B = col(i + 1, j);
        if (A.length === 0 && B.length === 0) continue;
        const x = xs[i + 1]!, ya = ys[j]!, yb = ys[j + 1]!, ym = (ya + yb) / 2;
        for (const p of difference(A, B, x, ym)) addV('x', x, 1, ya, yb, p);
        for (const p of difference(B, A, x, ym)) addV('x', x, -1, ya, yb, p);
      }
    }
    for (let i = 0; i < nx; i++) {
      for (let j = -1; j < ny; j++) {
        const A = col(i, j), B = col(i, j + 1);
        if (A.length === 0 && B.length === 0) continue;
        const y = ys[j + 1]!, xa = xs[i]!, xb = xs[i + 1]!, xm = (xa + xb) / 2;
        for (const p of difference(A, B, xm, y)) addV('y', y, 1, xa, xb, p);
        for (const p of difference(B, A, xm, y)) addV('y', y, -1, xa, xb, p);
      }
    }
    for (const g of vGroups.values()) {
      g.frags.sort((a, b) => a.from - b.from);
      const runs: [number, number][] = [];
      for (const f of g.frags) {
        const last = runs[runs.length - 1];
        if (last && Math.abs(last[1] - f.from) < 0.01) last[1] = f.to;
        else runs.push([f.from, f.to]);
      }
      const pb = parts.get(g.piece.solid.part);
      for (const [a, b] of runs) {
        const pt = (t: number, top: boolean): V3 => {
          const x = g.axis === 'x' ? g.line : t;
          const y = g.axis === 'x' ? t : g.line;
          return [x, y, evalPlane(top ? g.piece.top.p : g.piece.bot.p, x, y)];
        };
        const z0a = pt(a, false), z0b = pt(b, false), z1a = pt(a, true), z1b = pt(b, true);
        if (z1a[2] - z0a[2] < 0.3 && z1b[2] - z0b[2] < 0.3) continue;
        // Nothing below grade is ever seen (ground-floor finish slab).
        if (z1a[2] <= opts.ground + 0.5 && z1b[2] <= opts.ground + 0.5) continue;
        // Counter-clockwise seen from the side the face looks at.
        const ccw = (g.axis === 'x') === (g.sign === 1);
        const quad = ccw ? [z0a, z0b, z1b, z1a] : [z0b, z0a, z1a, z1b];
        const mid = (a + b) / 2;
        const zm = (z0a[2] + z0b[2] + z1a[2] + z1b[2]) / 4;
        const off = 200 * g.sign;
        const ext = g.axis === 'x' ? !opts.inside(g.line + off, mid, zm) : !opts.inside(mid, g.line + off, zm);
        pb.polygon(quad, ext);
      }
    }
  }

  /**
   * Horizontal section at height z (after `emit`): plan rectangles of the
   * columns where an accepted solid passes through z, merged.
   */
  section(z: number, accept: (s: Solid) => boolean): [number, number, number, number][] {
    const g = this.grid;
    if (!g) return [];
    const ny = g.ys.length - 1;
    const cells: number[] = [];
    g.segs.forEach((list, k) => {
      if (list.some((s) => s.bot.v < z - 0.5 && s.top.v > z + 0.5 && accept(s.solid))) cells.push(k);
    });
    return mergeRects(cells, ny).map(([i0, i1, j0, j1]) => [g.xs[i0]!, g.ys[j0]!, g.xs[i1]!, g.ys[j1]!]);
  }
}

interface Piece { bot: Bound; top: Bound; solid: Solid }

/** Disjoint z segments of one column, each owned by one solid. */
function columnSegments(solids: Solid[], voids: Void[], cx: number, cy: number): Seg[] {
  if (solids.length === 0) return [];
  const bounds: Bound[] = [];
  const spans: { lo: number; hi: number; s: Solid }[] = [];
  for (const s of solids) {
    const hi = evalPlane(s.top, cx, cy);
    if (hi - s.z0 < 0.3) continue;
    spans.push({ lo: s.z0, hi, s });
    bounds.push({ p: flat(s.z0), v: s.z0, roof: false }, { p: s.top, v: hi, roof: !!s.roofTop });
  }
  for (const v of voids) bounds.push({ p: flat(v.z0), v: v.z0, roof: false }, { p: flat(v.z1), v: v.z1, roof: false });
  bounds.sort((a, b) => a.v - b.v || Number(a.roof) - Number(b.roof));
  const uniq: Bound[] = [];
  for (const b of bounds) {
    const last = uniq[uniq.length - 1];
    if (last && b.v - last.v < 0.05) {
      if (b.roof) last.roof = true;
      continue;
    }
    uniq.push({ ...b });
  }
  const out: Seg[] = [];
  for (let n = 0; n + 1 < uniq.length; n++) {
    const lo = uniq[n]!, hi = uniq[n + 1]!;
    const zm = (lo.v + hi.v) / 2;
    let win: Solid | null = null;
    for (const sp of spans) {
      if (sp.lo > zm || sp.hi < zm) continue;
      if (voids.some((v) => v.z0 <= zm && zm <= v.z1 && v.tags.includes(sp.s.tag))) continue;
      if (!win || sp.s.prio > win.prio) win = sp.s;
    }
    if (!win) continue;
    const last = out[out.length - 1];
    if (last && last.solid === win && Math.abs(last.top.v - lo.v) < 0.05) last.top = hi;
    else out.push({ bot: lo, top: hi, solid: win });
  }
  // A top bound counts as a roof underside only when it ends the column there.
  for (const s of out) if (s.top.roof && s.top.v < Math.max(...spans.map((sp) => sp.hi)) - 0.05) s.top = { ...s.top, roof: false };
  return out;
}

/** Parts of A's segments not covered by B (evaluated at a plan point on the shared edge). */
function difference(A: Seg[], B: Seg[], x: number, y: number): Piece[] {
  const out: Piece[] = [];
  const at = (b: Bound): Bound => ({ p: b.p, v: evalPlane(b.p, x, y), roof: b.roof });
  const bs = B.map((s) => ({ lo: at(s.bot), hi: at(s.top) }));
  for (const a of A) {
    let pieces: { lo: Bound; hi: Bound }[] = [{ lo: at(a.bot), hi: at(a.top) }];
    for (const b of bs) {
      const next: { lo: Bound; hi: Bound }[] = [];
      for (const p of pieces) {
        if (b.hi.v <= p.lo.v + 0.05 || b.lo.v >= p.hi.v - 0.05) { next.push(p); continue; }
        if (b.lo.v > p.lo.v + 0.05) next.push({ lo: p.lo, hi: b.lo });
        if (b.hi.v < p.hi.v - 0.05) next.push({ lo: b.hi, hi: p.hi });
      }
      pieces = next;
    }
    for (const p of pieces) if (p.hi.v - p.lo.v > 0.3) out.push({ bot: p.lo, top: p.hi, solid: a.solid });
  }
  return out;
}

/** Greedy merge of grid cells (keys i * ny + j) into rectangles [i0, i1, j0, j1). */
function mergeRects(cells: number[], ny: number): [number, number, number, number][] {
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
