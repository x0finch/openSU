// Small axis-aligned geometry helpers (mm, model axes: X east, Y north).

export type Pt = [number, number];

export interface Rect { x0: number; y0: number; x1: number; y1: number }

export const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({
  x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1),
});

export const rectWH = (cx: number, cy: number, w: number, h: number): Rect =>
  ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });

export const width = (r: Rect) => r.x1 - r.x0;
export const height = (r: Rect) => r.y1 - r.y0;
export const area = (r: Rect) => Math.max(0, width(r)) * Math.max(0, height(r));
export const center = (r: Rect): Pt => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];

export const inflate = (r: Rect, d: number): Rect => ({ x0: r.x0 - d, y0: r.y0 - d, x1: r.x1 + d, y1: r.y1 + d });

/** Open-interior overlap: touching edges do not count. */
export function overlaps(a: Rect, b: Rect, eps = 0.5): boolean {
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.y0 < b.y1 - eps && b.y0 < a.y1 - eps;
}

export function intersection(a: Rect, b: Rect): Rect | null {
  const r = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
  return r.x0 < r.x1 && r.y0 < r.y1 ? r : null;
}

export function contains(outer: Rect, inner: Rect, eps = 0.5): boolean {
  return inner.x0 >= outer.x0 - eps && inner.y0 >= outer.y0 - eps && inner.x1 <= outer.x1 + eps && inner.y1 <= outer.y1 + eps;
}

/** Gap between two rects (0 when they touch or overlap). */
export function distance(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.hypot(dx, dy);
}

export function bboxOfPoints(pts: readonly Pt[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

export function unionBox(rs: readonly Rect[]): Rect | null {
  if (rs.length === 0) return null;
  return rs.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
}

/** Point in polygon (even-odd over all rings). */
export function pointInRings(rings: readonly (readonly Pt[])[], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

const uniqSorted = (v: number[]) => [...new Set(v.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);

/**
 * Compressed cell grid of a set of rectangles: `cover` marks cells inside any
 * of `add` and outside all of `sub`.
 */
function coverage(add: readonly Rect[], sub: readonly Rect[]) {
  const xs = uniqSorted([...add, ...sub].flatMap((r) => [r.x0, r.x1]));
  const ys = uniqSorted([...add, ...sub].flatMap((r) => [r.y0, r.y1]));
  const nx = xs.length - 1, ny = ys.length - 1;
  const cover = new Uint8Array(Math.max(0, nx * ny));
  const idx = (v: number[], q: number) => {
    // Binary search for exact coordinate.
    let lo = 0, hi = v.length - 1;
    const t = Math.round(q * 1000) / 1000;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (v[mid]! < t) lo = mid + 1; else hi = mid;
    }
    return lo;
  };
  const paint = (r: Rect, val: number) => {
    const i0 = idx(xs, r.x0), i1 = idx(xs, r.x1), j0 = idx(ys, r.y0), j1 = idx(ys, r.y1);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) cover[j * nx + i] = val;
  };
  for (const r of add) if (r.x1 > r.x0 && r.y1 > r.y0) paint(r, 1);
  for (const r of sub) if (r.x1 > r.x0 && r.y1 > r.y0) paint(r, 0);
  return { xs, ys, nx, ny, cover };
}

/**
 * Boundary rings of (union of `add`) minus (union of `sub`). Rings are
 * simplified (collinear vertices removed). Outer rings CCW, holes CW (model
 * axes). Used for the wall poche so joins are clean by construction.
 */
export function rectUnionRings(add: readonly Rect[], sub: readonly Rect[] = []): Pt[][] {
  const { xs, ys, nx, ny, cover } = coverage(add, sub);
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : cover[j * nx + i]!);
  // Directed boundary edges with the filled cell on the left.
  const next = new Map<string, Pt[]>();
  const key = (p: Pt) => `${p[0]},${p[1]}`;
  const addEdge = (a: Pt, b: Pt) => {
    const k = key(a);
    const list = next.get(k);
    if (list) list.push(b); else next.set(k, [b]);
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!at(i, j)) continue;
      const x0 = xs[i]!, x1 = xs[i + 1]!, y0 = ys[j]!, y1 = ys[j + 1]!;
      if (!at(i, j - 1)) addEdge([x0, y0], [x1, y0]);
      if (!at(i + 1, j)) addEdge([x1, y0], [x1, y1]);
      if (!at(i, j + 1)) addEdge([x1, y1], [x0, y1]);
      if (!at(i - 1, j)) addEdge([x0, y1], [x0, y0]);
    }
  }
  const rings: Pt[][] = [];
  const turn = (din: Pt, dout: Pt) => din[0] * dout[1] - din[1] * dout[0];
  while (next.size) {
    const startKey = next.keys().next().value as string;
    const [sx, sy] = startKey.split(',').map(Number) as [number, number];
    const ring: Pt[] = [[sx, sy]];
    let cur: Pt = [sx, sy];
    let dir: Pt | null = null;
    for (let guard = 0; guard < 1e6; guard++) {
      const k = key(cur);
      const outs = next.get(k);
      if (!outs || outs.length === 0) break;
      let pick = 0;
      if (outs.length > 1 && dir) {
        // At a pinch point prefer the left-most turn so rings stay simple.
        let best = -Infinity;
        outs.forEach((o, n) => {
          const d: Pt = [Math.sign(o[0] - cur[0]), Math.sign(o[1] - cur[1])];
          const t = turn(dir!, d);
          if (t > best) { best = t; pick = n; }
        });
      }
      const nxt = outs.splice(pick, 1)[0]!;
      if (outs.length === 0) next.delete(k);
      dir = [Math.sign(nxt[0] - cur[0]), Math.sign(nxt[1] - cur[1])];
      cur = nxt;
      if (cur[0] === sx && cur[1] === sy) break;
      ring.push(cur);
    }
    rings.push(simplify(ring));
  }
  return rings.filter((r) => r.length >= 3);
}

/** Drop collinear vertices from a closed rectilinear ring. */
export function simplify(ring: Pt[]): Pt[] {
  const out: Pt[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n]!, c = ring[i]!, q = ring[(i + 1) % n]!;
    const cross = (c[0] - p[0]) * (q[1] - c[1]) - (c[1] - p[1]) * (q[0] - c[0]);
    if (Math.abs(cross) > 1e-9) out.push(c);
  }
  return out;
}

/** Largest axis-aligned rectangle inside the rings (on the vertex grid). */
export function largestRectIn(rings: readonly (readonly Pt[])[]): Rect | null {
  const xs = uniqSorted(rings.flatMap((r) => r.map((p) => p[0])));
  const ys = uniqSorted(rings.flatMap((r) => r.map((p) => p[1])));
  const nx = xs.length - 1, ny = ys.length - 1;
  if (nx < 1 || ny < 1) return null;
  const inside: boolean[][] = [];
  for (let j = 0; j < ny; j++) {
    inside.push([]);
    for (let i = 0; i < nx; i++) inside[j]!.push(pointInRings(rings, (xs[i]! + xs[i + 1]!) / 2, (ys[j]! + ys[j + 1]!) / 2));
  }
  let best: Rect | null = null;
  let bestA = 0;
  for (let j0 = 0; j0 < ny; j0++) for (let i0 = 0; i0 < nx; i0++) {
    if (!inside[j0]![i0]) continue;
    let maxI = nx;
    for (let j1 = j0; j1 < ny && inside[j1]![i0]; j1++) {
      let i1 = i0;
      while (i1 < maxI && inside[j1]![i1]) i1++;
      maxI = i1;
      const r = { x0: xs[i0]!, y0: ys[j0]!, x1: xs[maxI]!, y1: ys[j1 + 1]! };
      // Prefer area, but penalise slivers (they are useless for furniture).
      const a = area(r) * Math.min(1, Math.min(width(r), height(r)) / 1500);
      if (a > bestA) { bestA = a; best = r; }
    }
  }
  return best;
}

/** Rectangles (vertex-grid cells merged per row) covering the rings. */
export function cellRectsIn(rings: readonly (readonly Pt[])[]): Rect[] {
  const xs = uniqSorted(rings.flatMap((r) => r.map((p) => p[0])));
  const ys = uniqSorted(rings.flatMap((r) => r.map((p) => p[1])));
  const out: Rect[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    let start = -1;
    for (let i = 0; i <= xs.length - 1; i++) {
      const ins = i < xs.length - 1 && pointInRings(rings, (xs[i]! + xs[i + 1]!) / 2, (ys[j]! + ys[j + 1]!) / 2);
      if (ins && start < 0) start = i;
      if (!ins && start >= 0) {
        out.push({ x0: xs[start]!, y0: ys[j]!, x1: xs[i]!, y1: ys[j + 1]! });
        start = -1;
      }
    }
  }
  return out;
}
