// Walls (poche with clean joins), the heavy outer line, openings and rails.
import type { ResolvedWall, Side } from '@opensu/model';
import type { LevelPlan, OpeningInfo } from '../analyse';
import { rect, rectUnionRings, type Pt, type Rect } from '../geom';
import { attrs, f, line, pathOfRings, rectEl, type View } from '../svg';
import { color, mm, stroke } from '../tokens';

const near = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1 && Math.abs(a[1] - b[1]) < 1;

/** How far a wall end must extend to close a corner or T with perpendicular walls. */
function endExtension(w: ResolvedWall, end: Pt, walls: readonly ResolvedWall[]): number {
  let e = 0;
  for (const o of walls) {
    if (o === w || o.orient === w.orient) continue;
    const onIt = o.orient === 'NS'
      ? Math.abs(o.a[0] - end[0]) < 1 && end[1] >= Math.min(o.a[1], o.b[1]) - 1 && end[1] <= Math.max(o.a[1], o.b[1]) + 1
      : Math.abs(o.a[1] - end[1]) < 1 && end[0] >= Math.min(o.a[0], o.b[0]) - 1 && end[0] <= Math.max(o.a[0], o.b[0]) + 1;
    if (onIt) e = Math.max(e, o.thickness / 2);
  }
  return e;
}

export function wallRects(plan: LevelPlan): Rect[] {
  const out: Rect[] = [];
  for (const w of plan.walls) {
    const ea = endExtension(w, w.a, plan.walls), eb = endExtension(w, w.b, plan.walls);
    const h = w.thickness / 2;
    if (w.orient === 'EW') out.push(rect(w.a[0] - ea, w.a[1] - h, w.b[0] + eb, w.a[1] + h));
    else out.push(rect(w.a[0] - h, w.a[1] - ea, w.a[0] + h, w.b[1] + eb));
  }
  // Parapets stand on the slab edge, inside the outdoor space.
  for (const e of plan.level.edges) {
    if (e.treatment !== 'parapet') continue;
    const sp = plan.byId.get(e.space);
    if (!sp) continue;
    out.push(railRect(e, sp.bbox, 0, mm.parapet));
  }
  return out;
}

/** Fence along the plot boundary (ground floor), minus gates. */
export function fenceRects(plan: LevelPlan): { rects: Rect[]; gates: { side: Side; r: Rect; kind: string }[] } {
  if (!plan.plot || !plan.house.site.fence) return { rects: [], gates: [] };
  const t = mm.fence / 2;
  const { x0, y0, x1, y1 } = plan.plot;
  const rects = [rect(x0 - t, y0 - t, x1 + t, y0 + t), rect(x0 - t, y1 - t, x1 + t, y1 + t), rect(x0 - t, y0 - t, x0 + t, y1 + t), rect(x1 - t, y0 - t, x1 + t, y1 + t)];
  return { rects, gates: plan.gates.map((g) => ({ side: g.side, r: g.gap, kind: g.kind })) };
}

function railRect(e: { orient: string; a: Pt; b: Pt }, spaceBox: Rect, inset: number, thick: number): Rect {
  if (e.orient === 'EW') {
    const inward = (spaceBox.y0 + spaceBox.y1) / 2 > e.a[1] ? 1 : -1;
    const y = e.a[1] + inward * inset;
    return rect(Math.min(e.a[0], e.b[0]), y, Math.max(e.a[0], e.b[0]), y + inward * thick);
  }
  const inward = (spaceBox.x0 + spaceBox.x1) / 2 > e.a[0] ? 1 : -1;
  const x = e.a[0] + inward * inset;
  return rect(x, Math.min(e.a[1], e.b[1]), x + inward * thick, Math.max(e.a[1], e.b[1]));
}

/** Remove the parts of an axis-aligned segment lying strictly inside any rect. */
function clipSegment(p: Pt, q: Pt, cut: readonly Rect[]): [Pt, Pt][] {
  const vertical = Math.abs(p[0] - q[0]) < 1e-6;
  const c = vertical ? p[0] : p[1];
  let parts: [number, number][] = [[Math.min(vertical ? p[1] : p[0], vertical ? q[1] : q[0]), Math.max(vertical ? p[1] : p[0], vertical ? q[1] : q[0])]];
  for (const r of cut) {
    const [lo, hi, a, b] = vertical ? [r.x0, r.x1, r.y0, r.y1] : [r.y0, r.y1, r.x0, r.x1];
    if (!(c > lo + 0.5 && c < hi - 0.5)) continue;
    const next: [number, number][] = [];
    for (const [s, e] of parts) {
      if (e <= a || s >= b) { next.push([s, e]); continue; }
      if (s < a) next.push([s, a]);
      if (e > b) next.push([b, e]);
    }
    parts = next;
  }
  return parts.filter(([s, e]) => e - s > 1).map(([s, e]) => (vertical ? [[c, s], [c, e]] : [[s, c], [e, c]]) as [Pt, Pt]);
}

export interface BuildingSvg { poche: string; fence: string; outline: string; wallBoxes: Rect[] }

export function drawWalls(plan: LevelPlan, v: View): BuildingSvg {
  const walls = wallRects(plan);
  const fence = fenceRects(plan);
  const gaps = plan.openings.filter((o) => o.thickness > 0).map((o) => o.gap);
  const gateGaps = fence.gates.map((g) => g.r);
  const rings = rectUnionRings(walls, gaps);
  const poche = `<path${attrs({ d: pathOfRings(rings, v), fill: color.wallFill, stroke: color.wallLine, 'stroke-width': stroke.wallOutline, 'stroke-linejoin': 'miter' })}/>`;
  // The plot fence is a site element: thinner, lighter, drawn under the house walls.
  const fenceRings = fence.rects.length ? rectUnionRings(fence.rects, gateGaps) : [];
  const fenceSvg = fenceRings.length
    ? `<path${attrs({ d: pathOfRings(fenceRings, v), fill: color.fenceFill, stroke: color.fenceLine, 'stroke-width': stroke.fence, 'stroke-linejoin': 'miter' })}/>`
    : '';

  // Heavy line on the outside faces of the building mass (interior floors +
  // walls), interrupted at openings and where it runs inside the fence.
  const interior = plan.spaces.filter((s) => !s.outdoor).flatMap((s) => s.parts.length ? cellsOfRings(s.rings) : []);
  const mass = rectUnionRings([...walls, ...interior]);
  const cut = [...gaps, ...fence.rects];
  const segs: [Pt, Pt][] = [];
  for (const r of mass) for (let i = 0; i < r.length; i++) segs.push(...clipSegment(r[i]!, r[(i + 1) % r.length]!, cut));
  const d = segs.map(([p, q]) => `M${f(v.x(p[0]))},${f(v.y(p[1]))}L${f(v.x(q[0]))},${f(v.y(q[1]))}`).join('');
  const outline = d ? `<path${attrs({ d, fill: 'none', stroke: color.wallOuter, 'stroke-width': stroke.wallOuter, 'stroke-linecap': 'square' })}/>` : '';
  return { poche, fence: fenceSvg, outline, wallBoxes: [...walls, ...fence.rects] };
}

/** Interior cells of rings as rects (for the building mass union). */
function cellsOfRings(rings: Pt[][]): Rect[] {
  const xs = [...new Set(rings.flat().map((p) => p[0]))].sort((a, b) => a - b);
  const ys = [...new Set(rings.flat().map((p) => p[1]))].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const cx = (xs[i]! + xs[i + 1]!) / 2, cy = (ys[j]! + ys[j + 1]!) / 2;
    if (inside(rings, cx, cy)) out.push({ x0: xs[i]!, x1: xs[i + 1]!, y0: ys[j]!, y1: ys[j + 1]! });
  }
  return out;
}

function inside(rings: Pt[][], x: number, y: number): boolean {
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]!, [xj, yj] = r[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ---------------------------------------------------------------------------
// Openings

export function drawOpenings(plan: LevelPlan, v: View): { below: string; above: string; swings: Rect[] } {
  let below = '';
  let above = '';
  const swings: Rect[] = [];
  for (const o of plan.openings) {
    const { op } = o;
    if (op.kind === 'window') below += windowSvg(o, v);
    else if (op.kind === 'sliding-door') below += slidingSvg(o, v);
    else if (op.kind === 'door' && o.swing) {
      above += doorSvg(o, v);
      swings.push(o.swing.box);
    }
  }
  return { below, above, swings };
}

/** Lines across the opening, at fractions of the wall thickness. */
function acrossLines(o: OpeningInfo, v: View, fracs: number[], a: Record<string, string | number>): string {
  const { op, thickness: t } = o;
  return fracs.map((fr) => {
    const off = -t / 2 + fr * t;
    if (op.orient === 'EW') return line(v.x(op.a[0]), v.y(op.a[1] + off), v.x(op.b[0]), v.y(op.a[1] + off), a);
    return line(v.x(op.a[0] + off), v.y(op.a[1]), v.x(op.a[0] + off), v.y(op.b[1]), a);
  }).join('');
}

function windowSvg(o: OpeningInfo, v: View): string {
  if (o.thickness <= 0) return '';
  let s = rectEl(v.rect(o.gap), { fill: color.window, stroke: 'none' });
  s += acrossLines(o, v, [0, 1], { stroke: color.windowLine, 'stroke-width': stroke.window });
  s += acrossLines(o, v, [0.4, 0.6], { stroke: color.glassLine, 'stroke-width': stroke.glass });
  return s;
}

function slidingSvg(o: OpeningInfo, v: View): string {
  if (o.thickness <= 0) return '';
  const { op } = o;
  let s = rectEl(v.rect(o.gap), { fill: color.window, stroke: 'none' });
  s += acrossLines(o, v, [0, 1], { stroke: color.windowLine, 'stroke-width': stroke.window });
  // Two panels overlapping at the middle, on either side of the centre line.
  const half = op.width / 2, lap = 60, pt = mm.slidingPanel;
  const panel = (from: number, to: number, off: number) => {
    const r = op.orient === 'EW'
      ? rect(from, op.a[1] + off - pt / 2, to, op.a[1] + off + pt / 2)
      : rect(op.a[0] + off - pt / 2, from, op.a[0] + off + pt / 2, to);
    return rectEl(v.rect(r), { fill: color.window, stroke: color.windowLine, 'stroke-width': stroke.glass });
  };
  const lo = op.orient === 'EW' ? op.a[0] : op.a[1];
  s += panel(lo, lo + half + lap / 2, -pt / 2 - 5) + panel(lo + half - lap / 2, lo + op.width, pt / 2 + 5);
  return s;
}

function doorSvg(o: OpeningInfo, v: View): string {
  const sw = o.swing!;
  const { op } = o;
  const [hx, hy] = v.p(sw.hingePt), [tx, ty] = v.p(sw.tipPt), [jx, jy] = v.p(sw.jambPt);
  const r = v.len(op.width);
  // Leaf as a thin rectangle along hinge -> tip, on the hinge side.
  const lt = v.len(mm.doorLeaf);
  const dx = Math.sign(tx - hx), dy = Math.sign(ty - hy);
  const towardJ = op.orient === 'EW' ? Math.sign(jx - hx) : Math.sign(jy - hy);
  const leaf = op.orient === 'EW'
    ? { x0: Math.min(hx, hx + towardJ * lt), x1: Math.max(hx, hx + towardJ * lt), y0: Math.min(hy, ty), y1: Math.max(hy, ty) }
    : { y0: Math.min(hy, hy + towardJ * lt), y1: Math.max(hy, hy + towardJ * lt), x0: Math.min(hx, tx), x1: Math.max(hx, tx) };
  void dx; void dy;
  // Arc from the tip to the far jamb; sweep chosen by the turn direction.
  const cross = (tx - hx) * (jy - hy) - (ty - hy) * (jx - hx);
  const sweep = cross > 0 ? 1 : 0;
  const arc = `<path${attrs({ d: `M${f(tx)},${f(ty)}A${f(r)},${f(r)} 0 0 ${sweep} ${f(jx)},${f(jy)}`, fill: 'none', stroke: color.doorArc, 'stroke-width': stroke.doorArc })}/>`;
  return arc + rectEl(leaf, { fill: color.furnitureFill, stroke: color.doorLeaf, 'stroke-width': stroke.doorLeaf * 0.8 });
}

// ---------------------------------------------------------------------------
// Rails on outdoor edges, gates

export function drawRails(plan: LevelPlan, v: View): string {
  // One outline per space and kind so corners join cleanly.
  const groups = new Map<string, { kind: 'glass-rail' | 'metal-rail'; rects: Rect[] }>();
  for (const e of plan.level.edges) {
    const sp = plan.byId.get(e.space);
    if (!sp || (e.treatment !== 'glass-rail' && e.treatment !== 'metal-rail')) continue;
    const thick = e.treatment === 'glass-rail' ? mm.glassRail : mm.metalRail;
    const r = railRect(e, sp.bbox, mm.railInset, thick);
    // Where another rail of the same space meets this end, stop at the
    // inset so the two rails close an L corner.
    const meets = (p: Pt) => plan.level.edges.some((o) => o !== e && o.space === e.space && o.treatment === e.treatment && o.orient !== e.orient && (near(o.a, p) || near(o.b, p)));
    const lo = e.orient === 'EW' ? (e.a[0] < e.b[0] ? e.a : e.b) : (e.a[1] < e.b[1] ? e.a : e.b);
    const hi = lo === e.a ? e.b : e.a;
    const s0 = meets(lo) ? mm.railInset : 0, s1 = meets(hi) ? mm.railInset : 0;
    const rr = e.orient === 'EW' ? { ...r, x0: r.x0 + s0, x1: r.x1 - s1 } : { ...r, y0: r.y0 + s0, y1: r.y1 - s1 };
    const key = `${e.space}|${e.treatment}`;
    const g = groups.get(key) ?? { kind: e.treatment, rects: [] };
    g.rects.push(rr);
    groups.set(key, g);
  }
  let s = '';
  for (const g of groups.values()) {
    const d = pathOfRings(rectUnionRings(g.rects), v);
    s += g.kind === 'glass-rail'
      ? `<path${attrs({ d, fill: color.glassRailFill, stroke: color.glassLine, 'stroke-width': stroke.rail })}/>`
      : `<path${attrs({ d, fill: color.furnitureFill, stroke: color.metalRail, 'stroke-width': stroke.rail * 1.3 })}/>`;
  }
  return s;
}

/** Outline of upper-level outdoor slabs (balconies, terraces). */
export function drawSlabEdges(plan: LevelPlan, v: View): string {
  if (plan.index === 0) return '';
  return plan.spaces.filter((s) => s.outdoor).map((s) => `<path${attrs({ d: pathOfRings(s.rings, v), fill: 'none', stroke: color.windowLine, 'stroke-width': stroke.window })}/>`).join('');
}

export function drawGates(plan: LevelPlan, v: View): string {
  const { gates } = fenceRects(plan);
  let s = '';
  for (const g of gates) {
    const r = v.rect(g.r);
    const horiz = g.side === 'N' || g.side === 'S';
    if (g.kind === 'sliding') {
      // Sliding gate: dashed track line along the opening.
      if (horiz) s += line(r.x0, (r.y0 + r.y1) / 2, r.x1, (r.y0 + r.y1) / 2, { stroke: color.doorLeaf, 'stroke-width': stroke.doorArc, 'stroke-dasharray': '5 3' });
      else s += line((r.x0 + r.x1) / 2, r.y0, (r.x0 + r.x1) / 2, r.y1, { stroke: color.doorLeaf, 'stroke-width': stroke.doorArc, 'stroke-dasharray': '5 3' });
    } else {
      // Swing gate: one leaf opening inwards.
      const inward = g.side === 'S' ? -1 : g.side === 'N' ? 1 : 0;
      const inwardX = g.side === 'W' ? 1 : g.side === 'E' ? -1 : 0;
      if (horiz) {
        const y = inward < 0 ? r.y0 : r.y1;
        const w = r.x1 - r.x0;
        s += line(r.x0, y, r.x0, y + inward * w, { stroke: color.doorLeaf, 'stroke-width': stroke.doorLeaf });
        s += `<path${attrs({ d: `M${f(r.x0)},${f(y + inward * w)}A${f(w)},${f(w)} 0 0 ${inward < 0 ? 1 : 0} ${f(r.x1)},${f(y)}`, fill: 'none', stroke: color.doorArc, 'stroke-width': stroke.doorArc })}/>`;
      } else {
        const x = inwardX > 0 ? r.x1 : r.x0;
        const h = r.y1 - r.y0;
        s += line(x, r.y1, x + inwardX * h, r.y1, { stroke: color.doorLeaf, 'stroke-width': stroke.doorLeaf });
        s += `<path${attrs({ d: `M${f(x + inwardX * h)},${f(r.y1)}A${f(h)},${f(h)} 0 0 ${inwardX > 0 ? 0 : 1} ${f(x)},${f(r.y0)}`, fill: 'none', stroke: color.doorArc, 'stroke-width': stroke.doorArc })}/>`;
      }
    }
  }
  return s;
}
