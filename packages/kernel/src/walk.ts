// Walk-mode data: where a person can stand (floor surfaces, stair ramps)
// and what stops them (walls minus doorways, windows, rails, the plot fence,
// furniture, cars). Plain plan rectangles with height ranges, metres.
import { FENCE_THICKNESS, RAIL_HEIGHT } from './constants';
import { type Ctx, pointInRings, type Rect } from './context';
import { floorZ } from './furniture';
import type { StairInfo } from './stairs';
import type { EntouragePlacement, FurnitureBox, PlanRect, WalkBlocker, WalkData, WalkSurface } from './types';

const MM = 0.001;
/** Walls inside a stairwell only stop someone standing on the floor below. */
const WELL_WALL_HEIGHT = 500;
/** Furniture lower than this is walked over (rugs). */
const LOW_FURNITURE = 0.05;
/** Distance of the start point from the entrance door (mm). */
const START_INSIDE = 800;

const toM = (r: Rect): PlanRect => [r[0] * MM, r[1] * MM, r[2] * MM, r[3] * MM];

export function buildWalk(ctx: Ctx, stairs: StairInfo[], furniture: FurnitureBox[], entourage: EntouragePlacement[]): WalkData {
  const surfaces: WalkSurface[] = [];
  const blockers: WalkBlocker[] = [];

  for (const lv of ctx.levels) {
    const id = lv.level.id;
    // Floors: every space's cells (interior and outdoor) minus stair holes.
    const holes = lv.level.slabOpenings.flatMap((o) => o.rings);
    const byZ = new Map<number, number[]>();
    lv.owner.forEach((s, k) => {
      if (!s) return;
      const i = Math.floor(k / ctx.ny), j = k % ctx.ny;
      const cx = (ctx.xs[i]! + ctx.xs[i + 1]!) / 2, cy = (ctx.ys[j]! + ctx.ys[j + 1]!) / 2;
      if (pointInRings(holes, cx, cy)) return;
      const z = floorZ(ctx, lv.index, cx, cy);
      let list = byZ.get(z);
      if (!list) byZ.set(z, (list = []));
      list.push(k);
    });
    for (const [z, cells] of [...byZ].sort((a, b) => a[0] - b[0])) {
      for (const r of ctx.rects(cells)) surfaces.push({ level: id, rect: toM(r), z: z * MM });
    }

    // Walls minus doorways; windows stay closed (a window blocker covers the
    // gap so the wall reads as continuous for collision).
    const wells = stairs.filter((s) => s.walk.level === lv.index).map((s) => s.walk.well);
    const top = Math.max(lv.top, lv.elev + 3000);
    for (const w of lv.level.walls) {
      const t = w.thickness / 2;
      const ns = w.orient === 'NS';
      const lo = (ns ? Math.min(w.a[1], w.b[1]) : Math.min(w.a[0], w.b[0])) - t;
      const hi = (ns ? Math.max(w.a[1], w.b[1]) : Math.max(w.a[0], w.b[0])) + t;
      const line = ns ? w.a[0] : w.a[1];
      const gaps: [number, number][] = [];
      for (const o of lv.level.openings) {
        if (o.wall !== w.id || o.kind === 'window') continue;
        const a = ns ? Math.min(o.a[1], o.b[1]) : Math.min(o.a[0], o.b[0]);
        gaps.push([a, a + o.width]);
      }
      gaps.sort((p, q) => p[0] - q[0]);
      let cur = lo;
      const pieces: [number, number][] = [];
      for (const [a, b] of gaps) {
        if (a > cur) pieces.push([cur, a]);
        cur = Math.max(cur, b);
      }
      if (hi > cur) pieces.push([cur, hi]);
      // Inside a stairwell the flights pass over the walls of the floor below:
      // there they only stop someone standing on that floor.
      const cuts: [number, number, boolean][] = [];
      for (const [a, b] of pieces) {
        let parts: [number, number, boolean][] = [[a, b, false]];
        for (const well of wells) {
          const [wl, wh, al, ah] = ns ? [well[0], well[2], well[1], well[3]] : [well[1], well[3], well[0], well[2]];
          if (line <= wl || line >= wh) continue;
          parts = parts.flatMap(([p, q, low]): [number, number, boolean][] => {
            if (low || q <= al || p >= ah) return [[p, q, low]];
            const out: [number, number, boolean][] = [];
            if (p < al) out.push([p, al, false]);
            out.push([Math.max(p, al), Math.min(q, ah), true]);
            if (q > ah) out.push([ah, q, false]);
            return out;
          });
        }
        cuts.push(...parts);
      }
      for (const [a, b, low] of cuts) {
        if (b - a < 1) continue;
        const r: Rect = ns ? [line - t, a, line + t, b] : [a, line - t, b, line + t];
        blockers.push({ rect: toM(r), z0: lv.elev * MM, z1: (low ? lv.elev + WELL_WALL_HEIGHT : top) * MM, kind: 'wall' });
      }
    }
    // Rails and parapets along the free edges of balconies and terraces.
    for (const e of lv.level.edges) {
      if (e.treatment === 'none') continue;
      const ns = e.orient === 'NS';
      const lo = ns ? Math.min(e.a[1], e.b[1]) : Math.min(e.a[0], e.b[0]);
      const hi = ns ? Math.max(e.a[1], e.b[1]) : Math.max(e.a[0], e.b[0]);
      const line = ns ? e.a[0] : e.a[1];
      const r: Rect = ns ? [line - 60, lo - 60, line + 60, hi + 60] : [lo - 60, line - 60, hi + 60, line + 60];
      blockers.push({ rect: toM(r), z0: lv.elev * MM, z1: (lv.elev + RAIL_HEIGHT) * MM, kind: 'rail' });
    }
  }

  // Stairs: ramps (heights relative to their start level) and the rail
  // between the flights.
  for (const st of stairs) {
    const lv = ctx.levels[st.walk.level]!;
    for (const rp of st.walk.ramps) {
      const s: WalkSurface = { level: lv.level.id, rect: toM(rp.rect), z: (lv.elev + rp.z0) * MM };
      if (rp.from !== rp.to && rp.z0 !== rp.z1) s.ramp = { axis: rp.axis, from: rp.from * MM, to: rp.to * MM, z0: (lv.elev + rp.z0) * MM, z1: (lv.elev + rp.z1) * MM };
      surfaces.push(s);
    }
    for (const r of st.walk.rails) blockers.push({ rect: toM(r), z0: lv.elev * MM, z1: (lv.elev + st.walk.rise + RAIL_HEIGHT) * MM, kind: 'rail' });
  }

  // The plot fence bounds the ground.
  const site = ctx.house.site;
  if (site.fence) {
    const t = FENCE_THICKNESS / 2, W = site.width, D = site.depth, h = site.fence.height;
    for (const r of [[-t, -t, W + t, t], [-t, D - t, W + t, D + t], [-t, -t, t, D + t], [W - t, -t, W + t, D + t]] as Rect[]) {
      blockers.push({ rect: toM(r), z0: 0, z1: h * MM, kind: 'fence' });
    }
  }

  for (const f of furniture) {
    if (f.max[2] - f.min[2] < LOW_FURNITURE) continue;
    blockers.push({ rect: [f.min[0], f.min[1], f.max[0], f.max[1]], z0: f.min[2], z1: f.max[2], kind: 'furniture' });
  }
  for (const e of entourage) {
    if (e.kind !== 'car') continue;
    // Low-detail car: about 4.7 x 1.85 m along its heading.
    const c = Math.abs(Math.cos(e.rotation)), s = Math.abs(Math.sin(e.rotation));
    const hx = (4.7 * c + 1.85 * s) / 2, hy = (4.7 * s + 1.85 * c) / 2;
    blockers.push({ rect: [e.position[0] - hx, e.position[1] - hy, e.position[0] + hx, e.position[1] + hy], z0: e.position[2], z1: e.position[2] + 1.5, kind: 'car' });
  }

  const start = startPoint(ctx);
  const arrivals: WalkData['arrivals'] = [start];
  for (const st of stairs) {
    // Arrival on the level above: just off the top of the last flight, facing away from the well.
    const upper = ctx.levels[st.walk.level + 1];
    const last = st.walk.ramps[st.walk.ramps.length - 1];
    if (!upper || !last || arrivals.some((a) => a.level === upper.level.id)) continue;
    const r = last.rect;
    const along = last.to;
    const dir = Math.sign(last.to - last.from) || 1;
    const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
    const p: [number, number] = last.axis === 'y' ? [cx, along + dir * 700] : [along + dir * 700, cy];
    const headingDeg = last.axis === 'y' ? (dir > 0 ? 0 : 180) : (dir > 0 ? 90 : 270);
    arrivals.push({ level: upper.level.id, position: [p[0] * MM, p[1] * MM], headingDeg });
  }
  return { surfaces, blockers, start, arrivals };
}

/**
 * Inside the main entrance looking into the house: the ground-floor door
 * between an interior space and a porch (else any outdoor space, else the
 * first door), stepped into the interior space.
 */
function startPoint(ctx: Ctx): WalkData['start'] {
  const lv = ctx.levels[0]!;
  const spaceOf = (id: string | null) => (id ? lv.level.spaces.find((s) => s.id === id) ?? null : null);
  const doors = lv.level.openings.filter((o) => o.kind === 'door' || o.kind === 'sliding-door');
  const score = (o: (typeof doors)[number]) => {
    const [a, b] = o.sides.map(spaceOf);
    const out = [a, b].find((s) => s?.outdoor) ?? null;
    const inn = [a, b].find((s) => s && !s.outdoor) ?? null;
    if (!inn || !out && (a && b)) return -1;
    return (out?.type === 'porch' ? 100 : out ? 50 : 10) + (o.kind === 'door' ? 5 : 0) + (inn.type === 'living' || inn.type === 'hall' ? 3 : 0);
  };
  const best = [...doors].sort((p, q) => score(q) - score(p))[0];
  if (!best || score(best) < 0) {
    // No usable door: the centre of the largest interior space.
    const s = [...lv.level.spaces].filter((x) => !x.outdoor).sort((p, q) => q.area - p.area)[0];
    const pts = s?.polygon ?? [[0, 0]];
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    return { level: lv.level.id, position: [cx * MM, cy * MM], headingDeg: 180 };
  }
  const [cx, cy] = best.center;
  const ns = best.orient === 'NS';
  // Which side is interior: probe both sides of the wall line.
  const probe = (d: number) => (ns ? ctx.spaceAt(0, cx + d, cy) : ctx.spaceAt(0, cx, cy + d));
  const plus = probe(300);
  const sign = plus && !plus.outdoor ? 1 : -1;
  const p: [number, number] = ns ? [cx + sign * START_INSIDE, cy] : [cx, cy + sign * START_INSIDE];
  const headingDeg = ns ? (sign > 0 ? 90 : 270) : (sign > 0 ? 0 : 180);
  return { level: lv.level.id, position: [p[0] * MM, p[1] * MM], headingDeg };
}
