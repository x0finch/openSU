// Roofs: mono / gable / hip slabs of constant vertical depth (fascia boards
// below, tiles on top, soffit underneath), flat roofs and canopies.
//
// Height convention: the underside of a pitched roof at its eave wall line
// is the top of `onLevel` plus `eaveOffset`; it rises with the pitch away
// from the eave. Walls of `onLevel` under the roof rise to that underside
// (gable / clerestory infill), so the roof sits on them without gaps.
import type { ResolvedRoof } from '@opensu/model';
import { CANOPY, FLAT_ROOF, POST, ROOF_DEPTH, TILE_EDGE, VERGE } from './constants';
import { type Ctx, grow, intersect, type Rect } from './context';
import { evalPlane, flat, type Plane } from './massing';
import type { V3 } from './mesh';

type Dir = 'N' | 'S' | 'E' | 'W';

export interface PitchedRoof {
  roof: ResolvedRoof;
  li: number;
  /** Footprint of the roof cells (wall centre lines). */
  bbox: Rect;
  cells: Rect[];
  /** Facets: plan region (convex polygon, CCW) and underside plane. */
  planeAt: (x: number, y: number) => Plane;
  t: number;
}

function fallPlane(fall: Dir, bbox: Rect, zLow: number, t: number): Plane {
  const [x0, y0, x1, y1] = bbox;
  switch (fall) {
    case 'N': return { a: zLow + y1 * t, b: 0, c: -t };
    case 'S': return { a: zLow - y0 * t, b: 0, c: t };
    case 'E': return { a: zLow + x1 * t, b: -t, c: 0 };
    case 'W': return { a: zLow - x0 * t, b: t, c: 0 };
  }
}

export function pitchedRoofs(ctx: Ctx): PitchedRoof[] {
  const out: PitchedRoof[] = [];
  for (const roof of ctx.house.roofs) {
    if (roof.kind === 'flat' || roof.kind === 'canopy' || !roof.bbox) continue;
    const li = ctx.levelIndex(roof.onLevel);
    if (li < 0) continue;
    const lv = ctx.levels[li]!;
    const bbox: Rect = [roof.bbox.x0, roof.bbox.y0, roof.bbox.x1, roof.bbox.y1];
    const t = Math.tan(((roof.pitchDeg ?? 0) * Math.PI) / 180);
    const zLow = lv.top + roof.eaveOffset;
    const cells = roofCells(ctx, roof);
    let planeAt: (x: number, y: number) => Plane;
    if (roof.kind === 'mono') {
      const p = fallPlane(roof.fall ?? 'S', bbox, zLow, t);
      planeAt = () => p;
    } else if (roof.kind === 'gable') {
      const ew = (roof.ridge ?? 'EW') === 'EW';
      const mid = ew ? (bbox[1] + bbox[3]) / 2 : (bbox[0] + bbox[2]) / 2;
      const lo = fallPlane(ew ? 'S' : 'W', bbox, zLow, t);
      const hi = fallPlane(ew ? 'N' : 'E', bbox, zLow, t);
      planeAt = (x, y) => ((ew ? y : x) < mid ? lo : hi);
    } else {
      const ps = (['S', 'N', 'W', 'E'] as const).map((d) => fallPlane(d, bbox, zLow, t));
      planeAt = (x, y) => ps.reduce((m, p) => (evalPlane(p, x, y) < evalPlane(m, x, y) ? p : m), ps[0]!);
    }
    out.push({ roof, li, bbox, cells, planeAt, t });
  }
  return out;
}

function roofCells(ctx: Ctx, roof: ResolvedRoof): Rect[] {
  const cells: number[] = [];
  for (let i = 0; i < ctx.nx; i++) {
    for (let j = 0; j < ctx.ny; j++) {
      const cx = (ctx.xs[i]! + ctx.xs[i + 1]!) / 2, cy = (ctx.ys[j]! + ctx.ys[j + 1]!) / 2;
      if (inRings(roof.rings, cx, cy)) cells.push(i * ctx.ny + j);
    }
  }
  return ctx.rects(cells);
}

function inRings(rings: readonly (readonly [number, number])[][], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Pieces of a plan rectangle that lie in the roof's wall zone (its cells
 * grown by half an exterior wall), each with the underside plane it rises
 * to. Gables split at the ridge; hips are chunked (approximate).
 */
export function roofZonePieces(r: PitchedRoof, rect: Rect, wallHalf = 120): { rect: Rect; plane: Plane }[] {
  const out: { rect: Rect; plane: Plane }[] = [];
  for (const cell of r.cells) {
    const part = intersect(rect, grow(cell, wallHalf));
    if (!part) continue;
    if (r.roof.kind === 'mono') {
      out.push({ rect: part, plane: r.planeAt(0, 0) });
    } else if (r.roof.kind === 'gable') {
      const ew = (r.roof.ridge ?? 'EW') === 'EW';
      const mid = ew ? (r.bbox[1] + r.bbox[3]) / 2 : (r.bbox[0] + r.bbox[2]) / 2;
      const halves: Rect[] = ew
        ? [[part[0], part[1], part[2], Math.min(part[3], mid)], [part[0], Math.max(part[1], mid), part[2], part[3]]]
        : [[part[0], part[1], Math.min(part[2], mid), part[3]], [Math.max(part[0], mid), part[1], part[2], part[3]]];
      for (const h of halves) if (h[2] - h[0] > 0.5 && h[3] - h[1] > 0.5) out.push({ rect: h, plane: r.planeAt((h[0] + h[2]) / 2, (h[1] + h[3]) / 2) });
    } else {
      const step = 300;
      const nxs = Math.max(1, Math.ceil((part[2] - part[0]) / step)), nys = Math.max(1, Math.ceil((part[3] - part[1]) / step));
      for (let a = 0; a < nxs; a++) {
        for (let b = 0; b < nys; b++) {
          const c: Rect = [part[0] + ((part[2] - part[0]) * a) / nxs, part[1] + ((part[3] - part[1]) * b) / nys, part[0] + ((part[2] - part[0]) * (a + 1)) / nxs, part[1] + ((part[3] - part[1]) * (b + 1)) / nys];
          out.push({ rect: c, plane: r.planeAt((c[0] + c[2]) / 2, (c[1] + c[3]) / 2) });
        }
      }
    }
  }
  return out;
}

/** Walls of the roofed level rise to the underside; infill along the roof outline. */
export function addRoofWalls(ctx: Ctx, roofs: PitchedRoof[]): void {
  for (const r of roofs) {
    const lv = ctx.levels[r.li]!;
    const part = { id: `${lv.level.id}:wall`, level: lv.level.id, role: 'wall' as const, material: 'wall' as const };
    const rects: Rect[] = [...lv.bands];
    // Infill walls along the outline of the roof cells (from the level top up).
    for (const ring of r.roof.rings) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i]!, [bx, by] = ring[(i + 1) % ring.length]!;
        const h = 120;
        const rect: Rect = ax === bx
          ? [ax - h, Math.min(ay, by) - h, ax + h, Math.max(ay, by) + h]
          : [Math.min(ax, bx) - h, ay - h, Math.max(ax, bx) + h, ay + h];
        for (const p of roofZonePieces(r, rect)) {
          ctx.massing.add({ x0: p.rect[0], y0: p.rect[1], x1: p.rect[2], y1: p.rect[3], z0: lv.top, top: p.plane, part, prio: 10, tag: 'house', roofTop: true });
        }
      }
    }
    for (const band of rects) {
      for (const p of roofZonePieces(r, band)) {
        ctx.massing.add({ x0: p.rect[0], y0: p.rect[1], x1: p.rect[2], y1: p.rect[3], z0: lv.elev, top: p.plane, part, prio: 10, tag: 'house', roofTop: true });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Roof slabs

interface Edge { a: [number, number]; b: [number, number]; off: number; side: boolean }

/** Offset of each outline piece: eave/high edge, verge, or clipped against a higher neighbour. */
function outlineEdges(ctx: Ctx, r: PitchedRoof, all: PitchedRoof[]): Edge[] {
  const ring = r.roof.rings[0]!;
  const over = r.roof.overhang;
  const verge = over > 0 ? Math.min(VERGE, over) : 0;
  const pieces: Edge[] = [];
  const upper = ctx.levels[r.li + 1];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const vertical = a[0] === b[0];
    const along = vertical ? ctx.ys : ctx.xs;
    const lo = Math.min(vertical ? a[1] : a[0], vertical ? b[1] : b[0]);
    const hi = Math.max(vertical ? a[1] : a[0], vertical ? b[1] : b[0]);
    const cuts = [lo, ...along.filter((v) => v > lo && v < hi), hi];
    const dirSign = vertical ? Math.sign(b[1] - a[1]) : Math.sign(b[0] - a[0]);
    // Outward normal of a CCW ring is to the right of the walking direction.
    const out: [number, number] = vertical ? [dirSign, 0] : [0, -dirSign];
    const segs = dirSign > 0 ? cuts.slice(0, -1).map((v, k) => [v, cuts[k + 1]!]) : cuts.slice(0, -1).map((v, k) => [cuts[k + 1]!, v]).reverse();
    for (const [s0, s1] of segs as [number, number][]) {
      const m = (s0 + s1) / 2;
      const px = vertical ? a[0] : m, py = vertical ? m : a[1];
      const ox = px + out[0] * 1, oy = py + out[1] * 1;
      const topHere = evalPlane(r.planeAt(px - out[0], py - out[1]), px, py) + ROOF_DEPTH;
      let off: number;
      const higher = all.some((o) => o !== r && o.cells.some((c) => ox > c[0] && ox < c[2] && oy > c[1] && oy < c[3]) && evalPlane(o.planeAt(ox, oy), px, py) > topHere);
      const taller = upper && ctx.spaceAt(upper.index, ox, oy) && !ctx.spaceAt(upper.index, ox, oy)!.outdoor;
      if (higher || taller) off = -120;
      else {
        const ridgeEW = r.roof.kind === 'mono' ? r.roof.fall === 'N' || r.roof.fall === 'S' : (r.roof.ridge ?? 'EW') === 'EW';
        const eave = r.roof.kind === 'hip' || (vertical ? !ridgeEW : ridgeEW);
        off = eave ? over : verge;
      }
      const pa: [number, number] = vertical ? [a[0], s0] : [s0, a[1]];
      const pb: [number, number] = vertical ? [a[0], s1] : [s1, a[1]];
      const last = pieces[pieces.length - 1];
      if (last && last.off === off && (last.a[0] === last.b[0]) === vertical && last.b[0] === pa[0] && last.b[1] === pa[1]) last.b = pb;
      else pieces.push({ a: pa, b: pb, off, side: true });
    }
  }
  // Join the first and last piece when collinear with the same offset.
  if (pieces.length > 1) {
    const f = pieces[0]!, l = pieces[pieces.length - 1]!;
    if (f.off === l.off && (f.a[0] === f.b[0]) === (l.a[0] === l.b[0]) && l.b[0] === f.a[0] && l.b[1] === f.a[1]) {
      f.a = l.a;
      pieces.pop();
    }
  }
  return pieces;
}

/** Offset a rectilinear CCW outline, each edge by its own distance (outward). */
function offsetOutline(edges: Edge[]): [number, number][] {
  const n = edges.length;
  const shifted = edges.map((e) => {
    const dx = Math.sign(e.b[0] - e.a[0]), dy = Math.sign(e.b[1] - e.a[1]);
    const nx = dy, ny = -dx;
    return { a: [e.a[0] + nx * e.off, e.a[1] + ny * e.off], b: [e.b[0] + nx * e.off, e.b[1] + ny * e.off], vertical: dx === 0 };
  });
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p = shifted[(i - 1 + n) % n]!, q = shifted[i]!;
    if (p.vertical !== q.vertical) {
      out.push(p.vertical ? [p.a[0]!, q.a[1]!] : [q.a[0]!, p.a[1]!]);
    } else {
      // Collinear pieces with different offsets: a jog.
      out.push([p.b[0]!, p.b[1]!], [q.a[0]!, q.a[1]!]);
    }
  }
  return out;
}

function rectsOfPolygon(poly: [number, number][]): Rect[] {
  const xs = [...new Set(poly.map((p) => p[0]))].sort((a, b) => a - b);
  const ys = [...new Set(poly.map((p) => p[1]))].sort((a, b) => a - b);
  const ny = ys.length - 1;
  const cells: number[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j < ny; j++) {
      if (inRings([poly], (xs[i]! + xs[i + 1]!) / 2, (ys[j]! + ys[j + 1]!) / 2)) cells.push(i * ny + j);
    }
  }
  const out: Rect[] = [];
  const set = new Set(cells);
  const used = new Set<number>();
  for (const k of cells) {
    if (used.has(k)) continue;
    const i0 = Math.floor(k / ny), j0 = k % ny;
    let j1 = j0 + 1;
    while (j1 < ny && set.has(i0 * ny + j1) && !used.has(i0 * ny + j1)) j1++;
    let i1 = i0 + 1;
    for (;;) {
      let ok = i1 < xs.length - 1;
      for (let j = j0; ok && j < j1; j++) if (!set.has(i1 * ny + j) || used.has(i1 * ny + j)) ok = false;
      if (!ok) break;
      i1++;
    }
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) used.add(i * ny + j);
    out.push([xs[i0]!, ys[j0]!, xs[i1]!, ys[j1]!]);
  }
  return out;
}

interface Facet { poly: [number, number][]; plane: Plane; sides: boolean[] }

/** Plan facets of the offset outline with their underside planes. */
function facets(r: PitchedRoof, outline: [number, number][]): Facet[] {
  if (r.roof.kind === 'mono') {
    return rectsOfPolygon(outline).map((q) => ({ poly: rectPoly(q), plane: r.planeAt(0, 0), sides: outerSides(rectPoly(q), outline) }));
  }
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const ew = (r.roof.ridge ?? 'EW') === 'EW';
  const plane = (x: number, y: number) => r.planeAt(x, y);
  if (r.roof.kind === 'gable') {
    const mid = ew ? (r.bbox[1] + r.bbox[3]) / 2 : (r.bbox[0] + r.bbox[2]) / 2;
    const halves: Rect[] = ew ? [[x0, y0, x1, mid], [x0, mid, x1, y1]] : [[x0, y0, mid, y1], [mid, y0, x1, y1]];
    return halves.map((h) => {
      const poly = rectPoly(h);
      return { poly, plane: plane((h[0] + h[2]) / 2, (h[1] + h[3]) / 2), sides: outerSides(poly, rectPoly([x0, y0, x1, y1])) };
    });
  }
  // Hip on the bounding rectangle.
  const out: Facet[] = [];
  if (ew) {
    const h = (y1 - y0) / 2, ym = (y0 + y1) / 2;
    const ra = Math.min(x0 + h, (x0 + x1) / 2), rb = Math.max(x1 - h, (x0 + x1) / 2);
    out.push({ poly: [[x0, y0], [x1, y0], [rb, ym], [ra, ym]], plane: plane((x0 + x1) / 2, y0 + 1), sides: [true, false, false, false] });
    out.push({ poly: [[x1, y1], [x0, y1], [ra, ym], [rb, ym]], plane: plane((x0 + x1) / 2, y1 - 1), sides: [true, false, false, false] });
    out.push({ poly: [[x0, y1], [x0, y0], [ra, ym]], plane: plane(x0 + 1, ym), sides: [true, false, false] });
    out.push({ poly: [[x1, y0], [x1, y1], [rb, ym]], plane: plane(x1 - 1, ym), sides: [true, false, false] });
  } else {
    const h = (x1 - x0) / 2, xm = (x0 + x1) / 2;
    const ra = Math.min(y0 + h, (y0 + y1) / 2), rb = Math.max(y1 - h, (y0 + y1) / 2);
    out.push({ poly: [[x1, y0], [x1, y1], [xm, rb], [xm, ra]], plane: plane(x1 - 1, (y0 + y1) / 2), sides: [true, false, false, false] });
    out.push({ poly: [[x0, y1], [x0, y0], [xm, ra], [xm, rb]], plane: plane(x0 + 1, (y0 + y1) / 2), sides: [true, false, false, false] });
    out.push({ poly: [[x0, y0], [x1, y0], [xm, ra]], plane: plane(xm, y0 + 1), sides: [true, false, false] });
    out.push({ poly: [[x1, y1], [x0, y1], [xm, rb]], plane: plane(xm, y1 - 1), sides: [true, false, false] });
  }
  return out;
}

const rectPoly = (r: Rect): [number, number][] => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];

/** Which edges of a rectangle lie on the outline (vs. internal seams). */
function outerSides(poly: [number, number][], outline: [number, number][]): boolean[] {
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const nx = Math.sign(q[1] - p[1]), ny = -Math.sign(q[0] - p[0]);
    return !inRings([outline], mx + nx * 0.5, my + ny * 0.5);
  });
}

/** Emits the tiled roof slab (boards + tiles) and skylights. */
export function buildRoofSlabs(ctx: Ctx, roofs: PitchedRoof[]): void {
  for (const r of roofs) {
    const lvId = ctx.levels[r.li]!.level.id;
    const outline = offsetOutline(outlineEdges(ctx, r, roofs));
    const board = ctx.parts.get({ id: `${r.roof.id}:board`, level: lvId, role: 'roof', material: 'fascia' });
    const tile = ctx.parts.get({ id: `${r.roof.id}:tile`, level: lvId, role: 'roof', material: 'roofTile' });
    const layers: [number, number, typeof board][] = [[0, ROOF_DEPTH - TILE_EDGE, board], [ROOF_DEPTH - TILE_EDGE, ROOF_DEPTH, tile]];
    for (const f of facets(r, outline)) {
      const at = (p: [number, number], dz: number): V3 => [p[0], p[1], evalPlane(f.plane, p[0], p[1]) + dz];
      for (const [d0, d1, pb] of layers) {
        if (d1 === ROOF_DEPTH) pb.polygon(f.poly.map((p) => at(p, d1)));
        if (d0 === 0) pb.polygon([...f.poly].reverse().map((p) => at(p, d0)));
        f.poly.forEach((p, i) => {
          if (!f.sides[i]) return;
          const q = f.poly[(i + 1) % f.poly.length]!;
          pb.polygon([at(p, d0), at(q, d0), at(q, d1), at(p, d1)]);
        });
      }
    }
    for (const sk of r.roof.skylights) skylight(ctx, r, lvId, sk.at[0], sk.at[1], sk.width, sk.length);
  }
}

function skylight(ctx: Ctx, r: PitchedRoof, lvId: string, xc: number, yc: number, w: number, d: number): void {
  const plane = r.planeAt(xc, yc);
  const topAt = (x: number, y: number) => evalPlane(plane, x, y) + ROOF_DEPTH;
  const frame = ctx.parts.get({ id: `${r.roof.id}:skylight`, level: lvId, role: 'skylight', material: 'frame' });
  const pane = ctx.parts.get({ id: `${r.roof.id}:skylight-pane`, level: lvId, role: 'skylight', material: 'gravel' });
  const glass = ctx.parts.get({ id: `${lvId}:glass`, level: lvId, role: 'glass', material: 'glass', castsEdges: false });
  const ring = (x0: number, x1: number, y0: number, y1: number, dz: number): V3[] =>
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [x!, y!, topAt(x!, y!) + dz]);
  const slab = (pb: typeof frame, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const b = ring(x0, x1, y0, y1, z0), t = ring(x0, x1, y0, y1, z1);
    pb.polygon(t);
    for (let i = 0; i < 4; i++) pb.polygon([b[i]!, b[(i + 1) % 4]!, t[(i + 1) % 4]!, t[i]!]);
  };
  const t = 40;
  slab(frame, xc - w / 2, xc + w / 2, yc - d / 2, yc + d / 2, -10, t);
  const panes = Math.max(1, Math.round(w / 600));
  const pw = (w - 60 * (panes + 1)) / panes;
  for (let i = 0; i < panes; i++) {
    const x0 = xc - w / 2 + 60 + i * (pw + 60);
    slab(pane, x0, x0 + pw, yc - d / 2 + 60, yc + d / 2 - 60, t - 5, t + 8);
    glass.polygon(ring(x0, x0 + pw, yc - d / 2 + 60, yc + d / 2 - 60, t + 14));
  }
}

// ---------------------------------------------------------------------------
// Flat roofs and canopies (massing slabs)

/** True when an exterior wall of the level lies on this cell side. */
function wallOnSide(ctx: Ctx, li: number, vertical: boolean, line: number, lo: number, hi: number): boolean {
  return ctx.levels[li]!.level.walls.some((w) => {
    if (!w.exterior || (w.orient === 'NS') !== vertical) return false;
    const wl = vertical ? w.a[0] : w.a[1];
    if (Math.abs(wl - line) > 0.5) return false;
    const a = vertical ? Math.min(w.a[1], w.b[1]) : Math.min(w.a[0], w.b[0]);
    const b = vertical ? Math.max(w.a[1], w.b[1]) : Math.max(w.a[0], w.b[0]);
    return Math.min(b, hi) - Math.max(a, lo) > (hi - lo) * 0.5;
  });
}

export function buildFlatRoofsAndCanopies(ctx: Ctx): void {
  for (const roof of ctx.house.roofs) {
    if (roof.kind !== 'flat' && roof.kind !== 'canopy') continue;
    const li = ctx.levelIndex(roof.onLevel);
    if (li < 0) continue;
    const lv = ctx.levels[li]!;
    const cells = roofCells(ctx, roof);
    const isCanopy = roof.kind === 'canopy';
    const z1 = isCanopy ? lv.elev + (roof.height ?? lv.level.height - 300) : lv.top + FLAT_ROOF;
    const z0 = z1 - (isCanopy ? CANOPY : FLAT_ROOF);
    const part = isCanopy
      ? { id: `canopy:${roof.id}`, level: lv.level.id, role: 'canopy' as const, material: 'slab' as const }
      : { id: `${roof.id}:slab`, level: lv.level.id, role: 'roof' as const, material: 'slab' as const };
    const inCells = (x: number, y: number) => cells.some((c) => x > c[0] && x < c[2] && y > c[1] && y < c[3]);
    let touchesWall = false;
    for (const c of cells) {
      const offs = ([['S', false, c[1], c[0], c[2], 0, -1], ['N', false, c[3], c[0], c[2], 0, 1], ['W', true, c[0], c[1], c[3], -1, 0], ['E', true, c[2], c[1], c[3], 1, 0]] as const).map(
        ([, vertical, line, lo, hi, dx, dy]) => {
          const mx = vertical ? line : (lo + hi) / 2, my = vertical ? (lo + hi) / 2 : line;
          if (inCells(mx + dx, my + dy)) return 0;
          if (wallOnSide(ctx, li, vertical, line, lo, hi)) { touchesWall = true; return -120; }
          return roof.overhang;
        },
      );
      ctx.massing.add({ x0: c[0] - offs[2]!, y0: c[1] - offs[0]!, x1: c[2] + offs[3]!, y1: c[3] + offs[1]!, z0, top: flat(z1), part, prio: 30, tag: 'canopy' });
    }
    if (isCanopy && !touchesWall) {
      // Free-standing canopy: slim posts at the corners off the plot boundary.
      const xs = cells.flatMap((c) => [c[0], c[2]]), ys = cells.flatMap((c) => [c[1], c[3]]);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      const site = ctx.house.site;
      const posts = { id: `canopy:${roof.id}:posts`, level: lv.level.id, role: 'canopy' as const, material: 'metal' as const };
      for (const [x, y, sx, sy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx1, by1, -1, -1], [bx0, by1, 1, -1]] as const) {
        if (x <= 0 || y <= 0 || x >= site.width || y >= site.depth) continue;
        const px = x + sx * (POST / 2 + 50), py = y + sy * (POST / 2 + 50);
        ctx.massing.add({ x0: px - POST / 2, y0: py - POST / 2, x1: px + POST / 2, y1: py + POST / 2, z0: lv.elev, top: flat(z0), part: posts, prio: 40, tag: 'canopy' });
      }
    }
  }
}
