// Openings: every opening cuts its wall (a void through the wall
// thickness); exterior ones get a thin dark frame per glazing cell, glass
// with a flat dark backing, timber inserts and multi-level tall units.
import type { ResolvedOpening } from '@opensu/model';
import {
  BAND_ABOVE, BAND_BELOW, DOOR_CANOPY, DOOR_CANOPY_ABOVE, DOOR_CANOPY_SIDE, FRAME_DEPTH, FRAME_SETBACK, FRAME_WIDTH, MAX_PANE, PANE_TARGET,
} from './constants';
import type { Ctx } from './context';
import { flat } from './massing';
import type { V3 } from './mesh';

interface Cell { u0: number; u1: number; z0: number; z1: number; type: 'glass' | 'wood' }

/** Opening ends that meet a window of the same space on the adjacent face. */
function cornerEnds(ctx: Ctx): Map<string, { lo: boolean; hi: boolean }> {
  const out = new Map<string, { lo: boolean; hi: boolean }>();
  for (const lv of ctx.levels) {
    const glazed = lv.level.openings.filter((o) => (o.kind === 'window' || o.kind === 'sliding-door') && o.wall && lv.level.walls.find((w) => w.id === o.wall)?.exterior);
    const ends = (o: ResolvedOpening): [number, number][] => [o.a as [number, number], o.b as [number, number]];
    for (const p of glazed) {
      for (const q of glazed) {
        if (p === q || p.orient === q.orient) continue;
        if (!p.sides.some((id) => id && q.sides.includes(id))) continue;
        ends(p).forEach((e, k) => {
          if (!ends(q).some((f) => Math.abs(f[0] - e[0]) < 1 && Math.abs(f[1] - e[1]) < 1)) return;
          const along = p.orient === 'NS' ? [p.a[1], p.b[1]] : [p.a[0], p.b[0]];
          const isLo = along[k]! <= along[1 - k]!;
          const cur = out.get(p.id) ?? { lo: false, hi: false };
          if (isLo) cur.lo = true; else cur.hi = true;
          out.set(p.id, cur);
        });
      }
    }
  }
  return out;
}

export function buildOpenings(ctx: Ctx): void {
  const corners = cornerEnds(ctx);
  for (const lv of ctx.levels) {
    for (const o of lv.level.openings) {
      const wall = lv.level.walls.find((w) => w.id === o.wall);
      if (!wall) continue;
      const vertical = o.orient === 'NS';
      const line = vertical ? o.a[0] : o.a[1];
      const lo = vertical ? Math.min(o.a[1], o.b[1]) : Math.min(o.a[0], o.b[0]);
      const hi = lo + o.width;
      const half = wall.thickness / 2;
      const z0 = lv.elev + o.sill;
      const z1 = z0 + o.height;
      // A corner window has no pier at the shared corner: the void runs through
      // the corner and the frames meet at the other face's frame plane.
      const corner = corners.get(o.id) ?? { lo: false, hi: false };
      const vlo = lo - (corner.lo ? half + 1 : 0), vhi = hi + (corner.hi ? half + 1 : 0);
      const v = vertical
        ? { x0: line - half - 1, x1: line + half + 1, y0: vlo, y1: vhi }
        : { x0: vlo, x1: vhi, y0: line - half - 1, y1: line + half + 1 };
      ctx.massing.cut({ ...v, z0, z1, tags: ['house'] });
      if (!wall.exterior || o.kind === 'void') continue;
      // Outward: towards the side with no interior space.
      const sideSpace = (k: 0 | 1) => {
        const id = wall.sides[k];
        return id ? lv.level.spaces.find((s) => s.id === id) ?? null : null;
      };
      const s0 = sideSpace(0), s1 = sideSpace(1);
      const outSign = !s0 || s0.outdoor ? -1 : 1;
      const outside = outSign < 0 ? s0 : s1;
      const ext = half - FRAME_SETBACK;
      const flo = lo - (corner.lo ? ext : 0), fhi = hi + (corner.hi ? ext : 0);
      const outer = line + outSign * half;
      frameUnit(ctx, lv.level.id, o, vertical, outer, outSign, flo, fhi, z0, z1, outside?.type === 'porch');
      if (o.canopy && (o.kind === 'door' || o.kind === 'sliding-door')) {
        const zb = z1 + (o.canopy.above ?? DOOR_CANOPY_ABOVE);
        const d0 = outer, d1 = outer + outSign * o.canopy.depth;
        const r = vertical
          ? { x0: Math.min(d0, d1), x1: Math.max(d0, d1), y0: lo - DOOR_CANOPY_SIDE, y1: hi + DOOR_CANOPY_SIDE }
          : { x0: lo - DOOR_CANOPY_SIDE, x1: hi + DOOR_CANOPY_SIDE, y0: Math.min(d0, d1), y1: Math.max(d0, d1) };
        ctx.massing.add({ ...r, z0: zb, top: flat(zb + DOOR_CANOPY), part: { id: `${lv.level.id}:door-canopy`, level: lv.level.id, role: 'canopy', material: 'slab' }, prio: 30, tag: 'canopy' });
      }
    }
  }
}

function cellsFor(ctx: Ctx, o: ResolvedOpening, w: number, z0: number, z1: number, woodLeaf: boolean, startAtU0: boolean): Cell[] {
  const h = z1 - z0;
  if (woodLeaf && o.kind === 'door') return [{ u0: 0, u1: w, z0: 0, z1: h, type: 'wood' }];
  // Columns (u from the viewer's left); timber side panels first.
  const cols: [number, number, 'glass' | 'wood'][] = [];
  let a = 0, b = w;
  const panelAt = (atStart: boolean, pw: number) => {
    if (atStart === startAtU0) { cols.push([0, pw, 'wood']); a = pw; }
    else { cols.push([w - pw, w, 'wood']); b = w - pw; }
  };
  if (o.panel) panelAt(o.panel === 'start', Math.min(700, Math.max(250, w * 0.25)));
  else if (o.insert === 'wood-panel' && o.spanLevels <= 1) panelAt(true, Math.min(600, Math.max(300, w * 0.12)));
  const rest = b - a;
  const n = o.kind === 'door' ? (rest > MAX_PANE ? 2 : 1) : rest > MAX_PANE ? Math.ceil(rest / PANE_TARGET) : 1;
  for (let i = 0; i < n; i++) cols.push([a + (rest * i) / n, a + (rest * (i + 1)) / n, 'glass']);
  cols.sort((p, q) => p[0] - q[0]);
  // Rows: timber bands where a tall unit crosses a floor.
  const rows: [number, number, boolean][] = [];
  if (o.insert === 'wood-panel' && o.spanLevels > 1) {
    const floors = ctx.levels.map((l) => l.elev).filter((e) => e > z0 + BAND_BELOW + 300 && e < z1 - BAND_ABOVE - 300);
    let z = 0;
    for (const f of floors) {
      rows.push([z, f - BAND_BELOW - z0, false], [f - BAND_BELOW - z0, f + BAND_ABOVE - z0, true]);
      z = f + BAND_ABOVE - z0;
    }
    rows.push([z, h, false]);
  } else rows.push([0, h, false]);
  const cells: Cell[] = [];
  for (const [u0, u1, t] of cols) for (const [r0, r1, wood] of rows) cells.push({ u0, u1, z0: r0, z1: r1, type: wood || t === 'wood' ? 'wood' : 'glass' });
  return cells;
}

function frameUnit(ctx: Ctx, levelId: string, o: ResolvedOpening, vertical: boolean, outer: number, outSign: number,
  lo: number, hi: number, z0: number, z1: number, woodLeaf: boolean): void {
  const frame = ctx.parts.get({ id: `${levelId}:frame`, level: levelId, role: 'frame', material: 'frame' });
  const wood = ctx.parts.get({ id: `${levelId}:insert`, level: levelId, role: 'insert', material: 'wood' });
  const glass = ctx.parts.get({ id: `${levelId}:glass`, level: levelId, role: 'glass', material: 'glass', castsEdges: false });
  const backing = ctx.parts.get({ id: `${levelId}:glass-backing`, level: levelId, role: 'glass', material: 'glassBacking', castsEdges: false });
  // u runs left to right as seen from outside.
  const rightPositive = vertical ? outSign > 0 : outSign < 0;
  const P = (u: number, z: number, depth: number): V3 => {
    const t = rightPositive ? lo + u : hi - u;
    const w = outer - outSign * depth;
    return vertical ? [w, t, z0 + z] : [t, w, z0 + z];
  };
  // Quad facing outwards (or inwards when `back`).
  const quad = (pb: typeof frame, u0: number, u1: number, za: number, zb: number, depth: number, back = false) => {
    const q = [P(u0, za, depth), P(u1, za, depth), P(u1, zb, depth), P(u0, zb, depth)];
    pb.polygon(back ? q.reverse() : q);
  };
  const fw = FRAME_WIDTH;
  const f0 = FRAME_SETBACK, f1 = FRAME_SETBACK + FRAME_DEPTH;
  for (const c of cellsFor(ctx, o, hi - lo, z0, z1, woodLeaf, rightPositive)) {
    const { u0, u1, z0: a, z1: b } = c;
    if (u1 - u0 < 2 * fw + 10 || b - a < 2 * fw + 10) continue;
    // Frame ring: front and back bars, inner sides.
    const bars: [number, number, number, number][] = [
      [u0, u0 + fw, a, b], [u1 - fw, u1, a, b], [u0 + fw, u1 - fw, a, a + fw], [u0 + fw, u1 - fw, b - fw, b],
    ];
    for (const [p0, p1, q0, q1] of bars) {
      quad(frame, p0, p1, q0, q1, f0);
      quad(frame, p0, p1, q0, q1, f1, true);
    }
    const iu0 = u0 + fw, iu1 = u1 - fw, ia = a + fw, ib = b - fw;
    // Inner sides face the pane centre.
    frame.polygon([P(iu0, ia, f0), P(iu0, ia, f1), P(iu1, ia, f1), P(iu1, ia, f0)].reverse());
    frame.polygon([P(iu0, ib, f0), P(iu1, ib, f0), P(iu1, ib, f1), P(iu0, ib, f1)].reverse());
    frame.polygon([P(iu0, ia, f0), P(iu0, ib, f0), P(iu0, ib, f1), P(iu0, ia, f1)].reverse());
    frame.polygon([P(iu1, ia, f0), P(iu1, ia, f1), P(iu1, ib, f1), P(iu1, ib, f0)].reverse());
    if (c.type === 'wood') {
      quad(wood, iu0, iu1, ia, ib, f0 + 20);
    } else {
      quad(glass, iu0, iu1, ia, ib, (f0 + f1) / 2);
      quad(backing, iu0, iu1, ia, ib, f1 - 5);
    }
  }
}
