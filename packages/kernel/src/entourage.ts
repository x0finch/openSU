// Deterministic entourage placement rules (seeded from the house). Explicit
// `entourage` entries in the model replace the rules entirely.
import type { PartSpec } from './mesh';
import type { ResolvedSpace } from '@opensu/model';
import { DECK, OUTDOOR_SLAB_OUT, PAVING } from './constants';
import type { Ctx, Rect } from './context';
import { flat } from './massing';
import type { EntourageKind, EntouragePlacement } from './types';

const MM = 0.001;

function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    s ^= s >>> 13;
    return (s >>> 0) / 4294967296;
  };
}

/** Largest rectangle of grid cells owned by a space. */
function largestRect(ctx: Ctx, li: number, s: ResolvedSpace): Rect | null {
  const own = (i: number, j: number) => ctx.levels[li]!.owner[i * ctx.ny + j]?.id === s.id;
  let best: Rect | null = null;
  let bestA = 0;
  for (let i0 = 0; i0 < ctx.nx; i0++) for (let j0 = 0; j0 < ctx.ny; j0++) {
    if (!own(i0, j0)) continue;
    for (let i1 = i0; i1 < ctx.nx && own(i1, j0); i1++) {
      for (let j1 = j0; j1 < ctx.ny; j1++) {
        let ok = true;
        for (let i = i0; i <= i1 && ok; i++) if (!own(i, j1)) ok = false;
        if (!ok) break;
        const r: Rect = [ctx.xs[i0]!, ctx.ys[j0]!, ctx.xs[i1 + 1]!, ctx.ys[j1 + 1]!];
        const a = (r[2] - r[0]) * (r[3] - r[1]);
        if (a > bestA) { bestA = a; best = r; }
      }
    }
  }
  return best;
}

export function placeEntourage(ctx: Ctx, covered: (x: number, y: number) => boolean): EntouragePlacement[] {
  const out: EntouragePlacement[] = [];
  const rnd = rand(ctx.seed);
  const put = (kind: EntourageKind, x: number, y: number, z: number, scale: number, rotation = 0) =>
    out.push({ kind, position: [x * MM, y * MM, z * MM], rotation, scale, seed: Math.floor(rnd() * 1e6) });

  const explicit = ctx.house.entourage;
  if (explicit.length) {
    const kinds: Record<string, EntourageKind> = { tree: 'ginkgo', shrub: 'maple-green', bamboo: 'bamboo', car: 'car', person: 'person-walk' };
    const heights: Record<string, number> = { tree: 6.5, shrub: 3, bamboo: 3.5, car: 1, person: 1.7 };
    for (const e of explicit) put(kinds[e.kind]!, e.at[0], e.at[1], 0, heights[e.kind]!, ((e.rotationDeg ?? 0) * Math.PI) / 180);
    return out;
  }

  const site = ctx.house.site;
  const mainSide = site.latitude >= 0 ? 'S' : 'N';
  const gf = ctx.levels[0]!;
  const outdoor = gf.level.spaces.filter((s) => s.outdoor);
  const surface = (s: ResolvedSpace) => gf.elev + PAVING * (s.outdoor ? 1 : 0);

  // 1. A large tree in the most open courtyard / garden (clear sky above).
  const candidates = outdoor
    .filter((s) => s.type === 'courtyard' || s.type === 'garden')
    .map((s) => ({ s, r: largestRect(ctx, 0, s) }))
    .filter((c): c is { s: ResolvedSpace; r: Rect } => !!c.r && Math.min(c.r[2] - c.r[0], c.r[3] - c.r[1]) >= 2500)
    .sort((a, b) => (b.r[2] - b.r[0]) * (b.r[3] - b.r[1]) - (a.r[2] - a.r[0]) * (a.r[3] - a.r[1]));
  const big = candidates.find((c) => !covered((c.r[0] + c.r[2]) / 2, (c.r[1] + c.r[3]) / 2));
  if (big) put('ginkgo', (big.r[0] + big.r[2]) / 2, (big.r[1] + big.r[3]) / 2, surface(big.s), 7.6);

  // 2. Garden strips along the fence: bamboo, except on the main (sunny) side,
  //    where low grass keeps the facade free; front planters get a small maple.
  const touches = (r: Rect, side: string) =>
    side === 'S' ? r[1] <= 0 : side === 'N' ? r[3] >= site.depth : side === 'W' ? r[0] <= 0 : r[2] >= site.width;
  for (const s of outdoor.filter((o) => o.type === 'garden')) {
    const rects = ctx.rects(ctx.cellsOf(0, (o) => o.id === s.id));
    const front = gf.level.openings.some((o) => (o.kind === 'sliding-door' || o.width >= 2400) && o.sides.includes(s.id));
    for (const r of rects) {
      const w = r[2] - r[0], h = r[3] - r[1];
      if (Math.min(w, h) > 2000) continue;
      const alongX = w >= h;
      const lenR = alongX ? w : h;
      const z = surface(s);
      if (front) {
        put('maple-red', alongX ? r[0] + lenR * 0.7 : (r[0] + r[2]) / 2, alongX ? (r[1] + r[3]) / 2 : r[1] + lenR * 0.7, z, 2.9);
      }
      const side = (['S', 'N', 'W', 'E'] as const).find((sd) => touches(r, sd));
      if (side && side !== mainSide && !front) {
        const n = Math.min(4, Math.max(1, Math.floor(lenR / 1600)));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const inset = 650;
          const x = alongX ? r[0] + w * t : side === 'W' ? r[0] + inset : r[2] - inset;
          const y = alongX ? (side === 'S' ? r[1] + inset : r[3] - inset) : r[1] + h * t;
          put('bamboo', x, y, z, 3.2 + rnd() * 0.5);
        }
      } else {
        const n = Math.max(2, Math.floor(lenR / 900));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.3 + rnd() * 0.4) / n;
          const x = alongX ? r[0] + w * t : r[0] + w * (0.3 + rnd() * 0.4);
          const y = alongX ? r[1] + h * (0.3 + rnd() * 0.4) : r[1] + h * t;
          put('grass', x, y, z, 0.45 + rnd() * 0.15);
        }
      }
    }
  }

  // 3. A small tree in a planter on the largest terrace, in the corner away
  //    from the access door and from the main side; a runner on the deck.
  let terrace: { li: number; s: ResolvedSpace; r: Rect } | null = null;
  for (const lv of ctx.levels.slice(1)) {
    for (const s of lv.level.spaces.filter((o) => o.type === 'terrace')) {
      const r = largestRect(ctx, lv.index, s);
      if (r && (!terrace || (r[2] - r[0]) * (r[3] - r[1]) > (terrace.r[2] - terrace.r[0]) * (terrace.r[3] - terrace.r[1]))) terrace = { li: lv.index, s, r };
    }
  }
  if (terrace) {
    const lv = ctx.levels[terrace.li]!;
    const { r, s } = terrace;
    const door = lv.level.openings.find((o) => o.kind !== 'window' && o.sides.includes(s.id));
    const dc = door?.center ?? [r[0], r[1]];
    const corners: [number, number, number, number][] = [[r[0], r[1], 1, 1], [r[2], r[1], -1, 1], [r[2], r[3], -1, -1], [r[0], r[3], 1, -1]];
    const away = corners
      .filter(([, y]) => (mainSide === 'S' ? y > r[1] : y < r[3]))
      .sort((a, b) => Math.hypot(b[0] - dc[0], b[1] - dc[1]) - Math.hypot(a[0] - dc[0], a[1] - dc[1]))[0]!;
    // Corner on an edge with a rail: keep clear of the kerb; on a wall: of the wall.
    const px = away[0] + away[2] * (away[2] > 0 ? 220 : 100) + away[2] * 500;
    const py = away[1] + away[3] * 100 + away[3] * 400;
    const z = lv.elev + DECK;
    planter(ctx, lv.level.id, px - 500, py - 400, px + 500, py + 400, z);
    put('ginkgo', px, py, z + 380, 2.6);
    put('person-run', (r[0] + r[2]) / 2 - (r[2] - r[0]) * 0.1, (r[1] + r[3]) / 2 - (r[3] - r[1]) * 0.1, z, 1.72, Math.PI * 0.15);
    void OUTDOOR_SLAB_OUT;
  }

  // 4. A person at the main entrance (door onto a porch, else the widest exterior door).
  const doors = gf.level.openings.filter((o) => (o.kind === 'door' || o.kind === 'sliding-door') && o.wall && gf.level.walls.find((w) => w.id === o.wall)?.exterior);
  const spaceOf = (id: string | null) => (id ? gf.level.spaces.find((s) => s.id === id) ?? null : null);
  const entry = doors.find((o) => o.sides.some((id) => spaceOf(id)?.type === 'porch')) ?? [...doors].sort((a, b) => b.width - a.width)[0];
  if (entry) {
    const k = entry.sides.findIndex((id) => !spaceOf(id) || spaceOf(id)!.outdoor);
    const sgn = k === 0 ? -1 : 1;
    const [cx, cy] = entry.center;
    const d = 1300;
    const x = entry.orient === 'NS' ? cx + sgn * d : cx + 500;
    const y = entry.orient === 'NS' ? cy + 500 : cy + sgn * d;
    put('person-walk', x, y, gf.elev + PAVING, 1.7, entry.orient === 'NS' ? 0 : Math.PI / 2);
  }

  // 5. A car in each carport, along its long axis, nose to the nearer gate.
  for (const s of outdoor.filter((o) => o.type === 'carport')) {
    const r = largestRect(ctx, 0, s);
    if (!r) continue;
    const alongX = r[2] - r[0] >= r[3] - r[1];
    let cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
    const gate = site.fence?.gates.find((g) => (alongX ? g.side === 'E' || g.side === 'W' : g.side === 'N' || g.side === 'S'));
    let rot = alongX ? 0 : Math.PI / 2;
    if (gate) {
      const toward = gate.side === 'E' || gate.side === 'N' ? 1 : -1;
      if (alongX) cx += toward * 500; else cy += toward * 500;
      if (toward < 0) rot += Math.PI;
    }
    put('car', cx, cy, gf.elev + PAVING, 1, rot);
  }
  void flat;
  return out;
}

/** A planter box (thin dark walls, soil fill) in the massing. */
function planter(ctx: Ctx, levelId: string, x0: number, y0: number, x1: number, y1: number, z: number): void {
  const box = { id: `${levelId}:planter`, level: levelId, role: 'planter' as const, material: 'slab' as const };
  const soil = { id: `${levelId}:planter-soil`, level: levelId, role: 'planter' as const, material: 'soil' as const };
  const t = 60, h = 420;
  const add = (part: PartSpec, a: number, b: number, c: number, d: number, top: number, prio: number) =>
    ctx.massing.add({ x0: a, y0: b, x1: c, y1: d, z0: z, top: flat(z + top), part, prio, tag: 'planter' });
  add(box, x0, y0, x1, y0 + t, h, 30);
  add(box, x0, y1 - t, x1, y1, h, 30);
  add(box, x0, y0 + t, x0 + t, y1 - t, h, 30);
  add(box, x1 - t, y0 + t, x1, y1 - t, h, 30);
  add(soil, x0 + t, y0 + t, x1 - t, y1 - t, h - 40, 25);
}
