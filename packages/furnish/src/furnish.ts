// Furniture placement for one level. Independent of SVG: it returns plain
// placements the plan draws and the 3D interior can reuse.
import type { LevelPlan, SpaceInfo } from './analyse';
import type { Pt, Rect } from './geom';
import { Room } from './engine';
import { furnishRoom } from './rules';
import { crownRadius, plantFootprint, plantSite, type Plant } from './planting';
import type { Placement } from './types';

export type { FurnitureKind, Placement } from './types';
export { footprint, isSolid } from './types';

/** Shared boundary segments between two spaces. */
function sharedSegments(a: SpaceInfo, b: SpaceInfo): [Pt, Pt][] {
  const segs = (rs: readonly Pt[][]) => rs.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]!] as [Pt, Pt]));
  const out: [Pt, Pt][] = [];
  const sb = segs(b.rings);
  for (const [p, q] of segs(a.rings)) {
    for (const [u, v] of sb) {
      if (p[0] === q[0] && u[0] === v[0] && p[0] === u[0]) {
        const lo = Math.max(Math.min(p[1], q[1]), Math.min(u[1], v[1]));
        const hi = Math.min(Math.max(p[1], q[1]), Math.max(u[1], v[1]));
        if (hi - lo > 1) out.push([[p[0], lo], [p[0], hi]]);
      } else if (p[1] === q[1] && u[1] === v[1] && p[1] === u[1]) {
        const lo = Math.max(Math.min(p[0], q[0]), Math.min(u[0], v[0]));
        const hi = Math.min(Math.max(p[0], q[0]), Math.max(u[0], v[0]));
        if (hi - lo > 1) out.push([[lo, p[1]], [hi, p[1]]]);
      }
    }
  }
  return out;
}

const PASSAGE = 750;

/** Zones furniture must leave free on a level, per space. */
export function keepClearZones(plan: LevelPlan, sp: SpaceInfo): Rect[] {
  const zones: Rect[] = [];
  for (const o of plan.openings) zones.push(...o.keepClear);
  for (const st of plan.stairs) zones.push(st.clip);
  for (const g of plan.gates) zones.push(g.zone);
  for (const so of plan.level.slabOpenings) {
    const xs = so.rings.flat().map((p) => p[0]), ys = so.rings.flat().map((p) => p[1]);
    zones.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  }
  // Walking path along open boundaries to circulation (hall, stair) and
  // between interior rooms that are open to each other.
  for (const id of sp.openTo) {
    const o = plan.byId.get(id);
    if (!o) continue;
    const circulation = o.type === 'hall' || o.type === 'stair';
    if (!circulation) continue;
    for (const [p, q] of sharedSegments(sp, o)) {
      // Narrow niches (a vanity nook off a corridor) keep a shallower path.
      if (p[0] === q[0]) {
        const inside = sp.bbox.x0 < p[0] - 1 ? -1 : 1;
        const d = Math.min(PASSAGE, (sp.clear.x1 - sp.clear.x0) * 0.25);
        zones.push({ x0: Math.min(p[0], p[0] + inside * d), x1: Math.max(p[0], p[0] + inside * d), y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) });
      } else {
        const inside = sp.bbox.y0 < p[1] - 1 ? -1 : 1;
        const d = Math.min(PASSAGE, (sp.clear.y1 - sp.clear.y0) * 0.25);
        zones.push({ y0: Math.min(p[1], p[1] + inside * d), y1: Math.max(p[1], p[1] + inside * d), x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]) });
      }
    }
  }
  return zones;
}

const SKIP = new Set(['stair', 'porch']);

/** A plant of the shared site planting as a plan placement (crown size). */
export function plantPlacement(p: Plant, n: number): Placement {
  const kind = p.kind === 'bamboo' ? 'bamboo' : p.kind === 'grass' ? 'grass' : 'tree';
  const dia = 2 * crownRadius(p);
  return {
    id: `${p.space ?? 'site'}:${kind}:${n}`, space: p.space ?? '', kind, x: p.x, y: p.y, w: dia, d: dia, facing: 'S',
    // Plants are fixed by the site planting (the 3D scene shows the same): labels never remove them.
    layer: 'plant', priority: 9, variant: p.kind,
  };
}

export function furnishLevel(plan: LevelPlan): Placement[] {
  const out: Placement[] = [];
  const plants = plantSite(plan.house).filter((p) => p.level === plan.level.id);
  plants.forEach((p, i) => {
    if (p.planter) {
      const r = p.planter;
      out.push({ id: `${p.space ?? 'site'}:planter:${i}`, space: p.space ?? '', kind: 'planter', x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, w: r.x1 - r.x0, d: r.y1 - r.y0, facing: 'S', layer: 'plant', priority: 9 });
    }
    out.push(plantPlacement(p, i));
  });
  for (const sp of plan.spaces) {
    if (SKIP.has(sp.type)) continue;
    if (sp.clear.x1 - sp.clear.x0 < 300 || sp.clear.y1 - sp.clear.y0 < 300) continue;
    const hard = [...plan.openings.flatMap((o) => (o.swing ? [o.swing.box] : [])), ...plan.gates.map((g) => g.zone)];
    const room = new Room(plan, sp, sp.clear, keepClearZones(plan, sp), hard);
    // Furniture keeps clear of trunks, clumps and planters.
    for (const p of plants) if (p.space === sp.id || !p.space) room.solids.push(plantFootprint(p));
    furnishRoom(room, sp);
    out.push(...room.items);
  }
  return out;
}
