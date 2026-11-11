// Site planting: one deterministic placement of trees, bamboo and grass that
// both the floor plans (`@opensu/plan`, as plant symbols) and the 3D scene
// (`@opensu/kernel`, as entourage) read, so a tree in the plan is a tree in
// 3D and vice versa. Millimetres, model axes. Explicit `entourage` entries
// of the model (tree / shrub / bamboo) replace the rules.
import type { ResolvedHouse, ResolvedSpace, Side } from '@opensu/model';
import { pointInRings, type Rect } from './geom';

export type PlantKind = 'ginkgo' | 'maple-red' | 'maple-green' | 'bamboo' | 'grass';

export interface Plant {
  kind: PlantKind;
  /** Level the plant stands on. */
  level: string;
  /** Outdoor space it stands in (null for explicit placements outside every space). */
  space: string | null;
  x: number;
  y: number;
  /** Overall height, metres (the 3D generator's scale). */
  height: number;
  /** What it stands on: the ground finish of its space, a ground deck, or a planter box on a terrace. */
  base: 'ground' | 'deck' | 'planter';
  /** Planter box (plan rect, mm) for `base: 'planter'`. */
  planter?: Rect;
  /** Seed for the 3D generator. */
  seed: number;
}

/** Plan crown radius (mm) of a plant: what the floor plan draws and furniture avoids. */
export function crownRadius(p: Pick<Plant, 'kind' | 'height'>): number {
  switch (p.kind) {
    case 'ginkgo': return Math.min(2000, 0.24 * p.height * 1000);
    case 'maple-red': case 'maple-green': return Math.min(1500, 0.36 * p.height * 1000);
    case 'bamboo': return 520;
    case 'grass': return Math.max(160, 0.5 * p.height * 1000);
  }
}

/** Ground footprint furniture keeps clear of (trunk, clump or planter). */
export function plantFootprint(p: Plant): Rect {
  if (p.planter) return p.planter;
  const r = p.kind === 'bamboo' ? 480 : p.kind === 'grass' ? crownRadius(p) : 450;
  return { x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r };
}

function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    s ^= s >>> 13;
    return (s >>> 0) / 4294967296;
  };
}

type R4 = [number, number, number, number];

/** Grid cells and their owners per level. */
class SiteGrid {
  readonly xs: number[];
  readonly ys: number[];
  readonly nx: number;
  readonly ny: number;
  readonly owner: (ResolvedSpace | null)[][];

  constructor(readonly house: ResolvedHouse) {
    this.xs = house.grid.x.map((g) => g.pos).sort((a, b) => a - b);
    this.ys = house.grid.y.map((g) => g.pos).sort((a, b) => a - b);
    this.nx = this.xs.length - 1;
    this.ny = this.ys.length - 1;
    this.owner = house.levels.map((level) => {
      const o: (ResolvedSpace | null)[] = new Array(this.nx * this.ny).fill(null);
      for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.ny; j++) {
        const cx = (this.xs[i]! + this.xs[i + 1]!) / 2, cy = (this.ys[j]! + this.ys[j + 1]!) / 2;
        o[i * this.ny + j] = level.spaces.find((s) => pointInRings(s.rings, cx, cy)) ?? null;
      }
      return o;
    });
  }

  spaceAt(li: number, x: number, y: number): ResolvedSpace | null {
    const i = this.xs.findIndex((v, k) => k < this.nx && v <= x && x < this.xs[k + 1]!);
    const j = this.ys.findIndex((v, k) => k < this.ny && v <= y && y < this.ys[k + 1]!);
    return i < 0 || j < 0 ? null : this.owner[li]![i * this.ny + j]!;
  }

  cellsOf(li: number, id: string): number[] {
    const out: number[] = [];
    this.owner[li]!.forEach((s, k) => { if (s?.id === id) out.push(k); });
    return out;
  }

  /** Greedy merge of cells into plan rectangles. */
  rects(cells: Iterable<number>): R4[] {
    const set = new Set(cells);
    const used = new Set<number>();
    const out: R4[] = [];
    for (const k of [...set].sort((a, b) => a - b)) {
      if (used.has(k)) continue;
      const i0 = Math.floor(k / this.ny), j0 = k % this.ny;
      let j1 = j0 + 1;
      while (j1 < this.ny && set.has(i0 * this.ny + j1) && !used.has(i0 * this.ny + j1)) j1++;
      let i1 = i0 + 1;
      for (;;) {
        let ok = true;
        for (let j = j0; j < j1; j++) if (!set.has(i1 * this.ny + j) || used.has(i1 * this.ny + j)) { ok = false; break; }
        if (!ok) break;
        i1++;
      }
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) used.add(i * this.ny + j);
      out.push([this.xs[i0]!, this.ys[j0]!, this.xs[i1]!, this.ys[j1]!]);
    }
    return out;
  }

  /** Largest rectangle of grid cells owned by a space. */
  largestRect(li: number, id: string): R4 | null {
    const own = (i: number, j: number) => this.owner[li]![i * this.ny + j]?.id === id;
    let best: R4 | null = null;
    let bestA = 0;
    for (let i0 = 0; i0 < this.nx; i0++) for (let j0 = 0; j0 < this.ny; j0++) {
      if (!own(i0, j0)) continue;
      for (let i1 = i0; i1 < this.nx && own(i1, j0); i1++) {
        for (let j1 = j0; j1 < this.ny; j1++) {
          let ok = true;
          for (let i = i0; i <= i1 && ok; i++) if (!own(i, j1)) ok = false;
          if (!ok) break;
          const r: R4 = [this.xs[i0]!, this.ys[j0]!, this.xs[i1 + 1]!, this.ys[j1 + 1]!];
          const a = (r[2] - r[0]) * (r[3] - r[1]);
          if (a > bestA) { bestA = a; best = r; }
        }
      }
    }
    return best;
  }
}

/** Seed of a house for the deterministic placement (same hash as the kernel). */
export function houseSeed(house: Pick<ResolvedHouse, 'name'>): number {
  let h = 2166136261;
  for (const ch of house.name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

const cache = new WeakMap<ResolvedHouse, Plant[]>();

/**
 * The planting of a house: a large ginkgo in the most open courtyard or
 * garden (at a sunny corner, away from the fence and off the facade's
 * centre); a green maple in a garden beside the entrance porch; bamboo along
 * fences in strips up to 2 m deep except on the sunny side, where grass keeps
 * the facade free; a red maple in a garden strip in front of large glazing;
 * low maples and grass in larger gardens; a small ginkgo in a planter on the
 * largest terrace.
 */
export function plantSite(house: ResolvedHouse): Plant[] {
  const hit = cache.get(house);
  if (hit) return hit;
  const out = computePlants(house);
  cache.set(house, out);
  return out;
}

function computePlants(house: ResolvedHouse): Plant[] {
  const out: Plant[] = [];
  const g = new SiteGrid(house);
  const rnd = rand(houseSeed(house));
  const site = house.site;
  const gf = house.levels[0]!;
  const put = (kind: PlantKind, level: string, space: ResolvedSpace | null, x: number, y: number, height: number, base: Plant['base'] = 'ground', planter?: Rect) => {
    const p: Plant = { kind, level, space: space?.id ?? null, x, y, height, base: base === 'ground' && space?.surface === 'deck' ? 'deck' : base, seed: Math.floor(rnd() * 1e6) };
    if (planter) p.planter = planter;
    out.push(p);
  };

  const explicit = house.entourage.filter((e) => e.kind === 'tree' || e.kind === 'shrub' || e.kind === 'bamboo');
  if (house.entourage.length) {
    const kinds: Record<string, PlantKind> = { tree: 'ginkgo', shrub: 'maple-green', bamboo: 'bamboo' };
    const heights: Record<string, number> = { tree: 6.5, shrub: 3, bamboo: 3.5 };
    for (const e of explicit) put(kinds[e.kind]!, gf.id, g.spaceAt(0, e.at[0], e.at[1]), e.at[0], e.at[1], heights[e.kind]!);
    return out;
  }

  const covered = (x: number, y: number) =>
    house.roofs.some((r) => pointInRings(r.rings, x, y)) || house.levels.slice(1).some((_, k) => !!g.spaceAt(k + 1, x, y));
  const mainSide: Side = site.latitude >= 0 ? 'S' : 'N';
  const outdoor = gf.spaces.filter((s) => s.outdoor);
  // Horizontal extent of the house (ground floor interior), for keeping the
  // big tree off the facade's centre.
  const interior = gf.spaces.filter((s) => !s.outdoor).flatMap((s) => s.rings.flat());
  const houseMidX = interior.length ? (Math.min(...interior.map((p) => p[0])) + Math.max(...interior.map((p) => p[0]))) / 2 : site.width / 2;

  // 1. A large tree in the most open courtyard / garden (clear sky above).
  const candidates = outdoor
    .filter((s) => s.type === 'courtyard' || s.type === 'garden')
    .map((s) => ({ s, r: g.largestRect(0, s.id) }))
    .filter((c): c is { s: ResolvedSpace; r: R4 } => !!c.r && Math.min(c.r[2] - c.r[0], c.r[3] - c.r[1]) >= 2500)
    .sort((a, b) => (b.r[2] - b.r[0]) * (b.r[3] - b.r[1]) - (a.r[2] - a.r[0]) * (a.r[3] - a.r[1]));
  const big = candidates.find((c) => !covered((c.r[0] + c.r[2]) / 2, (c.r[1] + c.r[3]) / 2));
  let bigTree: [number, number] | null = null;
  if (big) {
    // On the court's open (sunny) side, at the corner away from the plot
    // fence; between equally placed corners the one farther from the
    // middle of the house, so the tree frames the facade instead of hiding it.
    const r = big.r;
    const fenceDist = (x: number, y: number) => Math.min(x, y, site.width - x, site.depth - y);
    const sunny = ([[r[0], r[1], 1, 1], [r[2], r[1], -1, 1], [r[2], r[3], -1, -1], [r[0], r[3], 1, -1]] as const)
      .filter((c) => (mainSide === 'S' ? c[1] === r[1] : c[1] === r[3]));
    const score = (c: readonly number[]) => fenceDist(c[0]!, c[1]!) * 10 + Math.abs(c[0]! - houseMidX) * 1e-3;
    const corner = sunny.reduce((m, c) => (score(c) > score(m) ? c : m));
    const inset = Math.min(900, 0.3 * Math.min(r[2] - r[0], r[3] - r[1]));
    bigTree = [corner[0] + corner[2] * inset, corner[1] + corner[3] * inset];
    put('ginkgo', gf.id, big.s, bigTree[0], bigTree[1], 7.6);
  }

  // 1b. A small green maple in a garden beside the entrance porch.
  const adjacentCells = (a: number[], b: number[]) => a.some((k) => b.some((q) => {
    const i = Math.floor(k / g.ny), j = k % g.ny, i2 = Math.floor(q / g.ny), j2 = q % g.ny;
    return Math.abs(i - i2) + Math.abs(j - j2) === 1;
  }));
  for (const porch of outdoor.filter((o) => o.type === 'porch')) {
    const pc = g.cellsOf(0, porch.id);
    for (const gd of outdoor.filter((o) => o.type === 'garden')) {
      const r = adjacentCells(g.cellsOf(0, gd.id), pc) ? g.largestRect(0, gd.id) : null;
      if (!r) continue;
      const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
      if (!covered(cx, cy)) put('maple-green', gf.id, gd, cx, cy, 3.4);
    }
  }

  // 2. Strips along the fence (gardens and courtyards up to 2 m deep):
  //    bamboo clumps along the fence, clear of gates, the pier and doors,
  //    except on the main (sunny) side, where low grass keeps the facade
  //    free. Garden strips in front of large glazing get a small maple.
  const touches = (r: R4, side: Side) =>
    side === 'S' ? r[1] <= 0 : side === 'N' ? r[3] >= site.depth : side === 'W' ? r[0] <= 0 : r[2] >= site.width;
  const gates = site.fence?.gates ?? [];
  const sideLen = (side: Side) => (side === 'N' || side === 'S' ? site.width : site.depth);
  const gateRange = (gt: (typeof gates)[number]): [number, number] => {
    const len = sideLen(gt.side);
    const lo = gt.at === 'center' ? (len - gt.width) / 2 : gt.at.from === 'start' ? gt.at.offset : len - gt.at.offset - gt.width;
    return [lo, lo + gt.width];
  };
  const mainGate = [...gates].sort((p, q) => q.width - p.width)[0];
  const blockedOn = (side: Side): [number, number][] => [
    ...gates.filter((gt) => gt.side === side).map((gt) => { const [lo, hi] = gateRange(gt); return [lo - 700, hi + 700] as [number, number]; }),
    ...(mainGate && mainGate.side === side ? [[gateRange(mainGate)[0] - 600 - 700, gateRange(mainGate)[0]] as [number, number]] : []),
  ];
  for (const s of outdoor.filter((o) => o.type === 'garden' || o.type === 'courtyard')) {
    const rects = g.rects(g.cellsOf(0, s.id));
    const front = s.type === 'garden' && gf.openings.some((o) => (o.kind === 'sliding-door' || o.width >= 2400) && o.sides.includes(s.id));
    const doorsHere = gf.openings.filter((o) => o.kind !== 'window' && o.sides.includes(s.id));
    for (const r of rects) {
      const w = r[2] - r[0], h = r[3] - r[1];
      if (Math.min(w, h) > 2000) continue;
      const alongX = w >= h;
      const lenR = alongX ? w : h;
      if (front) put('maple-red', gf.id, s, alongX ? r[0] + lenR * 0.7 : (r[0] + r[2]) / 2, alongX ? (r[1] + r[3]) / 2 : r[1] + lenR * 0.7, 2.9);
      const side = (alongX ? (['S', 'N'] as const) : (['W', 'E'] as const)).find((sd) => touches(r, sd));
      if (side && side !== mainSide && !front) {
        const lo = alongX ? r[0] : r[1];
        let free: [number, number][] = [[lo + 300, lo + lenR - 300]];
        const blocks = [...blockedOn(side), ...doorsHere.map((d) => { const c = alongX ? d.center[0] : d.center[1]; return [c - 1200, c + 1200] as [number, number]; })];
        for (const [b0, b1] of blocks) free = free.flatMap(([u, v]) => (b1 <= u || b0 >= v ? [[u, v] as [number, number]] : [[u, b0] as [number, number], [b1, v] as [number, number]].filter(([p, q]) => q - p >= 900)));
        for (const [u, v] of free) {
          const n = Math.max(1, Math.round((v - u) / 1500));
          for (let k = 0; k < n; k++) {
            const t = u + ((v - u) * (k + 0.5)) / n;
            // Off the fence, but not into the house wall across a narrow strip.
            const inset = Math.min(650, (alongX ? h : w) - 450);
            const x = alongX ? t : side === 'W' ? r[0] + inset : r[2] - inset;
            const y = alongX ? (side === 'S' ? r[1] + inset : r[3] - inset) : t;
            put('bamboo', gf.id, s, x, y, 3.2 + rnd() * 0.5);
          }
        }
      } else if (s.type === 'garden') {
        const n = Math.max(2, Math.floor(lenR / 900));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.3 + rnd() * 0.4) / n;
          const x = alongX ? r[0] + w * t : r[0] + w * (0.3 + rnd() * 0.4);
          const y = alongX ? r[1] + h * (0.3 + rnd() * 0.4) : r[1] + h * t;
          put('grass', gf.id, s, x, y, 0.45 + rnd() * 0.15);
        }
      }
    }
  }

  // 3. A small tree in a planter on the largest terrace, in the corner away
  //    from the access door and from the main side.
  let terrace: { li: number; s: ResolvedSpace; r: R4 } | null = null;
  house.levels.forEach((lv, li) => {
    if (li === 0) return;
    for (const s of lv.spaces.filter((o) => o.type === 'terrace')) {
      const r = g.largestRect(li, s.id);
      if (r && (!terrace || (r[2] - r[0]) * (r[3] - r[1]) > (terrace.r[2] - terrace.r[0]) * (terrace.r[3] - terrace.r[1]))) terrace = { li, s, r };
    }
  });
  if (terrace) {
    const { li, r, s } = terrace as { li: number; s: ResolvedSpace; r: R4 };
    const lv = house.levels[li]!;
    const door = lv.openings.find((o) => o.kind !== 'window' && o.sides.includes(s.id));
    const dc = door?.center ?? [r[0], r[1]];
    const corners: [number, number, number, number][] = [[r[0], r[1], 1, 1], [r[2], r[1], -1, 1], [r[2], r[3], -1, -1], [r[0], r[3], 1, -1]];
    const away = corners
      .filter(([, y]) => (mainSide === 'S' ? y > r[1] : y < r[3]))
      // Farthest from the door; between corners about as far, the one farther
      // from the middle of the house (the tree then frames the facade).
      .sort((a, b) => {
        const d = Math.hypot(b[0] - dc[0], b[1] - dc[1]) - Math.hypot(a[0] - dc[0], a[1] - dc[1]);
        return Math.abs(d) > 300 ? d : Math.abs(b[0] - houseMidX) - Math.abs(a[0] - houseMidX);
      })[0]!;
    // Corner on an edge with a rail: keep clear of the kerb; on a wall: of the wall.
    const px = away[0] + away[2] * (away[2] > 0 ? 220 : 100) + away[2] * 500;
    const py = away[1] + away[3] * 100 + away[3] * 400;
    put('ginkgo', lv.id, s, px, py, 2.6, 'planter', { x0: px - 500, y0: py - 400, x1: px + 500, y1: py + 400 });
  }
  void bigTree;
  return out;
}
