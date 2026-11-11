// ResolvedHouse -> HouseGeometry. Pure and deterministic.
import type { PartSpec } from './mesh';
import type { ResolvedEdge, ResolvedHouse } from '@opensu/model';
import {
  BAR_SIZE, BAR_SPACING, CUT_HEIGHT, RISER, STEP_SLAB, DECK, DEFAULT_UTC_OFFSET, FLOOR_SLAB, GROUND_FLOOR, KERB_HEIGHT, OUTDOOR_SLAB, OUTDOOR_SLAB_OUT, RAIL_BAR, RAIL_HEIGHT,
} from './constants';
import { Ctx, type Rect, pointInRings } from './context';
import { extractEdges } from './edges';
import { placeEntourage } from './entourage';
import { buildFurniture, inFurniture, planFurniture } from './furniture';
import { buildWalk } from './walk';
import { evalPlane, flat } from './massing';
import { buildOpenings } from './openings';
import { addRoofWalls, buildFlatRoofsAndCanopies, buildRoofSlabs, pitchedRoofs } from './roof';
import { buildSite } from './site';
import { buildStairs, type StairInfo } from './stairs';
import type { PartSpec as Spec } from './mesh';
import type { HouseGeometry, LevelSpan, Part } from './types';

const MM = 0.001;

export interface BuildOptions {
  /** Fold angle (degrees) above which an edge is drawn. */
  featureAngleDeg?: number;
  /** Furnish the rooms (default true). */
  furniture?: boolean;
}

export interface BuildDetails {
  geometry: HouseGeometry;
  ctx: Ctx;
  stairs: StairInfo[];
  /** Overlapping coplanar faces found during edge extraction (should be 0). */
  overlaps: number;
}

export function buildHouse(house: ResolvedHouse, opts: BuildOptions = {}): HouseGeometry {
  return buildHouseDetailed(house, opts).geometry;
}

export function buildHouseDetailed(house: ResolvedHouse, opts: BuildOptions = {}): BuildDetails {
  const ctx = new Ctx(house);
  const roofs = pitchedRoofs(ctx);

  // Walls: every level's walls fill their storey; under a pitched roof they
  // rise to its underside.
  for (const lv of ctx.levels) {
    const part = { id: `${lv.level.id}:wall`, level: lv.level.id, role: 'wall' as const, material: 'wall' as const };
    for (const b of lv.bands) ctx.massing.add({ x0: b[0], y0: b[1], x1: b[2], y1: b[3], z0: lv.elev, top: flat(lv.top), part, prio: 10, tag: 'house' });
  }
  addRoofWalls(ctx, roofs);

  // Floor slabs over interior cells, minus stairwells; their top face is the
  // floor finish. The ground floor gets a finish slab below grade.
  for (const lv of ctx.levels) {
    const holes = lv.level.slabOpenings.flatMap((o) => o.rings);
    const cells = ctx.cellsOf(lv.index, (s) => !s.outdoor).filter((k) => {
      const i = Math.floor(k / ctx.ny), j = k % ctx.ny;
      return !pointInRings(holes, (ctx.xs[i]! + ctx.xs[i + 1]!) / 2, (ctx.ys[j]! + ctx.ys[j + 1]!) / 2);
    });
    // The ground-floor finish lies on grade: no edges of its own (wall bases
    // already draw them), so elevations stay clean at the ground line.
    const floor = floorSpec(lv.level.id, lv.index === 0);
    const part: Spec = lv.index === 0 ? floor : { id: `${lv.level.id}:slab`, level: lv.level.id, role: 'slab', material: 'wall' };
    const z0 = lv.elev - (lv.index === 0 ? GROUND_FLOOR : FLOOR_SLAB);
    for (const r of ctx.rects(cells)) ctx.massing.add({ x0: r[0], y0: r[1], x1: r[2], y1: r[3], z0, top: flat(lv.elev), part, topPart: floor, prio: 10, tag: 'house' });
  }

  buildOutdoorLevels(ctx);
  buildFlatRoofsAndCanopies(ctx);
  const frameCaps = buildOpenings(ctx);
  const stairs = buildStairs(ctx);
  buildSite(ctx);

  const covered = (x: number, y: number) =>
    ctx.house.roofs.some((r) => pointInRings(r.rings, x, y)) || ctx.levels.slice(1).some((l) => !!ctx.spaceAt(l.index, x, y));
  // Furniture placements first: entourage people keep out of them. Plants
  // come from the shared site planting, which the furniture already avoids.
  const furnished = opts.furniture === false ? ctx.levels.map(() => []) : planFurniture(ctx);
  const entourage = placeEntourage(ctx, covered, (li, x, y, r) => inFurniture(furnished[li] ?? [], x, y, r));

  // Massing faces, then pitched roof slabs. Wall tops in a doorway at an
  // upper floor are floor finish.
  ctx.massing.emit(ctx.parts, {
    ground: 0,
    topPart: (solid, z, x, y) => {
      if (solid.part.role !== 'wall') return undefined;
      const lv = ctx.levels.find((l) => l.index > 0 && Math.abs(l.elev - z) < 0.5);
      const s = lv && ctx.spaceAt(lv.index, x, y);
      return lv && s && !s.outdoor ? floorSpec(lv.level.id, false) : undefined;
    },
    // A terrace or balcony slab over a room is that room's ceiling.
    bottomPart: (solid, z, x, y) => {
      if (solid.part.role !== 'slab' || solid.part.material !== 'slab' || !solid.part.level) return undefined;
      const li = ctx.levelIndex(solid.part.level);
      const below = ctx.levels[li - 1];
      const s = below && ctx.spaceAt(below.index, x, y);
      if (!s || s.outdoor || Math.abs(z - (ctx.levels[li]!.elev - OUTDOOR_SLAB)) > 1) return undefined;
      return { id: `${solid.part.level}:slab`, level: solid.part.level, role: 'slab', material: 'wall' };
    },
    inside: (x, y, z) => {
      const lv = ctx.levelAtZ(z);
      const s = ctx.spaceAt(lv.index, x, y);
      if (s && !s.outdoor && z >= lv.elev) return true;
      if (lv.bands.some((b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) return true;
      if (z >= lv.top) return roofs.some((r) => r.cells.some((c) => x > c[0] - 120 && x < c[2] + 120 && y > c[1] - 120 && y < c[3] + 120) && z < evalPlane(r.planeAt(x, y), x, y));
      return false;
    },
  });
  buildRoofSlabs(ctx, roofs);

  // Feature edges and floor lines from all opaque outlines.
  const loops = ctx.parts.list.filter((p) => p.spec.castsEdges !== false).flatMap((p) => p.loops);
  const ex = extractEdges(loops, { featureAngleDeg: opts.featureAngleDeg ?? 25, floorLevels: ctx.levels.slice(1).map((l) => l.elev) });

  // Cutaway section caps: where house solids (except stairs) pass through
  // each level's cut plane. Their outlines are extracted on their own (they lie inside solids).
  const capFirst = ctx.parts.list.length;
  for (const lv of ctx.levels) {
    const z = lv.elev + CUT_HEIGHT;
    const cap = ctx.parts.get({ id: `${lv.level.id}:cut`, level: lv.level.id, role: 'cut', material: 'cut' });
    // Stairs stay whole in a cutaway (the renderer does not clip them).
    for (const r of ctx.massing.section(z, (s) => s.part.level !== undefined && s.part.role !== 'stair')) {
      cap.polygon([[r[0], r[1], z], [r[2], r[1], z], [r[2], r[3], z], [r[0], r[3], z]]);
    }
    // Window and door frames cut by the plane: solid caps in the frame colour.
    const frameCap = ctx.parts.get({ id: `${lv.level.id}:cut-frame`, level: lv.level.id, role: 'cut', material: 'frame' });
    for (const c of frameCaps) if (c.levelId === lv.level.id) frameCap.polygon(c.poly);
  }
  const capEx = extractEdges(ctx.parts.list.slice(capFirst).flatMap((p) => p.loops), { featureAngleDeg: opts.featureAngleDeg ?? 25, floorLevels: [] });
  for (const [k, v] of capEx.edges) ex.edges.set(k, v);

  // Furniture: built after the architecture's edges, with edges of its own
  // (it never changes a line of the house).
  const furnFirst = ctx.parts.list.length;
  // Nothing stands taller than the stair flights above it (storerooms under stairs).
  for (const [li, pieces] of furnished.entries()) {
    const ramps = stairs.filter((st) => st.walk.level === li).flatMap((st) => st.walk.ramps);
    if (!ramps.length) continue;
    furnished[li] = pieces.flatMap((p) => {
      const ex = Math.abs(Math.cos(p.rotation)) * p.w / 2 + Math.abs(Math.sin(p.rotation)) * p.d / 2;
      const ey = Math.abs(Math.sin(p.rotation)) * p.w / 2 + Math.abs(Math.cos(p.rotation)) * p.d / 2;
      let room = Infinity;
      for (const r of ramps) {
        if (p.x + ex <= r.rect[0] || p.x - ex >= r.rect[2] || p.y + ey <= r.rect[1] || p.y - ey >= r.rect[3]) continue;
        // Lowest point of the flight over the piece, less the step slab.
        const lo = r.axis === 'x' ? [Math.max(p.x - ex, r.rect[0]), Math.min(p.x + ex, r.rect[2])] : [Math.max(p.y - ey, r.rect[1]), Math.min(p.y + ey, r.rect[3])];
        const zAt = (v: number) => {
          const span = r.to - r.from;
          const t = span === 0 ? 0 : Math.min(1, Math.max(0, (v - r.from) / span));
          return r.z0 + (r.z1 - r.z0) * t;
        };
        room = Math.min(room, zAt(lo[0]!), zAt(lo[1]!));
      }
      if (room === Infinity) return [p];
      const h = Math.min(p.h, room - 2 * RISER - STEP_SLAB);
      return h >= 350 ? [{ ...p, h }] : [];
    });
  }
  const furn = buildFurniture(ctx, furnished);
  const furnEx = extractEdges(ctx.parts.list.slice(furnFirst).filter((p) => p.spec.castsEdges !== false).flatMap((p) => p.loops), { featureAngleDeg: opts.featureAngleDeg ?? 25, floorLevels: [] });
  for (const [k, v] of furnEx.edges) ex.edges.set(k, v);
  // Pots on terraces and balconies get a tuft of planting.
  furn.pots.forEach((p, i) => {
    const r = p.size / 2 + 300;
    entourage.push({
      kind: 'grass', position: [p.x * MM, p.y * MM, p.z * MM], rotation: 0, scale: Math.max(0.35, Math.min(0.75, p.size * MM * 0.9)), seed: (ctx.seed + 7919 * (i + 1)) >>> 0,
      clip: { min: [(p.x - r) * MM, (p.y - r) * MM], max: [(p.x + r) * MM, (p.y + r) * MM], below: p.z * MM },
    });
  });

  const parts: Part[] = [];
  let triangles = 0;
  let edgeCount = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of ctx.parts.list) {
    if (p.idx.length === 0) continue;
    const positions = new Float32Array(p.pos.length);
    // Floor finishes (partly below grade) and section caps lie inside the
    // building: they do not count for the bounds.
    const inner = p.spec.role === 'floor' || p.spec.role === 'cut' || p.spec.role === 'furniture';
    for (let i = 0; i < p.pos.length; i++) {
      positions[i] = p.pos[i]! * MM;
      if (inner) continue;
      const a = i % 3;
      if (p.pos[i]! < min[a]!) min[a] = p.pos[i]!;
      if (p.pos[i]! > max[a]!) max[a] = p.pos[i]!;
    }
    const e = ex.edges.get(p.index);
    const edges = new Float32Array((e?.seg ?? []).map((v) => v * MM));
    const part: Part = {
      id: p.spec.id,
      role: p.spec.role,
      material: p.spec.material,
      positions,
      indices: new Uint32Array(p.idx),
      edges,
      edgeNormals: new Float32Array(e?.normals ?? []),
      castsEdges: p.spec.castsEdges !== false,
    };
    if (p.spec.level) part.level = p.spec.level;
    parts.push(part);
    triangles += p.idx.length / 3;
    edgeCount += edges.length / 6;
  }
  const site = ctx.house.site;
  const levels: LevelSpan[] = ctx.levels.map((l) => ({ id: l.level.id, elevation: l.elev * MM, top: l.top * MM, cutZ: (l.elev + CUT_HEIGHT) * MM }));
  const geometry: HouseGeometry = {
    parts,
    site: { latitude: site.latitude, longitude: site.longitude, northDeg: site.northDeg, utcOffsetHours: site.utcOffsetHours ?? DEFAULT_UTC_OFFSET },
    levels,
    floorLines: new Float32Array(ex.floorLines.map((v) => v * MM)),
    entourage,
    furniture: furn.boxes,
    walk: buildWalk(ctx, stairs, furn.boxes, entourage),
    interiors: ctx.levels.flatMap((lv, i) => {
      const z1 = (ctx.levels[i + 1]?.elev ?? lv.top) * MM;
      return ctx.rects(ctx.cellsOf(lv.index, (s) => !s.outdoor)).map((r) => ({ rect: [r[0] * MM, r[1] * MM, r[2] * MM, r[3] * MM] as [number, number, number, number], z0: lv.elev * MM, z1 }));
    }),
    bounds: { min: min.map((v) => v * MM) as [number, number, number], max: max.map((v) => v * MM) as [number, number, number] },
    stats: { triangles, edges: edgeCount },
  };
  return { geometry, ctx, stairs, overlaps: ex.overlaps };
}

function floorSpec(levelId: string, ground: boolean): Spec {
  return { id: `${levelId}:floor`, level: levelId, role: 'floor', material: 'floor', ...(ground ? { castsEdges: false } : {}) };
}

/** Balconies and terraces: dark slab with a projecting edge, decking, kerb and rail. */
function buildOutdoorLevels(ctx: Ctx): void {
  for (const lv of ctx.levels) {
    if (lv.index === 0) continue;
    const id = lv.level.id;
    const slab = { id: `${id}:balcony-slab`, level: id, role: 'slab' as const, material: 'slab' as const };

    const rail = { id: `${id}:rail`, level: id, role: 'rail' as const, material: 'metal' as const };
    const parapet = { id: `${id}:parapet`, level: id, role: 'wall' as const, material: 'wall' as const };
    const add = (part: PartSpec, r: Rect, z0: number, z1: number, prio: number, tag = 'outdoor') =>
      ctx.massing.add({ x0: r[0], y0: r[1], x1: r[2], y1: r[3], z0, top: flat(z1), part, prio, tag });
    for (const s of lv.level.spaces.filter((o) => o.outdoor)) {
      const finish: 'paving' | 'gravel' | 'deck' = s.surface === 'paving' ? 'paving' : s.surface === 'gravel' || s.surface === 'lawn' ? 'gravel' : 'deck';
      const deck = { id: `${id}:${finish === 'deck' ? 'deck' : `surface-${finish}`}`, level: id, role: 'deck' as const, material: finish };
      const cells = ctx.cellsOf(lv.index, (o) => o.id === s.id);
      for (const r of ctx.rects(cells)) {
        add(slab, r, lv.elev - OUTDOOR_SLAB, lv.elev, 30);
        // Decking runs under adjoining walls and door thresholds; walls win
        // where they overlap, so no deck edge shows in a doorway.
        const d: Rect = [...r];
        add(deck, d, lv.elev, lv.elev + DECK, 5);
      }
      for (const e of lv.level.edges.filter((o) => o.space === s.id)) {
        const g = edgeGeometry(ctx, lv.index, e);
        const strip = (d0: number, d1: number, ext0: number, ext1: number): Rect => g.rect(d0, d1, ext0, ext1);
        // Projecting slab edge and kerb (full corners where two edges meet).
        const cx = (c: 'rail' | 'wall' | 'open', w: number) => (c === 'rail' ? w : c === 'wall' ? -120 : 0);
        add(slab, strip(0, OUTDOOR_SLAB_OUT, cx(g.ends[0], OUTDOOR_SLAB_OUT), cx(g.ends[1], OUTDOOR_SLAB_OUT)), lv.elev - OUTDOOR_SLAB, lv.elev + KERB_HEIGHT, 30);
        if (e.treatment === 'none') continue;
        const mid = OUTDOOR_SLAB_OUT / 2;
        const ext = (c: 'rail' | 'wall' | 'open') => (c === 'rail' ? mid + RAIL_BAR / 2 : c === 'wall' ? -120 : 0);
        if (e.treatment === 'parapet') {
          add(parapet, strip(0, OUTDOOR_SLAB_OUT, cx(g.ends[0], OUTDOOR_SLAB_OUT), cx(g.ends[1], OUTDOOR_SLAB_OUT)), lv.elev + KERB_HEIGHT, lv.elev + RAIL_HEIGHT, 15);
          add(slab, strip(-25, OUTDOOR_SLAB_OUT + 25, cx(g.ends[0], OUTDOOR_SLAB_OUT + 25), cx(g.ends[1], OUTDOOR_SLAB_OUT + 25)), lv.elev + RAIL_HEIGHT, lv.elev + RAIL_HEIGHT + 60, 30);
          continue;
        }
        // Top rail.
        add(rail, strip(mid - RAIL_BAR / 2, mid + RAIL_BAR / 2, ext(g.ends[0]), ext(g.ends[1])), lv.elev + RAIL_HEIGHT - RAIL_BAR, lv.elev + RAIL_HEIGHT, 40, 'rail');
        const z0 = lv.elev + KERB_HEIGHT, z1 = lv.elev + RAIL_HEIGHT - RAIL_BAR;
        // Panels end on the other edge's panel line at corners, at the wall face at walls.
        const pext = (c: 'rail' | 'wall' | 'open') => (c === 'rail' ? mid : c === 'wall' ? -120 : 0);
        const [a0, a1] = g.span(pext(g.ends[0]), pext(g.ends[1]));
        if (e.treatment === 'glass-rail') {
          const glass = ctx.parts.get({ id: `${id}:balustrade`, level: id, role: 'rail', material: 'balustrade', castsEdges: false });
          // Panels butt against each other (no see-through slits); a slim
          // dark post marks each joint.
          const posts = ctx.parts.get({ id: `${id}:rail-bars`, level: id, role: 'rail', material: 'metal', castsEdges: false });
          const n = Math.max(1, Math.round((a1 - a0) / 1250));
          for (let k = 0; k < n; k++) {
            const p0 = a0 + ((a1 - a0) * k) / n, p1 = a0 + ((a1 - a0) * (k + 1)) / n;
            glass.polygon(g.panel(p0, p1, mid, z0, z1));
            if (k > 0) {
              const r = g.at(p0 - 10, p0 + 10, mid - 10, mid + 10);
              posts.box(r[0], r[1], z0, r[2], r[3], z1);
            }
          }
        } else {
          const bars = ctx.parts.get({ id: `${id}:rail-bars`, level: id, role: 'rail', material: 'metal', castsEdges: false });
          const n = Math.max(1, Math.round((a1 - a0) / BAR_SPACING));
          for (let k = 0; k <= n; k++) {
            const m = a0 + BAR_SIZE / 2 + ((a1 - a0 - BAR_SIZE) * k) / n;
            const r = g.at(m - BAR_SIZE / 2, m + BAR_SIZE / 2, mid - BAR_SIZE / 2, mid + BAR_SIZE / 2);
            bars.box(r[0], r[1], z0, r[2], r[3], z1);
          }
        }
      }
    }
  }
}

/** Local frame of an outdoor edge: along the edge, and outward from the space. */
function edgeGeometry(ctx: Ctx, li: number, e: ResolvedEdge) {
  const vertical = e.orient === 'NS';
  const line = vertical ? e.a[0] : e.a[1];
  const lo = vertical ? Math.min(e.a[1], e.b[1]) : Math.min(e.a[0], e.b[0]);
  const hi = vertical ? Math.max(e.a[1], e.b[1]) : Math.max(e.a[0], e.b[0]);
  const mid = (lo + hi) / 2;
  const probe = (d: number) => (vertical ? ctx.spaceAt(li, line + d, mid) : ctx.spaceAt(li, mid, line + d));
  const out = probe(1)?.id === e.space ? -1 : 1;
  // What continues the boundary beyond each end (for corners).
  const endKind = (t: number, dir: number): 'rail' | 'wall' | 'open' => {
    const at = (a: number, d: number) => (vertical ? ctx.spaceAt(li, line + d, a) : ctx.spaceAt(li, a, line + d));
    const ahead = at(t + dir * 1, -out * 1);
    if (ahead && ahead.id !== e.space && !ahead.outdoor) return 'wall';
    if (ahead && ahead.id === e.space) return 'open';
    const beyond = at(t + dir * 1, out * 1);
    if (beyond) return 'open';
    if (ahead && ahead.outdoor) return 'open';
    // The boundary turns around a convex corner: continues as rail or wall.
    const lv = ctx.levels[li]!;
    const turnsToWall = lv.level.walls.some((w) => w.sides.includes(e.space) && (w.orient === 'NS') !== vertical && Math.abs((vertical ? w.a[1] : w.a[0]) - t) < 0.5);
    return turnsToWall ? 'wall' : 'rail';
  };
  const ends: ['rail' | 'wall' | 'open', 'rail' | 'wall' | 'open'] = [endKind(lo, -1), endKind(hi, 1)];
  const P = (a: number, d: number): [number, number] => (vertical ? [line + out * d, a] : [a, line + out * d]);
  const toRect = (a0: number, a1: number, d0: number, d1: number): Rect => {
    const p = P(a0, d0), q = P(a1, d1);
    return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
  };
  return {
    ends,
    span: (ext0: number, ext1: number): [number, number] => [lo - ext0, hi + ext1],
    rect: (d0: number, d1: number, ext0: number, ext1: number) => toRect(lo - ext0, hi + ext1, d0, d1),
    at: (a0: number, a1: number, d0: number, d1: number) => toRect(a0, a1, d0, d1),
    /** Vertical panel along the edge at distance d, facing outwards. */
    panel: (a0: number, a1: number, d: number, z0: number, z1: number): [number, number, number][] => {
      const p = P(a0, d), q = P(a1, d);
      const pts: [number, number, number][] = [[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]];
      // Counter-clockwise seen from outside.
      const nx = vertical ? out : 0, ny = vertical ? 0 : out;
      const ex = q[0] - p[0], ey = q[1] - p[1];
      // Normal of (p, q, up) is (ey, -ex, 0); flip to face out.
      return ey * nx - ex * ny > 0 ? pts : pts.reverse();
    },
  };
}
